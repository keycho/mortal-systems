import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  blueprintManifestSchema,
  BLUEPRINT_MAX_BYTES,
  identityManifestSchema,
} from "@liminal/schema";
import {
  clientOperations,
  cryptoOperations,
  onchainInvestigator,
} from "@liminal/blueprints";
import { LiminalRuntime } from "../src/runtime.js";
import { provisionIdentity } from "../src/launcher/provision.js";
import { RuntimeError } from "../src/errors.js";

let runtime: LiminalRuntime;
let root: string;

const json = (v: unknown) => JSON.stringify(v);

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "liminal-bp-"));
  runtime = await LiminalRuntime.start({ root, noServer: true, scheduler: { tickMs: 60_000 } });
});

afterAll(async () => {
  await runtime?.stop();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe("import pipeline rejections (G17 shape)", () => {
  it("rejects oversized blueprints at the 256kb size gate", () => {
    const fat = {
      ...onchainInvestigator,
      notes: Array.from({ length: 10 }, (_, i) => ({
        title: `pad ${i}`,
        bodyMd: "x".repeat(19_999),
      })),
      bookmarks: Array.from({ length: 40 }, (_, i) => ({
        title: `pad ${i}`,
        url: `https://example.com/${"y".repeat(1_900)}`,
      })),
    };
    const raw = json(fat);
    expect(Buffer.byteLength(raw)).toBeGreaterThan(BLUEPRINT_MAX_BYTES);
    const verdict = runtime.blueprints.validate(raw);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors[0]?.message).toContain("size gate");
  });

  it("rejects malformed json with a clear error", () => {
    const verdict = runtime.blueprints.validate("{not json");
    expect(verdict.ok).toBe(false);
    expect(verdict.errors[0]?.message).toContain("not valid json");
  });

  it("rejects banned/unknown fields with field-level paths", () => {
    const corpus: Array<[string, unknown]> = [
      ["cookies", { ...onchainInvestigator, cookies: [{ domain: ".x.com", value: "s" }] }],
      ["seedPhrase", { ...onchainInvestigator, seedPhrase: "abandon abandon" }],
      ["nested apiKey", { ...onchainInvestigator, ai: { systemInstructions: "x", apiKey: "sk" } }],
      ["javascript url", { ...onchainInvestigator, bookmarks: [{ title: "x", url: "javascript:alert(1)" }] }],
      ["creds in url", { ...onchainInvestigator, bookmarks: [{ title: "x", url: "https://u:p@x.io" }] }],
      ["extension path ref", { ...onchainInvestigator, recommendedExtensions: [{ id: "/tmp/ext", name: "x" }] }],
      ["over-claimed wallet", {
        ...onchainInvestigator,
        permissions: { wallet: { value: "none", enforcement: "enforced" } },
      }],
    ];
    for (const [label, bad] of corpus) {
      const verdict = runtime.blueprints.validate(json(bad));
      expect(verdict.ok, `${label} must be rejected`).toBe(false);
      expect(verdict.errors.length, `${label} carries issues`).toBeGreaterThan(0);
    }
  });

  it("install refuses what validate refuses", () => {
    expect(() =>
      runtime.blueprints.install({
        manifestJson: json({ ...onchainInvestigator, passwords: [] }),
        source: "test",
      })
    ).toThrowError(RuntimeError);
  });
});

describe("install and createFromBlueprint", () => {
  let investigatorId = "";
  let clientOpsId = "";
  let cryptoId = "";

  it("installs the three first-party blueprints; reinstall is idempotent", () => {
    investigatorId = runtime.blueprints.install({
      manifestJson: json(onchainInvestigator),
      source: "first-party:onchain-investigator",
    }).blueprintId;
    clientOpsId = runtime.blueprints.install({
      manifestJson: json(clientOperations),
      source: "first-party:client-operations",
    }).blueprintId;
    cryptoId = runtime.blueprints.install({
      manifestJson: json(cryptoOperations),
      source: "first-party:crypto-operations",
    }).blueprintId;

    const again = runtime.blueprints.install({
      manifestJson: json(onchainInvestigator),
      source: "first-party:onchain-investigator",
    });
    expect(again.blueprintId).toBe(investigatorId);

    const list = runtime.blueprints.list();
    expect(list).toHaveLength(3);
    expect(list.every((b) => b.signed === false)).toBe(true); // unsigned badge territory
    expect(list.every((b) => b.reviewTier === "standard")).toBe(true);
  });

  it("creates the investigator with the 5m demo override: manifest, bookmarks, expiry job", () => {
    const summary = runtime.blueprints.createIdentity({
      blueprintId: investigatorId,
      overrides: { lifetime: "5m" },
    });
    expect(summary.name).toBe("Onchain Investigator");
    expect(summary.color).toBe("#C8FF4D");
    expect(summary.lifetime).toBe("5m");
    expect(summary.onExpiry).toBe("destroy");
    expect(summary.blueprint?.version).toBe("1.0.0");

    const { manifest } = runtime.identities.get(summary.id);
    expect(manifest).not.toBeNull();
    expect(identityManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest!.privacy.retainHistory.value).toBe(false);
    expect(manifest!.permissions.wallet).toEqual({ value: "none", enforcement: "advisory" });
    // no extensions beyond the companion without explicit consent
    expect(manifest!.surfaces.browser.extensions).toEqual(["liminal-companion"]);

    const bookmarks = runtime.repo.listBookmarks(summary.id);
    expect(bookmarks.map((b) => b.title)).toEqual(["Solscan", "Birdeye", "Dexscreener", "Etherscan"]);

    const jobs = runtime.repo.duePendingJobs(new Date(Date.now() + 6 * 60_000).toISOString());
    expect(jobs.some((j) => j.identity_id === summary.id && j.action === "destroy")).toBe(true);

    const events = runtime.readActivity(summary.id).map((e) => e.event);
    expect(events).toContain("blueprint_installed");
    expect(events).toContain("expiry_scheduled");
  });

  it("consented store extensions are declared; unconsented never are", () => {
    const withConsent = runtime.blueprints.createIdentity({
      blueprintId: cryptoId,
      overrides: { consentedExtensionIds: ["nkbihfbeogaeaoehlefnkodbefgpgknn"] },
    });
    const { manifest } = runtime.identities.get(withConsent.id);
    expect(manifest!.surfaces.browser.extensions).toEqual([
      "liminal-companion",
      "nkbihfbeogaeaoehlefnkodbefgpgknn",
    ]);

    const withoutConsent = runtime.blueprints.createIdentity({ blueprintId: cryptoId });
    expect(
      runtime.identities.get(withoutConsent.id).manifest!.surfaces.browser.extensions
    ).toEqual(["liminal-companion"]);
  });

  it("client operations: persistent (no job), notes template seeded, empty folders provisioned", () => {
    const summary = runtime.blueprints.createIdentity({ blueprintId: clientOpsId });
    expect(summary.lifetime).toBe("persistent");
    expect(summary.expiresAt).toBeNull();

    const notes = runtime.repo.listNotes(summary.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe("meeting notes");

    const jobs = runtime.repo.db
      .prepare("SELECT * FROM lifecycle_jobs WHERE identity_id = ?")
      .all(summary.id);
    expect(jobs).toHaveLength(0);

    // provisioning writes the empty client folders into chrome's bookmarks file
    const { manifest } = runtime.identities.get(summary.id);
    provisionIdentity(runtime.root, runtime.repo, manifest!);
    const bookmarksFile = JSON.parse(
      fs.readFileSync(path.join(runtime.root, "profiles", summary.id, "Default", "Bookmarks"), "utf8")
    ) as { roots: { bookmark_bar: { children: Array<{ name: string; type: string; children?: unknown[] }> } } };
    const folderNames = bookmarksFile.roots.bookmark_bar.children
      .filter((n) => n.type === "folder")
      .map((n) => n.name);
    expect(folderNames).toEqual(["client docs", "deliverables", "meetings"]);
  });

  it("rejects overrides that produce an invalid manifest", () => {
    expect(() =>
      runtime.blueprints.createIdentity({
        blueprintId: investigatorId,
        overrides: { lifetime: "2s" },
      })
    ).toThrowError(RuntimeError);
  });
});

describe("export strips runtime state and round-trips", () => {
  it("exported blueprint validates, carries config, and contains nothing session-like", () => {
    const source = runtime.blueprints.createIdentity({
      blueprintId: runtime.blueprints.list().find((b) => b.name === "Onchain Investigator")!.id,
      overrides: { lifetime: "12h" },
    });
    // simulate session state that must never leave
    runtime.repo.insertNote({
      id: "not_secret000000000000000",
      identityId: source.id,
      title: "case notes",
      bodyMd: "wallet 0xabc is suspicious",
      updatedAt: new Date().toISOString(),
    });

    const { manifestJson } = runtime.blueprints.export(source.id);
    const exported = blueprintManifestSchema.parse(JSON.parse(manifestJson));

    expect(exported.name).toBe("Onchain Investigator");
    expect(exported.recommendedLifetime).toBe("12h");
    expect(exported.privacy?.retainHistory.value).toBe(false);
    expect(exported.bookmarks).toHaveLength(4);
    expect(exported.publisher).toEqual({ id: null, reviewTier: null });

    // nothing runtime- or session-shaped leaves
    expect(manifestJson).not.toContain("idn_");
    expect(manifestJson).not.toContain("profiles/");
    expect(manifestJson).not.toContain("files/");
    expect(manifestJson).not.toContain("createdAt");
    expect(manifestJson).not.toContain("expiresAt");
    expect(manifestJson).not.toContain("suspicious");
    expect(manifestJson).not.toContain("case notes");

    // and the export re-imports cleanly (bumped name to avoid the idempotent dedupe)
    const reinstall = runtime.blueprints.install({
      manifestJson: JSON.stringify({ ...exported, name: "Investigator (reimported)" }),
      source: "export-roundtrip",
    });
    const clone = runtime.blueprints.createIdentity({ blueprintId: reinstall.blueprintId });
    expect(runtime.identities.get(clone.id).manifest!.privacy.retainHistory.value).toBe(false);
  });

  it("refuses to export a destroyed identity", async () => {
    const doomed = runtime.blueprints.createIdentity({
      blueprintId: runtime.blueprints.list()[0]!.id,
    });
    await runtime.destroyIdentity(doomed.id);
    expect(() => runtime.blueprints.export(doomed.id)).toThrowError(RuntimeError);
  });
});
