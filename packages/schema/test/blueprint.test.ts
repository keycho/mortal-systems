import { describe, expect, it } from "vitest";
import {
  blueprintManifestSchema,
  urlContainsPunycode,
  type BlueprintManifest,
} from "../src/blueprint.js";

/** the canonical example from the foundation document */
function investigatorBlueprint(): BlueprintManifest {
  return {
    schemaVersion: "2.0",
    blueprintVersion: "1.0.0",
    name: "Onchain Investigator",
    description: "an isolated, time-limited environment for onchain research.",
    category: "research",
    recommendedLifetime: "12h",
    theme: "#C8FF4D",
    lifecycle: { onExpiry: "destroy" },
    bookmarks: [
      { title: "Solscan", url: "https://solscan.io" },
      { title: "Birdeye", url: "https://birdeye.so" },
      { title: "Dexscreener", url: "https://dexscreener.com" },
      { title: "Etherscan", url: "https://etherscan.io" },
    ],
    ai: {
      systemInstructions:
        "act as a cautious onchain investigator. separate verified onchain evidence from inference. cite tx hashes and addresses for every claim.",
    },
    permissions: {
      wallet: { value: "none", enforcement: "advisory" },
      network: { value: "standard", enforcement: "advisory" },
      email: { value: "none", enforcement: "roadmap" },
    },
    privacy: { retainHistory: { value: false, enforcement: "enforced" } },
    publisher: { id: "mortal.first-party", reviewTier: "standard" },
  };
}

describe("blueprint schema", () => {
  it("accepts the canonical onchain-investigator example", () => {
    const r = blueprintManifestSchema.safeParse(investigatorBlueprint());
    expect(r.success, JSON.stringify(!r.success ? r.error.issues : null)).toBe(true);
  });

  it("makes banned content structurally impossible: unknown keys reject at every level", () => {
    const base = investigatorBlueprint();
    const smuggles: Record<string, unknown>[] = [
      { ...base, cookies: [{ domain: ".x.com", value: "session=abc" }] },
      { ...base, sessions: { "x.com": "token" } },
      { ...base, passwords: [{ site: "x.com", password: "hunter2" }] },
      { ...base, seedPhrase: "abandon abandon abandon" },
      { ...base, apiKeys: { openai: "sk-123" } },
      { ...base, localStorage: { "x.com": { k: "v" } } },
      { ...base, accounts: [{ email: "a@b.c" }] },
      { ...base, ai: { systemInstructions: "x", apiKey: "sk-live" } },
      { ...base, permissions: { ...base.permissions, cookieJar: { value: "all" } } },
      {
        ...base,
        bookmarks: [{ title: "x", url: "https://x.com", session: "tok" }],
      },
    ];
    for (const [i, bad] of smuggles.entries()) {
      const r = blueprintManifestSchema.safeParse(bad);
      expect(r.success, `smuggle corpus #${i} must be rejected`).toBe(false);
    }
  });

  it("rejects over-claiming enforcement in blueprint permissions", () => {
    const base = investigatorBlueprint();
    const bad = {
      ...base,
      permissions: {
        ...base.permissions,
        wallet: { value: "none", enforcement: "enforced" },
      },
    };
    expect(blueprintManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-http(s) and credentialed urls", () => {
    const base = investigatorBlueprint();
    const badUrls = [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "https://user:pass@example.com/",
      "relative/path",
    ];
    for (const url of badUrls) {
      const bad = { ...base, bookmarks: [{ title: "x", url }] };
      expect(blueprintManifestSchema.safeParse(bad).success, `url "${url}" must be rejected`).toBe(
        false
      );
    }
  });

  it("surfaces punycode hosts for user review", () => {
    expect(urlContainsPunycode("https://xn--pple-43d.com/login")).toBe(true);
    expect(urlContainsPunycode("https://apple.com/login")).toBe(false);
  });

  it("requires extension recommendations to be web store ids, never paths or urls", () => {
    const base = investigatorBlueprint();
    const good = {
      ...base,
      recommendedExtensions: [
        { id: "nkbihfbeogaeaoehlefnkodbefgpgknn", name: "MetaMask" },
      ],
    };
    expect(blueprintManifestSchema.safeParse(good).success).toBe(true);

    for (const id of ["/tmp/ext", "https://evil.example/ext.crx", "short"]) {
      const bad = { ...base, recommendedExtensions: [{ id, name: "x" }] };
      expect(blueprintManifestSchema.safeParse(bad).success, `id "${id}" must be rejected`).toBe(
        false
      );
    }
  });

  it("rejects onExpiry destroy with a persistent recommendedLifetime", () => {
    const base = investigatorBlueprint();
    const bad = {
      ...base,
      recommendedLifetime: "persistent",
      lifecycle: { onExpiry: "destroy" },
    };
    expect(blueprintManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a bad recommendedLifetime", () => {
    const bad = { ...investigatorBlueprint(), recommendedLifetime: "forever" };
    expect(blueprintManifestSchema.safeParse(bad).success).toBe(false);
  });
});
