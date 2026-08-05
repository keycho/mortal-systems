import { DESTRUCTION_CAVEATS, type DestructionReport } from "@mortal/schema";
import { describe, expect, it } from "vitest";
import { cmdDestroy, confirmationPrompt, destructionConfirmed } from "../src/commands/destroy.js";
import { UsageError } from "../src/usage.js";
import { fakeCtx, makeSummary } from "./helpers.js";

const report: DestructionReport = {
  identityId: "idn_test0000000000000000",
  startedAt: "2026-08-05T12:00:00.000Z",
  completedAt: "2026-08-05T12:00:01.000Z",
  resumed: false,
  steps: [
    { step: "D0", ok: true, detail: "captured 4 paths" },
    { step: "D7", ok: true, detail: "activity finalized, journal cleared" },
  ],
  caveats: [...DESTRUCTION_CAVEATS],
};

const responders = () => ({
  "identity.list": () => [makeSummary()],
  "identity.destroy": () => report,
});

describe("destructionConfirmed", () => {
  const identity = { id: "idn_test0000000000000000", name: "research" };
  it("accepts the exact name or exact id, trimmed", () => {
    expect(destructionConfirmed("research", identity)).toBe(true);
    expect(destructionConfirmed("  research \n", identity)).toBe(true);
    expect(destructionConfirmed("idn_test0000000000000000", identity)).toBe(true);
  });
  it("rejects everything else, including y/yes and empty input", () => {
    for (const input of ["", "y", "yes", "Research", "resear", "idn_other"]) {
      expect(destructionConfirmed(input, identity)).toBe(false);
    }
  });
});

describe("confirmationPrompt", () => {
  it("states what will be removed and how to confirm", () => {
    const text = confirmationPrompt(makeSummary(), "14m 00s");
    expect(text).toContain("browser profile");
    expect(text).toContain("files and downloads");
    expect(text).toContain("notes, bookmarks, and ai conversation history");
    expect(text).toContain("tombstone");
    expect(text).toContain("type the identity's name (or id) to confirm");
  });
});

describe("cmdDestroy confirmation gate", () => {
  it("refuses without --yes when stdin is not a tty, before any destroy rpc", async () => {
    const { ctx, calls } = fakeCtx(["research"], responders(), { stdinIsTTY: false });
    await expect(cmdDestroy(ctx)).rejects.toThrow(UsageError);
    expect(calls.map((c) => c.method)).not.toContain("identity.destroy");
  });

  it("aborts (exit 1, no rpc) when the typed confirmation does not match", async () => {
    const { ctx, calls, stderr } = fakeCtx(["research"], responders(), {
      stdinIsTTY: true,
      prompt: async () => "nope",
    });
    expect(await cmdDestroy(ctx)).toBe(1);
    expect(stderr()).toContain("aborted — nothing was destroyed");
    expect(calls.map((c) => c.method)).not.toContain("identity.destroy");
  });

  it("destroys after a matching confirmation and prints the full caveats", async () => {
    const { ctx, calls, stdout } = fakeCtx(["research"], responders(), {
      stdinIsTTY: true,
      prompt: async () => "research",
    });
    expect(await cmdDestroy(ctx)).toBe(0);
    expect(calls.map((c) => c.method)).toContain("identity.destroy");
    for (const caveat of DESTRUCTION_CAVEATS) expect(stdout()).toContain(caveat);
  });

  it("--yes skips the prompt; --json emits the DestructionReport verbatim", async () => {
    const { ctx, stdout } = fakeCtx(["research", "--yes", "--json"], responders());
    expect(await cmdDestroy(ctx)).toBe(0);
    expect(JSON.parse(stdout())).toEqual(report);
  });

  it("a failed step exits 1 and says the journal resumes", async () => {
    const failing: DestructionReport = {
      ...report,
      steps: [
        { step: "D0", ok: true, detail: "captured 4 paths" },
        { step: "D3", ok: false, detail: "profile dir removal failed after 5 attempts: EBUSY" },
      ],
    };
    const { ctx, stdout } = fakeCtx(["research", "--yes"], {
      "identity.list": () => [makeSummary()],
      "identity.destroy": () => failing,
    });
    expect(await cmdDestroy(ctx)).toBe(1);
    expect(stdout()).toContain("stopped at D3");
    expect(stdout()).toContain("resumes this destruction");
  });
});
