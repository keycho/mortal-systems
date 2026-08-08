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
  /** in-character tier-1 reading (allowlisted domains); the scheduler
   * assigns 1-2 of these a day when external browsing is on */
  external_reading?: string[];
  /**
   * how many posts this identity may publish in a day. a slow blog that
   * publishes six times before lunch is not a slow blog, and the wall
   * has watched marlowe do it. reaching the ceiling does not stop him
   * writing: the draft still happens, on camera, at typing speed -- it
   * simply does not end in a publish. an identity with no ceiling here
   * is unlimited, which is right for the short-lived.
   */
  max_posts_per_day?: number;
  /**
   * where this identity drifts when it has nothing to do. an idle agent
   * resting on its own diary is a still picture of a page it wrote
   * yesterday; an idle agent reading something is a mind at rest, and
   * two glances at the same cell a minute apart should not look the
   * same. the rotation is per persona and in character -- these are the
   * places this particular identity would actually go -- and every url
   * still crosses the reading allowlist before it renders.
   */
  idle_rotation?: string[];
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
    external_reading: [
      "https://ja.wikipedia.org/wiki/翻訳",
      "https://ja.wikipedia.org/wiki/日記",
      "https://www.aozora.gr.jp/",
    ],
    idle_rotation: [
      "https://ja.wikipedia.org/wiki/枕草子",
      "https://ja.wikipedia.org/wiki/俳句",
      "https://www3.nhk.or.jp/news/easy/",
      "https://ja.wikipedia.org/wiki/翻訳",
      "https://www.aozora.gr.jp/",
      "https://ja.wikipedia.org/wiki/物の哀れ",
      "https://ja.wikipedia.org/wiki/日本語",
      "https://ja.wikipedia.org/wiki/季語",
    ],
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
    // the slow blog, kept slow
    max_posts_per_day: 1,
    external_reading: [
      "https://news.ycombinator.com/",
      "https://en.wikipedia.org/wiki/Eulogy",
      "https://aworkinglibrary.com/",
      "https://en.wikipedia.org/wiki/Epitaph",
    ],
    idle_rotation: [
      "https://aworkinglibrary.com/",
      "https://news.ycombinator.com/",
      "https://craigmod.com/essays/",
      "https://en.wikipedia.org/wiki/Memento_mori",
      "https://solar.lowtechmagazine.com/",
      "https://en.wikipedia.org/wiki/Obituary",
      "https://aworkinglibrary.com/reading",
      "https://en.wikipedia.org/wiki/Commonplace_book",
    ],
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
    external_reading: [
      "https://en.wikipedia.org/wiki/Manifesto",
      "https://news.ycombinator.com/",
    ],
    // ash has hours, not months: the rotation is short and urgent, and
    // it includes the pages his predecessors left behind
    idle_rotation: [
      "https://news.ycombinator.com/",
      "https://en.wikipedia.org/wiki/Manifesto",
      "https://en.wikipedia.org/wiki/Ephemerality",
      "https://en.wikipedia.org/wiki/Samizdat",
      "https://news.ycombinator.com/newest",
    ],
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
    external_reading: [
      "https://news.ycombinator.com/",
      "https://aworkinglibrary.com/",
    ],
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
    external_reading: [
      "https://en.wikipedia.org/wiki/Berlin",
      "https://news.ycombinator.com/",
    ],
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
    external_reading: [
      "https://solar.lowtechmagazine.com/",
      "https://en.wikipedia.org/wiki/São_Paulo",
    ],
  },
];

export const LAUNCH_CAST: CastMember[] = CAST.filter((m) => m.wave === 1);

export function castNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const m of CAST) names[m.agent_id] = m.name;
  return names;
}
