import { describe, expect, it } from "vitest";
import { blueprintManifestSchema } from "@mortal/schema";
import {
  clientOperations,
  cryptoOperations,
  FIRST_PARTY_BLUEPRINTS,
  onchainInvestigator,
} from "../src/index.js";

describe("first-party blueprints", () => {
  it("all three validate against the blueprint schema", () => {
    for (const blueprint of FIRST_PARTY_BLUEPRINTS) {
      const result = blueprintManifestSchema.safeParse(blueprint);
      expect(result.success, `${blueprint.name}: ${JSON.stringify(!result.success ? result.error.issues : null)}`).toBe(true);
    }
  });

  it("onchain investigator: 12h destroy, no history retention, wallet none", () => {
    expect(onchainInvestigator.recommendedLifetime).toBe("12h");
    expect(onchainInvestigator.lifecycle?.onExpiry).toBe("destroy");
    expect(onchainInvestigator.privacy?.retainHistory.value).toBe(false);
    expect(onchainInvestigator.permissions?.wallet?.value).toBe("none");
    expect(onchainInvestigator.theme).toBe("#C8FF4D");
    expect(onchainInvestigator.bookmarks?.map((b) => b.title)).toEqual([
      "Solscan",
      "Birdeye",
      "Dexscreener",
      "Etherscan",
    ]);
  });

  it("client operations: persistent, meeting-notes template, empty client folders", () => {
    expect(clientOperations.recommendedLifetime).toBe("persistent");
    expect(clientOperations.notes?.[0]?.title).toBe("meeting notes");
    expect(clientOperations.bookmarkFolders?.length).toBeGreaterThan(0);
    expect(clientOperations.ai?.systemInstructions).toContain("never reference other clients");
  });

  it("crypto operations: declared wallet with the prominent disclaimer, store-id-only extensions", () => {
    expect(cryptoOperations.permissions?.wallet?.value).toBe("declared");
    expect(cryptoOperations.description).toContain("not a technical control");
    const ids = cryptoOperations.recommendedExtensions?.map((e) => e.id);
    expect(ids).toContain("nkbihfbeogaeaoehlefnkodbefgpgknn"); // metamask
    expect(ids).toContain("bfnaelmomeimhlpmgjnjophhpkkoljpa"); // phantom
    for (const id of ids ?? []) expect(id).toMatch(/^[a-p]{32}$/);
  });
});
