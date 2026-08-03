import { describe, expect, it } from "vitest";
import {
  computeExpiresAt,
  DurationError,
  formatRemaining,
  isValidLifetime,
  parseLifetimeMs,
} from "../src/duration.js";

describe("lifetime grammar", () => {
  it("parses the spec'd example durations", () => {
    expect(parseLifetimeMs("30m")).toBe(30 * 60_000);
    expect(parseLifetimeMs("5m")).toBe(5 * 60_000);
    expect(parseLifetimeMs("12h")).toBe(12 * 3_600_000);
    expect(parseLifetimeMs("7d")).toBe(7 * 86_400_000);
    expect(parseLifetimeMs("60s")).toBe(60_000);
  });

  it("returns null for persistent", () => {
    expect(parseLifetimeMs("persistent")).toBeNull();
  });

  it("rejects malformed inputs", () => {
    for (const bad of ["", "0m", "-5m", "5w", "1h30m", "m30", "30", "30 m", "5M", "1.5h", "007m", "999999999d"]) {
      expect(() => parseLifetimeMs(bad), `should reject "${bad}"`).toThrow(DurationError);
    }
  });

  it("enforces bounds: 30s minimum, 365d maximum", () => {
    expect(() => parseLifetimeMs("10s")).toThrow(/30s minimum/);
    expect(() => parseLifetimeMs("29s")).toThrow(/30s minimum/);
    expect(parseLifetimeMs("30s")).toBe(30_000);
    expect(parseLifetimeMs("365d")).toBe(365 * 86_400_000);
    expect(() => parseLifetimeMs("366d")).toThrow(/365d maximum/);
  });

  it("isValidLifetime mirrors the parser", () => {
    expect(isValidLifetime("persistent")).toBe(true);
    expect(isValidLifetime("12h")).toBe(true);
    expect(isValidLifetime("banana")).toBe(false);
  });
});

describe("computeExpiresAt", () => {
  const t0 = "2026-08-03T12:00:00.000Z";

  it("adds the lifetime to createdAt", () => {
    expect(computeExpiresAt(t0, "5m")).toBe("2026-08-03T12:05:00.000Z");
    expect(computeExpiresAt(t0, "12h")).toBe("2026-08-04T00:00:00.000Z");
    expect(computeExpiresAt(t0, "7d")).toBe("2026-08-10T12:00:00.000Z");
  });

  it("returns null iff persistent", () => {
    expect(computeExpiresAt(t0, "persistent")).toBeNull();
  });

  it("rejects an unparseable createdAt", () => {
    expect(() => computeExpiresAt("not-a-date", "5m")).toThrow(DurationError);
  });
});

describe("formatRemaining", () => {
  it("formats sub-hour as MMm SSs", () => {
    expect(formatRemaining(45_000)).toBe("00m 45s");
    expect(formatRemaining(5 * 60_000)).toBe("05m 00s");
    expect(formatRemaining(59 * 60_000 + 59_000)).toBe("59m 59s");
  });

  it("formats sub-day as HHh MMm", () => {
    expect(formatRemaining(4 * 3_600_000 + 18 * 60_000)).toBe("04h 18m");
  });

  it("formats multi-day as DDd HHh", () => {
    expect(formatRemaining(3 * 86_400_000 + 7 * 3_600_000)).toBe("03d 07h");
  });

  it("clamps at zero", () => {
    expect(formatRemaining(0)).toBe("00m 00s");
    expect(formatRemaining(-5000)).toBe("00m 00s");
  });
});
