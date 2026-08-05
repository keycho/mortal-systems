/**
 * the binding map behind the ci gate (scripts/check-guarantees.ts): every
 * schema field whose enforcement is "enforced" must map to at least one test
 * id here, and every advisory/roadmap field to at least one badge-render
 * test. an unmapped enforced field fails the build.
 *
 * test-id locations:
 *  G1-G8, G15, G16, G18 (browser half)  tests/isolation/*.test.ts (real chromium over per-identity cdp)
 *  G9, G18 (token half)                 packages/runtime/test/self-api.test.ts
 *  G10-G14                              tests/lifecycle/*.test.ts (runtime as a real child process)
 *  G17                                  packages/runtime/test/blueprints.test.ts (+ schema purity suite)
 *  G19 (network route)                  tests/isolation/network.test.ts (recording proxy + real chromium)
 *  BADGE-1                              apps/manager/test/manifest-activity.test.tsx and
 *                                       apps/companion/test/panels-render.test.ts
 */

export const GUARANTEES_MAP: Record<string, string[]> = {
  "surfaces.browser.isolation": ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G16"],
  "permissions.filesystem": ["G8"],
  "permissions.memoryScope": ["G9", "G18"],
  "privacy.retainHistory": ["G15"],
  "lifecycle.expiry": ["G10", "G11"],
  "lifecycle.destruction": ["G12", "G13", "G14"],
  "permissions.network": ["G19"],
};

export const BADGE_TESTS: Record<string, string[]> = {
  "permissions.wallet": ["BADGE-1"],
  "permissions.email": ["BADGE-1"],
  "privacy.redaction": ["BADGE-1"],
};
