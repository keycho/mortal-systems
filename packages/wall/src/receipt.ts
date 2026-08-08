import { createHash } from "node:crypto";

/**
 * receipt hashes for spawn / death / enforcement events. the hash covers the
 * canonical event content (id, ts, agent, kind, payload with sorted keys),
 * so anyone holding the event row can recompute and verify it. shown on the
 * watch page's annotation overlay as `8f2c…e1`.
 */

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function receiptHash(event: {
  id: string;
  ts: string;
  agent_id: string;
  kind: string;
  payload: unknown;
}): string {
  const body = canonical({
    id: event.id,
    ts: event.ts,
    agent_id: event.agent_id,
    kind: event.kind,
    payload: event.payload,
  });
  return createHash("sha256").update(body).digest("hex");
}

export function verifyReceipt(event: {
  id: string;
  ts: string;
  agent_id: string;
  kind: string;
  payload: unknown;
  receipt?: string;
}): boolean {
  if (!event.receipt) return false;
  return receiptHash(event) === event.receipt;
}

export { shortReceipt } from "./humanize.js";
