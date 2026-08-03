import { describe, expect, it } from "vitest";
import { badgeText } from "../src/lib/badge.js";
import { formatRemaining } from "../src/lib/format.js";

describe("badge text", () => {
  it("compacts remaining lifetime for the toolbar badge", () => {
    expect(badgeText(null)).toBe("");
    expect(badgeText(0)).toBe("0m");
    expect(badgeText(45_000)).toBe("1m");
    expect(badgeText(5 * 60_000)).toBe("5m");
    expect(badgeText(90 * 60_000)).toBe("1h");
    expect(badgeText(26 * 3_600_000)).toBe("1d");
  });
});

describe("countdown format (pinned to @liminal/schema vectors)", () => {
  it("matches the shared formatting vectors", () => {
    expect(formatRemaining(45_000)).toBe("00m 45s");
    expect(formatRemaining(5 * 60_000)).toBe("05m 00s");
    expect(formatRemaining(4 * 3_600_000 + 18 * 60_000)).toBe("04h 18m");
    expect(formatRemaining(3 * 86_400_000 + 7 * 3_600_000)).toBe("03d 07h");
    expect(formatRemaining(-1)).toBe("00m 00s");
  });
});
