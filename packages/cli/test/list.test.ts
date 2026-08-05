import { describe, expect, it } from "vitest";
import { parseStateSelection } from "../src/commands/list.js";
import { UsageError } from "../src/usage.js";

describe("parseStateSelection", () => {
  it("default view hides destroyed and applies no server filter", () => {
    expect(parseStateSelection(undefined)).toEqual({ persistentOnly: false, hideDestroyed: true });
  });

  it("maps real states to a server-side filter and shows what was asked for", () => {
    expect(parseStateSelection("running")).toEqual({
      filter: { state: ["running"] },
      persistentOnly: false,
      hideDestroyed: false,
    });
    expect(parseStateSelection("running,suspended")).toEqual({
      filter: { state: ["running", "suspended"] },
      persistentOnly: false,
      hideDestroyed: false,
    });
    expect(parseStateSelection("destroyed").filter).toEqual({ state: ["destroyed"] });
  });

  it("persistent is a lifetime selection, not a lifecycle state", () => {
    expect(parseStateSelection("persistent")).toEqual({ persistentOnly: true, hideDestroyed: true });
    expect(() => parseStateSelection("persistent,running")).toThrow(UsageError);
  });

  it("rejects unknown states, naming the valid ones", () => {
    expect(() => parseStateSelection("bogus")).toThrow(/unknown state "bogus"/);
    expect(() => parseStateSelection("bogus")).toThrow(/persistent/);
  });
});
