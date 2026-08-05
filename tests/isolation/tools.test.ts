// tool-scoping enforcement suite (G20). the point of this suite is that every
// tool it refuses is REAL: two working mcp servers are registered with the
// runtime and both of them do their job on disk. so a refusal here is mortal
// refusing to broker a live, reachable, functioning tool — not an allowlist
// being consulted, and not a fixture that happens to be broken.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MortalRuntime } from "@mortal/runtime";
import { createIdentity, manifestOf, startInProcRuntime, tmpRoot, REPO_ROOT } from "../helpers/world.js";

const T = 60_000;

let runtime: MortalRuntime;
let root: string;
let notesFile: string;
let ledgerFile: string;

/** the identity scoped to exactly one tool: notes/read_note */
let scoped: string;
/** an identity with no declared scope — open/advisory, brokers anything */
let open: string;
/** an identity scoped to the OTHER server, used to prove those tools are live */
let ledgerOnly: string;

const servers = path.join(REPO_ROOT, "tests/fixtures/tool-servers");

beforeAll(async () => {
  root = tmpRoot("mortal-tools-");
  notesFile = path.join(root, "note.txt");
  ledgerFile = path.join(root, "ledger.txt");
  fs.writeFileSync(notesFile, "original note");
  fs.writeFileSync(ledgerFile, "");

  // the operator's registry: on disk, outside every agent surface
  fs.writeFileSync(
    path.join(root, "tool-servers.json"),
    JSON.stringify({
      servers: [
        {
          name: "notes",
          command: process.execPath,
          args: [path.join(servers, "notes-server.mjs")],
          env: { NOTES_FILE: notesFile },
        },
        {
          name: "ledger",
          command: process.execPath,
          args: [path.join(servers, "ledger-server.mjs")],
          env: { LEDGER_FILE: ledgerFile },
        },
      ],
    })
  );

  runtime = await startInProcRuntime(root);
  scoped = createIdentity(runtime, "scoped agent", {
    toolScope: { servers: [{ server: "notes", tools: ["read_note"] }] },
  });
  open = createIdentity(runtime, "open agent");
  ledgerOnly = createIdentity(runtime, "ledger agent", {
    toolScope: { servers: [{ server: "ledger", tools: null }] },
  });
}, T);

afterAll(async () => {
  await runtime?.stop();
  if (root) fs.rmSync(root, { recursive: true, force: true });
}, T);

const call = (id: string, server: string, tool: string, args: Record<string, unknown> = {}) =>
  runtime.tools.callTool(id, server, tool, args);

describe("tool scope enforcement at the mcp boundary", () => {
  it(
    "G20 the in-scope tool really works, and the manifest reads tools: enforced",
    async () => {
      const manifest = manifestOf(runtime, scoped);
      expect(manifest.permissions.tools.value).toBe("scoped");
      expect(manifest.permissions.tools.enforcement).toBe("enforced");

      const result = await call(scoped, "notes", "read_note");
      expect(result.isError).toBe(false);
      expect(JSON.stringify(result.content)).toContain("original note");
    },
    T
  );

  it(
    "G20 refuses an out-of-scope SERVER whose tool is live and working",
    async () => {
      // first: prove the tool is genuinely reachable and does real work, by
      // calling it from an identity whose scope permits it
      await call(ledgerOnly, "ledger", "append_entry", { entry: "proof-of-life" });
      expect(fs.readFileSync(ledgerFile, "utf8")).toContain("proof-of-life");

      // same server, same tool, same runtime, same moment — refused, because
      // THIS identity's manifest does not name it
      await expect(
        call(scoped, "ledger", "append_entry", { entry: "should-never-appear" })
      ).rejects.toThrow(/refused/i);
      expect(fs.readFileSync(ledgerFile, "utf8")).not.toContain("should-never-appear");
    },
    T
  );

  it(
    "G20 refuses an out-of-scope TOOL on a server that IS in scope",
    async () => {
      // notes/write_note is live: the open identity uses it and the file changes
      await call(open, "notes", "write_note", { text: "written by the open identity" });
      expect(fs.readFileSync(notesFile, "utf8")).toBe("written by the open identity");

      // the scoped identity reaches this exact server for read_note, and is
      // still refused write_note — server-level scope is not tool-level scope
      await expect(
        call(scoped, "notes", "write_note", { text: "should-never-be-written" })
      ).rejects.toThrow(/refused/i);
      expect(fs.readFileSync(notesFile, "utf8")).toBe("written by the open identity");
    },
    T
  );

  it(
    "G20 lists only the tools an identity may reach, and journals every refusal",
    async () => {
      const scopedTools = await runtime.tools.listTools(scoped);
      expect(scopedTools.map((t) => `${t.server}.${t.name}`)).toEqual(["notes.read_note"]);

      // the open identity sees everything registered — and its manifest says
      // "open / advisory", so nobody mistakes that for a control
      const openTools = await runtime.tools.listTools(open);
      expect(openTools.map((t) => `${t.server}.${t.name}`).sort()).toEqual([
        "ledger.append_entry",
        "notes.read_note",
        "notes.write_note",
      ]);
      expect(manifestOf(runtime, open).permissions.tools.enforcement).toBe("advisory");

      // the refusals above are on the record, not just in a thrown error
      const refusals = runtime
        .readActivity(scoped)
        .filter((e) => e.event === "tool_refused")
        .map((e) => `${e.detail!.server}.${e.detail!.tool}`);
      expect(refusals).toContain("ledger.append_entry");
      expect(refusals).toContain("notes.write_note");
    },
    T
  );

  it(
    "G20 an identity scoped to nothing brokers nothing, and the refusal precedes the upstream",
    async () => {
      const nothing = createIdentity(runtime, "sealed agent", { toolScope: { servers: [] } });
      expect(await runtime.tools.listTools(nothing)).toHaveLength(0);
      await expect(call(nothing, "notes", "read_note")).rejects.toThrow(/refused/i);

      // a scope check that ran only after connecting would fail differently
      // here — an unregistered server is NOT_FOUND for an open identity, but
      // FORBIDDEN for a scoped one, because the manifest decides first
      await expect(call(scoped, "ghost", "anything")).rejects.toThrow(/refused/i);
      await expect(call(open, "ghost", "anything")).rejects.toThrow(/not found/i);
    },
    T
  );

  it(
    "G20 a destroyed identity brokers nothing at all",
    async () => {
      const doomed = createIdentity(runtime, "doomed agent", {
        toolScope: { servers: [{ server: "notes", tools: ["read_note"] }] },
      });
      await call(doomed, "notes", "read_note");
      await runtime.destroyIdentity(doomed, { reason: "test" });
      await expect(call(doomed, "notes", "read_note")).rejects.toThrow(/destroyed/i);
    },
    T
  );
});
