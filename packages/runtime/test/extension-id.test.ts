import { describe, expect, it } from "vitest";
import {
  computeUnpackedExtensionId,
  pickCompanionExtensionId,
} from "../src/launcher/extension-id.js";

const COMPUTED = "kjlbcdefghijklmnopabcdefghijklmn";
const OTHER = "pabcdefghijklmnoabcdefghijklmnop";
/** google hangouts, the constant-id component extension branded chrome ships */
const HANGOUTS = "nkeimhogjdpnpccoofpliimaahmaaome";

const companionTarget = (id: string) => ({
  type: "service_worker",
  url: `chrome-extension://${id}/background.js`,
});
const hangoutsTarget = {
  type: "background_page",
  url: `chrome-extension://${HANGOUTS}/background.html`,
};

describe("computeUnpackedExtensionId", () => {
  it("produces 32-char a-p ids that vary with the path", () => {
    const a = computeUnpackedExtensionId("/private/tmp/liminal/companion-instances/idn_a");
    const b = computeUnpackedExtensionId("/private/tmp/liminal/companion-instances/idn_b");
    expect(a).toMatch(/^[a-p]{32}$/);
    expect(b).toMatch(/^[a-p]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe("pickCompanionExtensionId (macos regression: constant component ids)", () => {
  it("never pins a component extension: hangouts alone yields null", () => {
    expect(pickCompanionExtensionId([hangoutsTarget], COMPUTED)).toBeNull();
  });

  it("picks the computed id when its companion target is present, ignoring components", () => {
    expect(
      pickCompanionExtensionId([hangoutsTarget, companionTarget(COMPUTED)], COMPUTED)
    ).toBe(COMPUTED);
  });

  it("accepts a single companion-shaped candidate when canonicalization diverged", () => {
    expect(pickCompanionExtensionId([hangoutsTarget, companionTarget(OTHER)], COMPUTED)).toBe(OTHER);
  });

  it("refuses to guess between multiple companion-shaped candidates", () => {
    expect(
      pickCompanionExtensionId([companionTarget(OTHER), companionTarget(HANGOUTS)], COMPUTED)
    ).toBeNull();
  });

  it("ignores non-extension and malformed targets", () => {
    expect(
      pickCompanionExtensionId(
        [
          { type: "page", url: "https://example.com/background.js" },
          { type: "service_worker", url: "chrome-extension://" },
        ],
        COMPUTED
      )
    ).toBeNull();
  });
});
