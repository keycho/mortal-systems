import { describe, expect, it } from "vitest";
import type { IdentitySummary } from "@mortal/schema";
import {
  colorsEnabled,
  formatTable,
  makeColors,
  remainingCell,
  toJson,
  toJsonErrorLine,
  visibleWidth,
} from "../src/output.js";

const summary = (over: Partial<IdentitySummary>): IdentitySummary => ({
  id: "idn_test0000000000000000",
  name: "research",
  state: "ready",
  color: "#8A8F98",
  lifetime: "15m",
  expiresAt: "2026-08-05T12:15:00.000Z",
  onExpiry: "destroy",
  blueprint: null,
  lastLaunchedAt: null,
  storageBytes: 0,
  spaceNumber: 1,
  ...over,
});

describe("colors", () => {
  it("disabled colors are identity functions (piped output stays clean)", () => {
    const c = makeColors(false);
    expect(c.green("running")).toBe("running");
  });

  it("enabled colors wrap with ansi and visibleWidth ignores them", () => {
    const c = makeColors(true);
    const painted = c.green("running");
    expect(painted).not.toBe("running");
    expect(visibleWidth(painted)).toBe("running".length);
  });

  it("NO_COLOR and non-tty disable colors", () => {
    expect(colorsEnabled({ isTTY: true }, { NO_COLOR: "1" })).toBe(false);
    expect(colorsEnabled({ isTTY: false }, {})).toBe(false);
    expect(colorsEnabled({ isTTY: true }, { TERM: "dumb" })).toBe(false);
    expect(colorsEnabled({ isTTY: true }, {})).toBe(true);
  });
});

describe("formatTable", () => {
  it("aligns columns by visible width, even with ansi codes", () => {
    const c = makeColors(true);
    const lines = formatTable([
      ["id", c.green("running"), "|"],
      ["longer-id", "up", "|"],
    ]);
    expect(visibleWidth(lines[0]!.slice(0, lines[0]!.indexOf("|")))).toBe(
      visibleWidth(lines[1]!.slice(0, lines[1]!.indexOf("|")))
    );
  });

  it("never pads the last column (no trailing whitespace)", () => {
    const lines = formatTable([
      ["a", "short"],
      ["b", "much longer cell"],
    ]);
    for (const line of lines) expect(line).toBe(line.trimEnd());
  });
});

describe("remainingCell", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");

  it("counts down a finite lifetime in fixed-width form", () => {
    expect(remainingCell(summary({}), now)).toBe("15m 00s");
  });

  it("shows persistent for persistent identities", () => {
    expect(remainingCell(summary({ lifetime: "persistent", expiresAt: null }), now)).toBe(
      "persistent"
    );
  });

  it("shows a dash for destroyed identities", () => {
    expect(remainingCell(summary({ state: "destroyed", lifetime: "-", expiresAt: null }), now)).toBe(
      "—"
    );
  });

  it("clamps an elapsed expiry at zero", () => {
    expect(
      remainingCell(summary({ expiresAt: "2026-08-05T11:00:00.000Z" }), now)
    ).toBe("00m 00s");
  });
});

describe("json emitters", () => {
  it("toJson is pretty, newline-terminated, parseable", () => {
    const s = toJson({ a: 1 });
    expect(s.endsWith("\n")).toBe(true);
    expect(JSON.parse(s)).toEqual({ a: 1 });
  });

  it("toJsonErrorLine is a single line with an error envelope", () => {
    const s = toJsonErrorLine({ code: "USAGE", message: "bad" });
    expect(s.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(s)).toEqual({ error: { code: "USAGE", message: "bad" } });
  });
});
