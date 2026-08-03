import { beforeEach, describe, expect, it } from "vitest";
import {
  DESTROY_STEPS,
  DESTRUCTION_CAVEATS,
  identityManifestSchema,
  identityStateSchema,
} from "@mortal/schema";
import { cryptoOperations, onchainInvestigator } from "@mortal/blueprints";
import {
  buildDestructionReport,
  createFromBlueprint,
  createSimIdentity,
  LAUNCH_SEQUENCE,
  remainingMs,
  resetSpaceNumbers,
  withState,
} from "../components/simulator/machine";

const NOW = Date.parse("2026-08-03T12:00:00.000Z");

beforeEach(resetSpaceNumbers);

describe("simulator machine: everything semantic comes from @mortal/schema", () => {
  it("creates a valid identity through the real compose + grammar", () => {
    const result = createSimIdentity({ name: "incident review", color: "#4DA3FF", lifetime: "60s" }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(identityManifestSchema.safeParse(result.identity.manifest).success).toBe(true);
    expect(result.identity.state).toBe("created");
    expect(remainingMs(result.identity, NOW)).toBe(60_000);
    expect(result.identity.events.map((e) => e.event)).toEqual(["created", "expiry_scheduled"]);
    expect(result.identity.spaceNumber).toBe(1);
  });

  it("rejects invalid lifetimes with the REAL grammar error, not a reimplementation", () => {
    const tooShort = createSimIdentity({ name: "x", color: "#4DA3FF", lifetime: "2s" }, NOW);
    expect(tooShort.ok).toBe(false);
    if (!tooShort.ok) expect(tooShort.error).toContain("30s minimum");
    const garbage = createSimIdentity({ name: "x", color: "#4DA3FF", lifetime: "forever" }, NOW);
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.error).toContain('invalid lifetime');
  });

  it("persistent identities carry no deadline and no expiry event", () => {
    const result = createSimIdentity({ name: "client acme", color: "#F59E0B", lifetime: "persistent" }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.expiresAtMs).toBeNull();
    expect(result.identity.events.map((e) => e.event)).toEqual(["created"]);
  });

  it("installs a real first-party blueprint with consent-gated extensions", () => {
    const noConsent = createFromBlueprint(cryptoOperations, {}, NOW);
    expect(noConsent.ok).toBe(true);
    if (noConsent.ok) {
      expect(noConsent.identity.manifest.surfaces.browser.extensions).toEqual(["mortal-companion"]);
    }
    const consented = createFromBlueprint(
      cryptoOperations,
      { consentedExtensionIds: ["nkbihfbeogaeaoehlefnkodbefgpgknn"] },
      NOW
    );
    expect(consented.ok).toBe(true);
    if (consented.ok) {
      expect(consented.identity.manifest.surfaces.browser.extensions).toContain(
        "nkbihfbeogaeaoehlefnkodbefgpgknn"
      );
    }
  });

  it("applies the investigator's real values through the blueprint path", () => {
    const result = createFromBlueprint(onchainInvestigator, { lifetime: "60s" }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.manifest.privacy.retainHistory.value).toBe(false);
    expect(result.identity.manifest.color).toBe("#C8FF4D");
    expect(result.identity.manifest.lifecycle.onExpiry).toBe("destroy");
  });

  it("launch sequence states are real schema states", () => {
    for (const step of LAUNCH_SEQUENCE) {
      expect(identityStateSchema.options).toContain(step.state);
    }
    const result = createSimIdentity({ name: "x", color: "#4DA3FF", lifetime: "60s" }, NOW);
    if (!result.ok) throw new Error("setup failed");
    let sim = result.identity;
    for (const step of LAUNCH_SEQUENCE) {
      sim = withState(sim, step.state, NOW);
    }
    expect(sim.state).toBe("running");
    expect(sim.events.map((e) => e.event)).toContain("provisioning");
  });

  it("destruction reports carry the real steps and the fixed caveats, untrimmed", () => {
    const result = createSimIdentity({ name: "doomed", color: "#4DA3FF", lifetime: "60s" }, NOW);
    if (!result.ok) throw new Error("setup failed");
    const report = buildDestructionReport(result.identity, NOW, NOW + 1_500);
    expect(report.steps.map((s) => s.step)).toEqual([...DESTROY_STEPS]);
    expect(report.steps.every((s) => s.ok && s.detail?.includes("simulated"))).toBe(true);
    expect(report.caveats).toEqual([...DESTRUCTION_CAVEATS]);
    expect(report.identityId).toBe(result.identity.manifest.id);
    expect(report.resumed).toBe(false);
  });
});
