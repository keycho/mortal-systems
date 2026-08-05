import { describe, expect, it } from "vitest";
import { parseCommandArgs, UsageError } from "../src/usage.js";

describe("parseCommandArgs", () => {
  it("parses common flags and positionals", () => {
    const { values, positionals } = parseCommandArgs(
      ["research", "--json", "--root", "/tmp/r"],
      {},
      { max: 1, label: "<name>" }
    );
    expect(values.json).toBe(true);
    expect(values.root).toBe("/tmp/r");
    expect(values.help).toBe(false);
    expect(positionals).toEqual(["research"]);
  });

  it("defaults --json to false", () => {
    const { values } = parseCommandArgs([], {}, {});
    expect(values.json).toBe(false);
  });

  it("rejects unknown flags as UsageError", () => {
    expect(() => parseCommandArgs(["--nope"], {}, {})).toThrow(UsageError);
    expect(() => parseCommandArgs(["--nope"], {}, {})).toThrow(/--nope/);
  });

  it("rejects a missing required positional", () => {
    expect(() => parseCommandArgs([], {}, { min: 1, max: 1, label: "<id|name>" })).toThrow(
      /missing <id\|name>/
    );
  });

  it("rejects extra positionals", () => {
    expect(() => parseCommandArgs(["a", "b"], {}, { max: 1, label: "<id|name>" })).toThrow(
      /unexpected argument "b"/
    );
    expect(() => parseCommandArgs(["a"], {}, {})).toThrow(/unexpected argument "a"/);
  });

  it("accepts command-specific options alongside common ones", () => {
    const { values } = parseCommandArgs<{ lifetime: string }>(
      ["research", "--lifetime", "15m"],
      { lifetime: { type: "string" } },
      { max: 1 }
    );
    expect(values.lifetime).toBe("15m");
  });
});
