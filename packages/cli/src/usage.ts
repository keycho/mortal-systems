import { parseArgs, type ParseArgsConfig } from "node:util";

/** a user-input problem: reported to stderr with the command usage, exit 2 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

type OptionSpecs = NonNullable<ParseArgsConfig["options"]>;

/** flags every command accepts */
const COMMON_OPTIONS = {
  json: { type: "boolean", default: false },
  root: { type: "string" },
  help: { type: "boolean", default: false },
} satisfies OptionSpecs;

export interface CommonValues {
  json: boolean;
  root?: string;
  help: boolean;
}

export interface PositionalBounds {
  min?: number;
  max?: number;
  /** what the positionals are, for error text, e.g. "<id|name>" */
  label?: string;
}

/** trim node's parseArgs advice tail down to the actionable first sentence */
function firstSentence(message: string): string {
  const cut = message.indexOf(". To specify");
  return (cut === -1 ? message : message.slice(0, cut)).replace(/\.$/, "");
}

export function parseCommandArgs<V extends Record<string, unknown> = Record<string, never>>(
  argv: string[],
  options: OptionSpecs,
  bounds: PositionalBounds = {}
): { values: CommonValues & Partial<V>; positionals: string[] } {
  let parsed: { values: Record<string, unknown>; positionals: string[] };
  try {
    parsed = parseArgs({
      args: argv,
      options: { ...COMMON_OPTIONS, ...options },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    throw new UsageError(firstSentence(err instanceof Error ? err.message : String(err)));
  }
  const min = bounds.min ?? 0;
  const max = bounds.max ?? 0;
  const label = bounds.label ?? "arguments";
  if (parsed.positionals.length < min) {
    throw new UsageError(`missing ${label}`);
  }
  if (parsed.positionals.length > max) {
    throw new UsageError(
      `unexpected argument "${parsed.positionals[max]}"${max === 0 ? "" : ` (takes at most ${max} ${label})`}`
    );
  }
  return { values: parsed.values as CommonValues & Partial<V>, positionals: parsed.positionals };
}
