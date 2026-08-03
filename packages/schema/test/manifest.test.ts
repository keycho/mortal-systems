import { describe, expect, it } from "vitest";
import {
  identityManifestSchema,
  relativePathSchema,
  tombstoneSchema,
  type IdentityManifest,
} from "../src/manifest.js";
import { composeManifest } from "../src/compose.js";

const NOW = "2026-08-03T12:00:00.000Z";

function validManifest(): IdentityManifest {
  return composeManifest({
    id: "idn_abc123def456ghi789jkl",
    name: "client acme",
    createdAt: NOW,
    color: "#F59E0B",
    lifetime: "persistent",
  });
}

function temporaryManifest(): IdentityManifest {
  return composeManifest({
    id: "idn_abc123def456ghi789jkl",
    name: "onchain investigator",
    createdAt: NOW,
    color: "#C8FF4D",
    lifetime: "5m",
    onExpiry: "destroy",
    retainHistory: false,
  });
}

describe("identity manifest invariants", () => {
  it("accepts a valid persistent manifest", () => {
    expect(identityManifestSchema.safeParse(validManifest()).success).toBe(true);
  });

  it("accepts a valid temporary manifest", () => {
    expect(identityManifestSchema.safeParse(temporaryManifest()).success).toBe(true);
  });

  it("rejects unknown keys at the top level", () => {
    const m = { ...validManifest(), cookies: [{ domain: "x.com", value: "abc" }] };
    const r = identityManifestSchema.safeParse(m);
    expect(r.success).toBe(false);
  });

  it("rejects unknown keys in nested objects", () => {
    const m = validManifest();
    const r = identityManifestSchema.safeParse({
      ...m,
      lifecycle: { ...m.lifecycle, sessionData: "smuggled" },
    });
    expect(r.success).toBe(false);
  });

  it("makes wallet enforcement=enforced unrepresentable", () => {
    const m = validManifest();
    const r = identityManifestSchema.safeParse({
      ...m,
      permissions: {
        ...m.permissions,
        wallet: { value: "none", enforcement: "enforced" },
      },
    });
    expect(r.success).toBe(false);
  });

  it("makes email enforcement stronger than roadmap unrepresentable", () => {
    const m = validManifest();
    for (const enforcement of ["advisory", "enforced"]) {
      const r = identityManifestSchema.safeParse({
        ...m,
        permissions: {
          ...m.permissions,
          email: { value: "none", enforcement },
        },
      });
      expect(r.success, `email enforcement "${enforcement}" must be rejected`).toBe(false);
    }
  });

  it("forbids weakening filesystem/memoryScope below enforced", () => {
    const m = validManifest();
    const r = identityManifestSchema.safeParse({
      ...m,
      permissions: {
        ...m.permissions,
        filesystem: { value: "identity-partition-only", enforcement: "advisory" },
      },
    });
    expect(r.success).toBe(false);
  });

  it("requires expiresAt null iff persistent (both directions)", () => {
    const persistent = validManifest();
    const withExpiry = {
      ...persistent,
      lifecycle: { ...persistent.lifecycle, expiresAt: "2026-08-04T12:00:00.000Z" },
    };
    expect(identityManifestSchema.safeParse(withExpiry).success).toBe(false);

    const temp = temporaryManifest();
    const withoutExpiry = {
      ...temp,
      lifecycle: { ...temp.lifecycle, expiresAt: null },
    };
    expect(identityManifestSchema.safeParse(withoutExpiry).success).toBe(false);
  });

  it("rejects onExpiry destroy on a persistent lifetime", () => {
    const m = validManifest();
    const r = identityManifestSchema.safeParse({
      ...m,
      lifecycle: { ...m.lifecycle, onExpiry: "destroy" },
    });
    expect(r.success).toBe(false);
  });

  it("requires the mortal-companion extension ref", () => {
    const m = validManifest();
    const r = identityManifestSchema.safeParse({
      ...m,
      surfaces: {
        ...m.surfaces,
        browser: { ...m.surfaces.browser, extensions: [] },
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-webstore extension refs (paths, urls)", () => {
    const m = validManifest();
    for (const bad of ["/tmp/evil-extension", "https://example.com/ext.crx", "not32chars"]) {
      const r = identityManifestSchema.safeParse({
        ...m,
        surfaces: {
          ...m.surfaces,
          browser: { ...m.surfaces.browser, extensions: ["mortal-companion", bad] },
        },
      });
      expect(r.success, `extension ref "${bad}" must be rejected`).toBe(false);
    }
  });

  it("rejects invalid colors and states", () => {
    const m = validManifest();
    expect(identityManifestSchema.safeParse({ ...m, color: "red" }).success).toBe(false);
    expect(
      identityManifestSchema.safeParse({
        ...m,
        lifecycle: { ...m.lifecycle, state: "zombie" },
      }).success
    ).toBe(false);
  });
});

describe("relative path safety", () => {
  it("accepts runtime-root-relative paths", () => {
    expect(relativePathSchema.safeParse("profiles/idn_abc").success).toBe(true);
    expect(relativePathSchema.safeParse("files/idn_abc/downloads").success).toBe(true);
  });

  it("rejects absolute, traversal, and windows-drive paths", () => {
    for (const bad of [
      "/etc/passwd",
      "\\\\server\\share",
      "C:/Users/x",
      "c:\\windows",
      "profiles/../..",
      "../outside",
      "profiles/..",
      "~/mortal",
      "profiles//idn_x",
      "profiles/\0x",
    ]) {
      expect(relativePathSchema.safeParse(bad).success, `should reject "${bad}"`).toBe(false);
    }
  });
});

describe("tombstone", () => {
  it("accepts exactly {id, name, destroyedAt}", () => {
    expect(
      tombstoneSchema.safeParse({
        id: "idn_abc123def456ghi789jkl",
        name: "gone",
        destroyedAt: NOW,
      }).success
    ).toBe(true);
    expect(
      tombstoneSchema.safeParse({
        id: "idn_abc123def456ghi789jkl",
        name: "gone",
        destroyedAt: NOW,
        manifest: {},
      }).success
    ).toBe(false);
  });
});
