import { describe, expect, it } from "vitest";
import { composeManifest, manifestInputFromBlueprint } from "../src/compose.js";
import { blueprintManifestSchema } from "../src/blueprint.js";
import { generateBlueprintId, generateIdentityId, generateToken } from "../src/ids.js";
import { identityManifestSchema } from "../src/manifest.js";

const NOW = "2026-08-03T12:00:00.000Z";

describe("composeManifest", () => {
  it("produces a schema-valid persistent manifest with sane defaults", () => {
    const id = generateIdentityId();
    const m = composeManifest({ id, name: "client acme", createdAt: NOW });
    expect(m.lifecycle.lifetime).toBe("persistent");
    expect(m.lifecycle.expiresAt).toBeNull();
    expect(m.lifecycle.onExpiry).toBe("archive");
    expect(m.surfaces.browser.profilePath).toBe(`profiles/${id}`);
    expect(m.surfaces.files.root).toBe(`files/${id}`);
    expect(m.surfaces.browser.extensions).toContain("liminal-companion");
    expect(m.privacy.retainHistory.value).toBe(true);
    expect(identityManifestSchema.safeParse(m).success).toBe(true);
  });

  it("computes expiresAt for finite lifetimes and defaults onExpiry to destroy", () => {
    const m = composeManifest({
      id: generateIdentityId(),
      name: "investigator",
      createdAt: NOW,
      lifetime: "5m",
    });
    expect(m.lifecycle.expiresAt).toBe("2026-08-03T12:05:00.000Z");
    expect(m.lifecycle.onExpiry).toBe("destroy");
  });

  it("throws on invalid input rather than emitting an invalid manifest", () => {
    expect(() =>
      composeManifest({ id: "bogus", name: "x", createdAt: NOW })
    ).toThrow();
    expect(() =>
      composeManifest({
        id: generateIdentityId(),
        name: "x",
        createdAt: NOW,
        lifetime: "2s",
      })
    ).toThrow();
  });
});

describe("manifestInputFromBlueprint", () => {
  const bp = blueprintManifestSchema.parse({
    schemaVersion: "2.0",
    blueprintVersion: "1.0.0",
    name: "Onchain Investigator",
    description: "isolated, time-limited environment for onchain research.",
    category: "research",
    recommendedLifetime: "12h",
    theme: "#C8FF4D",
    lifecycle: { onExpiry: "destroy" },
    ai: { systemInstructions: "cautious investigator." },
    permissions: { wallet: { value: "none", enforcement: "advisory" } },
    privacy: { retainHistory: { value: false, enforcement: "enforced" } },
    publisher: { id: "liminal.first-party", reviewTier: "standard" },
    recommendedExtensions: [{ id: "nkbihfbeogaeaoehlefnkodbefgpgknn", name: "MetaMask" }],
  });

  it("maps blueprint fields and applies overrides", () => {
    const id = generateIdentityId();
    const input = manifestInputFromBlueprint(bp, {
      id,
      createdAt: NOW,
      source: "first-party:onchain-investigator",
      signature: null,
      overrides: { lifetime: "5m" },
    });
    const m = composeManifest(input);
    expect(m.name).toBe("Onchain Investigator");
    expect(m.color).toBe("#C8FF4D");
    expect(m.lifecycle.lifetime).toBe("5m");
    expect(m.lifecycle.onExpiry).toBe("destroy");
    expect(m.privacy.retainHistory.value).toBe(false);
    expect(m.permissions.wallet.value).toBe("none");
    expect(m.blueprint.source).toBe("first-party:onchain-investigator");
    expect(m.blueprint.version).toBe("1.0.0");
  });

  it("never carries recommended extensions without explicit consent", () => {
    const noConsent = composeManifest(
      manifestInputFromBlueprint(bp, {
        id: generateIdentityId(),
        createdAt: NOW,
        source: "s",
        signature: null,
      })
    );
    expect(noConsent.surfaces.browser.extensions).toEqual(["liminal-companion"]);

    const consented = composeManifest(
      manifestInputFromBlueprint(bp, {
        id: generateIdentityId(),
        createdAt: NOW,
        source: "s",
        signature: null,
        overrides: { consentedExtensionIds: ["nkbihfbeogaeaoehlefnkodbefgpgknn"] },
      })
    );
    expect(consented.surfaces.browser.extensions).toEqual([
      "liminal-companion",
      "nkbihfbeogaeaoehlefnkodbefgpgknn",
    ]);
  });
});

describe("ids", () => {
  it("generates well-formed ids and tokens", () => {
    expect(generateIdentityId()).toMatch(/^idn_[A-Za-z0-9_-]{21}$/);
    expect(generateBlueprintId()).toMatch(/^bpt_[A-Za-z0-9_-]{21}$/);
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(generateToken());
  });
});
