import type { ConnectOptions, RuntimeClient } from "./client.js";
import type { Colors } from "./output.js";

/**
 * everything a command touches goes through this context, so unit tests can
 * run commands with a fake client and captured writers, and the entry point
 * stays the only place that knows about process globals.
 */
export interface CommandContext {
  /** argv after the command name */
  argv: string[];
  /** write to stdout (data) */
  out: (s: string) => void;
  /** write to stderr (errors, prompts, progress) */
  err: (s: string) => void;
  colors: Colors;
  env: NodeJS.ProcessEnv;
  /** connect to the running runtime; commands pass their --root through */
  connect: (opts?: ConnectOptions) => Promise<RuntimeClient>;
  stdinIsTTY: boolean;
  now: () => Date;
  /** ask on the terminal (question to stderr), resolve with the typed line */
  prompt: (question: string) => Promise<string>;
}

export type Command = (ctx: CommandContext) => Promise<number>;
