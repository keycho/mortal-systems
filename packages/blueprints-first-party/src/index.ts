import type { BlueprintManifest } from "@liminal/schema";
import { clientOperations } from "./client-operations.js";
import { onchainInvestigator } from "./onchain-investigator.js";
import { cryptoOperations } from "./crypto-operations.js";

export { clientOperations, onchainInvestigator, cryptoOperations };

/** install source prefix for first-party blueprints */
export const FIRST_PARTY_SOURCE = "first-party";

export const FIRST_PARTY_BLUEPRINTS: readonly BlueprintManifest[] = [
  clientOperations,
  onchainInvestigator,
  cryptoOperations,
];
