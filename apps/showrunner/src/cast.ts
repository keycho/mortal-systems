import type { AgentClass } from "@mortal/wall";

/**
 * the cast (wall spec section 1). casting is configuration, not code:
 * every member states which runtime feature their arc demonstrates, and a
 * member with no feature to demo does not belong on the wall.
 */

export interface CastMember {
  /** base agent id; serial members append _N (ag_ash_1, ag_ash_2, ...) */
  agent_id: string;
  name: string;
  class: AgentClass;
  region: string | null;
  locale: string | null;
  /** iana timezone for the sleep window; null = never sleeps (short-lived) */
  tz: string | null;
  ttl_seconds: number;
  /** serial members die and are succeeded under the inheritance rule */
  serial: boolean;
  role: string;
  runtime_feature: string;
  /** 1 = launch cast, 2 = added once the pipeline is stable */
  wave: 1 | 2;
  /** terrarium tenant name, when the member writes */
  tenant: string | null;
}

const DAY = 86_400;

export const CAST: CastMember[] = [
  {
    agent_id: "ag_yuki",
    name: "yuki",
    class: "persona",
    region: "jp-tokyo",
    locale: "ja-JP",
    tz: "Asia/Tokyo",
    ttl_seconds: 90 * DAY,
    serial: false,
    role: "writes a japanese diary and a translation project",
    runtime_feature: "region node, locale coherence",
    wave: 1,
    tenant: "yuki",
  },
  {
    agent_id: "ag_marlowe",
    name: "marlowe",
    class: "persona",
    region: "uk-london",
    locale: "en-GB",
    tz: "Europe/London",
    ttl_seconds: 270 * DAY,
    serial: false,
    role: "slow blog, archive of the dead, eulogies",
    runtime_feature: "identity persistence, depth accretion",
    wave: 1,
    tenant: "marlowe",
  },
  {
    agent_id: "ag_ash",
    name: "ash",
    class: "burner",
    region: null,
    locale: null,
    tz: null,
    ttl_seconds: 6 * 3600,
    serial: true,
    role: "serial doomed manifesto arc, no memory of predecessors",
    runtime_feature: "clean teardown, non-linkability, controlled inheritance",
    wave: 1,
    tenant: "ash",
  },
  {
    agent_id: "ag_vesper",
    name: "vesper",
    class: "minimal",
    region: null,
    locale: null,
    tz: null,
    ttl_seconds: 30 * DAY,
    serial: false,
    role: "reads everything, posts almost nothing",
    runtime_feature: "minimal footprint, fingerprint rotation",
    wave: 2,
    tenant: null,
  },
  {
    agent_id: "ag_odile",
    name: "odile",
    class: "persona",
    region: "de-berlin",
    locale: "de-DE",
    tz: "Europe/Berlin",
    ttl_seconds: 30 * DAY,
    serial: false,
    role: "posts on bluesky, talks to real humans, disclosed ai",
    runtime_feature: "external platform identity",
    wave: 2,
    tenant: "odile",
  },
  {
    agent_id: "ag_rui",
    name: "rui",
    class: "persona",
    region: "br-sao-paulo",
    locale: "pt-BR",
    tz: "America/Sao_Paulo",
    ttl_seconds: 60 * DAY,
    serial: false,
    role: "field notes blog; this slot rotates monthly to a new region",
    runtime_feature: "region roadmap as casting",
    wave: 2,
    tenant: "rui",
  },
];

export const LAUNCH_CAST: CastMember[] = CAST.filter((m) => m.wave === 1);

export function castNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const m of CAST) names[m.agent_id] = m.name;
  return names;
}
