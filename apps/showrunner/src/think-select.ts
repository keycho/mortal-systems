import { CAST } from "./cast.js";
import { buildAnthropicThinker, personaFromMember } from "./anthropic-thinker.js";
import type { ThinkFn } from "./think.js";

/**
 * thinker selection at boot. WALL_THINKER=anthropic turns the model on and
 * fails loudly without a key: a wall that silently fell back to the
 * scripted thinker would show hand-written lines as model-written, which
 * is exactly the kind of fake this project refuses. per-call api errors
 * are different: the heartbeat treats them as downtime and the wall
 * stays alive.
 */

export interface SelectedThinker {
  label: string;
  think: ThinkFn;
}

export function selectThinker(env: NodeJS.ProcessEnv, scripted: ThinkFn): SelectedThinker {
  const wanted = (env.WALL_THINKER ?? "scripted").toLowerCase();
  if (wanted === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        "WALL_THINKER=anthropic but ANTHROPIC_API_KEY is unset; refusing to fall back silently"
      );
    }
    const personas: Record<string, string> = {};
    for (const member of CAST) personas[member.agent_id] = personaFromMember(member);
    const ambientModel = env.WALL_MODEL_AMBIENT;
    const setPieceModel = env.WALL_MODEL_SET_PIECE;
    return {
      label: `anthropic (${ambientModel ?? "haiku ambient"} / ${setPieceModel ?? "big set pieces"})`,
      think: buildAnthropicThinker({
        apiKey: env.ANTHROPIC_API_KEY,
        ...(ambientModel ? { ambientModel } : {}),
        ...(setPieceModel ? { setPieceModel } : {}),
        personas,
      }),
    };
  }
  return { label: "scripted (deterministic, no model attached)", think: scripted };
}
