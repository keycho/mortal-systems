#!/usr/bin/env node
import readline from "node:readline/promises";
import { connectRuntime, ConnectError, RpcClientError, type ConnectOptions } from "./client.js";
import type { Command, CommandContext } from "./context.js";
import { colorsEnabled, makeColors, toJsonErrorLine } from "./output.js";
import { UsageError } from "./usage.js";
import { CLI_VERSION } from "./version.js";
import { cmdBlueprints } from "./commands/blueprints.js";
import { cmdCapabilities } from "./commands/capabilities.js";
import { cmdCreate } from "./commands/create.js";
import { cmdDestroy } from "./commands/destroy.js";
import { cmdLaunch, cmdResume } from "./commands/launch.js";
import { cmdList } from "./commands/list.js";
import { cmdShow } from "./commands/show.js";
import { cmdStatus } from "./commands/status.js";
import { cmdSuspend } from "./commands/suspend.js";

const GLOBAL_HELP = `mortal — drive the local mortal identity runtime from the shell

usage: mortal <command> [arguments] [--json] [--root <dir>]

commands:
  status                runtime health, browser, identities running
  list                  identities with state and remaining lifetime
  blueprints            installed blueprints with permissions + enforcement
  create <name>         create an identity (--blueprint <id>, --lifetime 15m|12h|persistent)
  launch <id|name>      launch the isolated browser; prints its scoped cdp endpoint
  show <id|name>        one identity: environment, permissions, activity
  suspend <id|name>     terminate the browser, keep all state
  resume <id|name>      relaunch a suspended identity
  destroy <id|name>     run the deletion contract; prints the destruction report
  capabilities          what is enforced vs advisory vs roadmap right now

every command takes --json (stable output for scripts) and --help (flags).
errors go to stderr; exit codes: 0 ok, 1 failure, 2 usage.

examples:
  mortal create research --lifetime 15m
  mortal launch research --json | jq -r .cdpEndpoint
  mortal destroy research --yes
`;

const COMMANDS: Record<string, Command> = {
  status: cmdStatus,
  list: cmdList,
  blueprints: cmdBlueprints,
  show: cmdShow,
  capabilities: cmdCapabilities,
  create: cmdCreate,
  launch: cmdLaunch,
  suspend: cmdSuspend,
  resume: cmdResume,
  destroy: cmdDestroy,
};

function reportError(err: unknown, jsonMode: boolean, errW: (s: string) => void): number {
  if (err instanceof UsageError) {
    if (jsonMode) errW(toJsonErrorLine({ code: "USAGE", message: err.message }));
    else errW(`mortal: ${err.message}\nrun "mortal --help" or "mortal <command> --help" for usage.\n`);
    return 2;
  }
  if (err instanceof ConnectError) {
    if (jsonMode) {
      errW(toJsonErrorLine({ code: "RUNTIME_UNREACHABLE", message: err.message, hint: err.hint }));
    } else {
      errW(`mortal: ${err.message}\n${err.hint}\n`);
    }
    return 1;
  }
  if (err instanceof RpcClientError) {
    if (jsonMode) {
      errW(
        toJsonErrorLine({
          code: err.code,
          message: err.message,
          ...(err.issues ? { issues: err.issues } : {}),
          ...(err.enforcement ? { enforcement: err.enforcement } : {}),
        })
      );
    } else {
      errW(`mortal: ${err.code}: ${err.message}\n`);
      for (const issue of err.issues ?? []) {
        errW(`  - ${issue.path === "" ? "(manifest)" : issue.path}: ${issue.message}\n`);
      }
    }
    return 1;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (jsonMode) errW(toJsonErrorLine({ code: "INTERNAL", message }));
  else errW(`mortal: unexpected error: ${message}\n`);
  return 1;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;
  const out = (s: string) => void process.stdout.write(s);
  const err = (s: string) => void process.stderr.write(s);

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    out(GLOBAL_HELP);
    return 0;
  }
  if (command === "--version" || command === "-V" || command === "version") {
    out(`${CLI_VERSION}\n`);
    return 0;
  }

  const jsonMode = rest.includes("--json");
  const run = COMMANDS[command];
  if (run === undefined) {
    err(`mortal: unknown command "${command}"\nrun "mortal --help" for the command list.\n`);
    return 2;
  }

  const ctx: CommandContext = {
    argv: rest,
    out,
    err,
    colors: makeColors(colorsEnabled(process.stdout, process.env)),
    env: process.env,
    connect: (opts?: ConnectOptions) => connectRuntime({ env: process.env, ...opts }),
    stdinIsTTY: process.stdin.isTTY === true,
    now: () => new Date(),
    prompt: async (question: string) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
  };

  try {
    return await run(ctx);
  } catch (e) {
    return reportError(e, jsonMode, err);
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`mortal: fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
);
