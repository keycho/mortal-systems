import {
  AGENT_CLASS_DISPLAY,
  type PayloadFor,
  type WallEvent,
} from "./schema.js";

/**
 * one-liners for the wire (the gate and watch page event feeds). copy rules:
 * lowercase, no exclamation marks, no em dashes, and the words "burner" and
 * "ticker" never render (brand gate bans them in site copy). names are
 * resolved by the caller; the fallback derives from the agent id
 * (ag_ash_1 -> ash-1) so raw ids never leak into copy.
 */

/** the display form of a receipt everywhere on screen: 8f2c…e1 */
export function shortReceipt(receipt: string): string {
  if (receipt.length <= 8) return receipt;
  return `${receipt.slice(0, 4)}…${receipt.slice(-2)}`;
}

export function humanizeSeconds(total: number): string {
  if (total < 60) return `${Math.max(0, Math.floor(total))}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m`;
  if (total < 86_400) {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function humanizeEvent(event: WallEvent, name?: string): string {
  const who = name ?? event.agent_id.replace(/^ag_/, "").replace(/_/g, "-");
  switch (event.kind) {
    case "spawn": {
      const p = event.payload as PayloadFor<"spawn">;
      const cls = AGENT_CLASS_DISPLAY[p.class];
      const inherited = p.inherited_fragments.length;
      const tail = inherited > 0 ? `, carrying ${inherited} fragment${inherited === 1 ? "" : "s"}` : "";
      return `${who} is alive: ${cls}, ${p.region ?? "nowhere"}, ${humanizeSeconds(p.ttl_seconds)} to live${tail}`;
    }
    case "death": {
      const p = event.payload as PayloadFor<"death">;
      return `${who} is gone after ${humanizeSeconds(p.lived_seconds)} (${p.cause})`;
    }
    case "ttl_warning": {
      const p = event.payload as PayloadFor<"ttl_warning">;
      return p.window === "final_hour"
        ? `${who} entered the final hour`
        : `${who} entered the final ten minutes`;
    }
    case "ttl_extended": {
      const p = event.payload as PayloadFor<"ttl_extended">;
      return `${who} was granted ${humanizeSeconds(p.added_seconds)} more (${p.source})`;
    }
    case "state_change": {
      const p = event.payload as PayloadFor<"state_change">;
      return p.detail ? `${who} is ${p.state}: ${p.detail}` : `${who} is ${p.state}`;
    }
    case "action": {
      const p = event.payload as PayloadFor<"action">;
      switch (p.verb) {
        case "published_post":
          return `${who} published${p.title ? ` "${p.title}"` : " a post"}`;
        case "left_comment":
          return `${who} left a comment${p.target_agent ? ` for ${p.target_agent}` : ""}`;
        case "deleted_reply":
          return `${who} deleted a reply`;
        case "sent_letter":
          return `${who} sent a letter${p.target_agent ? ` to ${p.target_agent}` : ""}`;
        case "opened_page":
          // external reads say so plainly: "marlowe is reading
          // news.ycombinator.com: <title>" (the title carries the domain)
          if (p.target_url && /^https?:\/\//i.test(p.target_url)) {
            return `${who} is reading ${p.title ?? p.target_url}`;
          }
          return `${who} opened ${p.title ?? p.target_url ?? "a page"}`;
      }
      break;
    }
    case "monologue": {
      const p = event.payload as PayloadFor<"monologue">;
      return `${who}: ${p.text}`;
    }
    case "enforcement": {
      const p = event.payload as PayloadFor<"enforcement">;
      return `the runtime blocked ${who}: ${p.rule_id}`;
    }
    case "human_contact": {
      const p = event.payload as PayloadFor<"human_contact">;
      return `a human reached ${who} on ${p.platform}`;
    }
    case "system": {
      const p = event.payload as PayloadFor<"system">;
      return p.what === "lost_time" ? `${who} lost time` : `maintenance touched ${who}`;
    }
  }
  return `${who}: ${event.kind}`;
}
