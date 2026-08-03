import type { BlueprintManifest } from "@mortal/schema";

/** the canonical example blueprint. recommended 12h; demos override to 5m. */
export const onchainInvestigator: BlueprintManifest = {
  schemaVersion: "2.0",
  blueprintVersion: "1.0.0",
  name: "Onchain Investigator",
  description:
    "an isolated, time-limited environment for onchain research. expires and destroys itself when the work is done; browsing history is not retained (enforced).",
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
      "act as a cautious onchain investigator. separate verified onchain evidence from inference. cite tx hashes and addresses for every claim. flag unverifiable claims explicitly. never present speculation as fact.",
  },
  permissions: {
    wallet: { value: "none", enforcement: "advisory" },
    network: { value: "standard", enforcement: "advisory" },
    email: { value: "none", enforcement: "roadmap" },
  },
  privacy: { retainHistory: { value: false, enforcement: "enforced" } },
  publisher: { id: "mortal.first-party", reviewTier: "standard" },
};
