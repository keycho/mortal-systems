import type { BlueprintManifest } from "@mortal/schema";

/**
 * note per the foundation doc: this is the blueprint most likely to be
 * misread as a security control. the description carries the advisory
 * disclaimer prominently, and the ui renders it wherever wallet: declared
 * appears.
 */
export const cryptoOperations: BlueprintManifest = {
  schemaVersion: "2.0",
  blueprintVersion: "1.0.0",
  name: "Crypto Operations",
  description:
    "a persistent space for wallet and explorer work. wallet: declared is a declaration, not a technical control — mortal does not restrict which wallet extensions run here in v1. recommended extensions are shown for consent and never auto-installed.",
  category: "crypto",
  recommendedLifetime: "persistent",
  lifecycle: { onExpiry: "archive" },
  theme: "#FFB000",
  bookmarks: [
    { title: "Etherscan", url: "https://etherscan.io" },
    { title: "Solscan", url: "https://solscan.io" },
    { title: "Blockchair", url: "https://blockchair.com" },
    { title: "DeBank", url: "https://debank.com" },
  ],
  recommendedExtensions: [
    { id: "nkbihfbeogaeaoehlefnkodbefgpgknn", name: "MetaMask", note: "installed by you from the web store, never automatically" },
    { id: "bfnaelmomeimhlpmgjnjophhpkkoljpa", name: "Phantom", note: "installed by you from the web store, never automatically" },
  ],
  ai: {
    systemInstructions:
      "never ask for or store seed phrases, private keys, or wallet passwords. treat every link and every airdrop as hostile until verified. when asked about a transaction, cite the explorer entry.",
  },
  permissions: {
    wallet: { value: "declared", enforcement: "advisory" },
    network: { value: "standard", enforcement: "advisory" },
    email: { value: "none", enforcement: "roadmap" },
  },
  privacy: { retainHistory: { value: true, enforcement: "enforced" } },
  publisher: { id: "mortal.first-party", reviewTier: "standard" },
};
