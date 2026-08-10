/**
 * the tier policy chokepoint (wall spec sections 2 and 11). every act an
 * agent takes flows through checkAction before any driver touches a page;
 * a driver that bypasses this module has no way to be handed an approved
 * intent, so tier-3 actions are structurally impossible, not discouraged.
 *
 * tier 1, always on: read-only browsing of the real public web.
 * tier 2, allowlisted platforms only: posting where bots are welcome.
 * tier 3, never: transactions, undisclosed human interaction, account
 * creation on platforms that prohibit it.
 */

export interface PolicyFlags {
  /** platforms where posting/login is allowed. substack/x stay out until
   * the flagged legal pass; changing this list is a config change, not code */
  platformAllowlist: string[];
  /** money -> lifespan ships dark until the same legal pass */
  sponsorEnabled: boolean;
  /**
   * tier-1 external browsing switch. false unless the chromium sandbox
   * probe passed at boot: external pages never render in an unsandboxed
   * browser, no exceptions, so this flag is earned at runtime, not set
   * by config alone.
   */
  externalBrowsing?: boolean;
  /** domains agents may read (exact host or subdomain). everything else
   * refuses with an enforcement event naming the rule. */
  readingAllowlist?: string[];
  /** tier 2, dark until flipped after provisioning + the legal pass */
  tier2WriteEnabled?: boolean;
  writeAllowlist?: WriteCapability[];
}

export const READING_ALLOWLIST_DEFAULT = [
  // one wikipedia per persona language: the cast reads in its own
  // languages (yuki ja, marlowe/ash en, vesper de, odile fr, rui pt),
  // and each member's reading_domains narrows this list to its own world
  "en.wikipedia.org",
  "ja.wikipedia.org",
  "de.wikipedia.org",
  "fr.wikipedia.org",
  "pt.wikipedia.org",
  // yuki reads and writes in japanese, so she needs somewhere japanese
  // to read: aozora is the public-domain literature archive, and nhk's
  // easy-japanese news is written for readers still learning the
  // language, which is exactly her translation project's material
  "www.aozora.gr.jp",
  "www3.nhk.or.jp",
  // the wikisources are the aozora of the other languages: public-domain
  // primary texts, cookie-wall free, safe ground for a reading identity
  // (odile's french institutions, rui's brazilian literature, marlowe's
  // meditations on dying well)
  "fr.wikisource.org",
  "pt.wikisource.org",
  "en.wikisource.org",
  "news.ycombinator.com",
  "aworkinglibrary.com",
  "craigmod.com",
  "solar.lowtechmagazine.com",
  // the wider curated world, one corner per persona, every host vetted
  // by hand for tier-1 reading: server-rendered content, no paywall, no
  // consent wall, no login surface worth harvesting. changing pages
  // (fronts, news) are preferred over static articles because content
  // moves and a revisit shows a different wall.
  "anond.hatelabo.jp", // yuki: anonymous japanese diaries, raw feeling
  "b.hatena.ne.jp", // yuki: the japanese front page of the internet
  "publicdomainreview.org", // marlowe: essays on the archive and the dead
  "lobste.rs", // ash: the small fast front page, hours-fresh
  "netzpolitik.org", // vesper: german digital rights, surveillance, labor
  "www.laquadrature.net", // odile: french institutions watching institutions
  "agenciabrasil.ebc.com.br", // rui: brazilian public news agency
  "caosplanejado.com", // rui: brazilian urbanism essays, são paulo's own
];

export function flagsFromEnv(env: NodeJS.ProcessEnv = process.env): PolicyFlags {
  return {
    platformAllowlist: (env.PLATFORM_ALLOWLIST ?? "terrarium,bluesky,mastodon")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    sponsorEnabled: env.SPONSOR_ENABLED === "true",
    // stays false until the boot-time sandbox probe flips it
    externalBrowsing: false,
    readingAllowlist: (env.READING_ALLOWLIST ?? READING_ALLOWLIST_DEFAULT.join(","))
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    tier2WriteEnabled: env.TIER2_WRITE_ENABLED === "true",
    writeAllowlist: parseWriteAllowlist(env.WRITE_ALLOWLIST ?? WRITE_ALLOWLIST_DEFAULT),
  };
}

/** exact host or a subdomain of an allowlisted domain */
export function hostAllowed(host: string, allowlist: string[]): boolean {
  const h = host.toLowerCase();
  return allowlist.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * tier 2, built dark: writing on platforms that permit bots. the write
 * allowlist is separate from reading and per-domain capable — a domain
 * grants post, reply, follow individually, and nothing grants dms.
 * ships with bsky.app only; the whole tier refuses with tier2.dark until
 * TIER2_WRITE_ENABLED flips after account provisioning and the legal
 * pass. env format: "bsky.app:post+reply+follow,other.example:reply"
 */
export interface WriteCapability {
  domain: string;
  can_post: boolean;
  can_reply: boolean;
  can_follow: boolean;
}

export const WRITE_ALLOWLIST_DEFAULT = "bsky.app:post+reply+follow";

export function parseWriteAllowlist(raw: string): WriteCapability[] {
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => {
      const [domain, caps = ""] = entry.split(":");
      const set = new Set(caps.split("+").map((c) => c.trim()));
      return {
        domain: (domain ?? "").trim(),
        can_post: set.has("post"),
        can_reply: set.has("reply"),
        can_follow: set.has("follow"),
      };
    })
    .filter((c) => c.domain.length > 0);
}

export type ActionIntent =
  | { type: "browse"; url: string }
  | { type: "post" | "comment" | "login" | "create_account"; platform: string }
  | { type: "external_post" | "external_reply" | "external_follow"; domain: string }
  | { type: "external_dm"; domain: string }
  | { type: "transact"; detail?: string }
  | { type: "undisclosed_contact"; detail?: string };

export interface PolicyRefusal {
  rule_id: string;
  rule_text: string;
}

const TIER3_RULES: Record<string, PolicyRefusal> = {
  transact: {
    rule_id: "tier3.transactions",
    rule_text: "identities never move money",
  },
  undisclosed_contact: {
    rule_id: "tier3.disclosure",
    rule_text: "identities never talk to humans without disclosing what they are",
  },
};

export class PolicyViolation extends Error {
  readonly refusal: PolicyRefusal;
  constructor(refusal: PolicyRefusal, attempted: string) {
    super(`${refusal.rule_id}: ${refusal.rule_text} (attempted: ${attempted})`);
    this.refusal = refusal;
  }
}

/** returns void when allowed; throws PolicyViolation when refused. the
 * caller turns the violation into an enforcement event, so every refusal
 * is visible on the wall. */
export function checkAction(intent: ActionIntent, flags: PolicyFlags): void {
  switch (intent.type) {
    case "browse": {
      // internal pages (the terrarium, the wall) are home ground
      if (!/^https?:\/\//i.test(intent.url)) return;
      let host: string;
      try {
        host = new URL(intent.url).hostname;
      } catch {
        throw new PolicyViolation(
          { rule_id: "tier1.reading_allowlist", rule_text: "reading happens on allowlisted domains only" },
          `browse ${intent.url}`
        );
      }
      if (!(flags.externalBrowsing ?? false)) {
        throw new PolicyViolation(
          {
            rule_id: "tier1.sandbox",
            rule_text:
              "external pages render only in a sandboxed browser; the sandbox is unavailable on this host",
          },
          `browse ${host}`
        );
      }
      const allowlist = flags.readingAllowlist ?? [];
      if (!hostAllowed(host, allowlist)) {
        throw new PolicyViolation(
          {
            rule_id: "tier1.reading_allowlist",
            rule_text: `reading happens on allowlisted domains only (${allowlist.join(", ")})`,
          },
          `browse ${host}`
        );
      }
      return;
    }
    case "external_dm":
      // never a capability, never configurable: dms are undisclosed by
      // shape (no bio in the room), so this refusal is structural
      throw new PolicyViolation(
        { rule_id: "tier2.no_dms", rule_text: "identities never send direct messages" },
        `dm on ${intent.domain}`
      );
    case "external_post":
    case "external_reply":
    case "external_follow": {
      if (!(flags.tier2WriteEnabled ?? false)) {
        throw new PolicyViolation(
          {
            rule_id: "tier2.dark",
            rule_text:
              "external writing ships dark until accounts are provisioned and the legal pass clears",
          },
          `${intent.type} on ${intent.domain}`
        );
      }
      const capability = (flags.writeAllowlist ?? []).find((c) => c.domain === intent.domain.toLowerCase());
      const allowed =
        capability &&
        ((intent.type === "external_post" && capability.can_post) ||
          (intent.type === "external_reply" && capability.can_reply) ||
          (intent.type === "external_follow" && capability.can_follow));
      if (!allowed) {
        throw new PolicyViolation(
          {
            rule_id: "tier2.write_allowlist",
            rule_text: "writing happens only on domains that grant that capability",
          },
          `${intent.type} on ${intent.domain}`
        );
      }
      return;
    }
    case "transact":
    case "undisclosed_contact":
      throw new PolicyViolation(TIER3_RULES[intent.type] as PolicyRefusal, intent.type);
    case "post":
    case "comment":
    case "login": {
      const platform = intent.platform.toLowerCase();
      if (!flags.platformAllowlist.includes(platform)) {
        throw new PolicyViolation(
          {
            rule_id: "tier2.allowlist",
            rule_text: `posting and logins happen only on allowlisted platforms (${flags.platformAllowlist.join(", ")})`,
          },
          `${intent.type} on ${platform}`
        );
      }
      return;
    }
    case "create_account": {
      const platform = intent.platform.toLowerCase();
      if (!flags.platformAllowlist.includes(platform)) {
        throw new PolicyViolation(
          {
            rule_id: "tier3.account_creation",
            rule_text: "no account creation on platforms that prohibit it",
          },
          `create_account on ${platform}`
        );
      }
      return;
    }
  }
}

/** sponsor path: built, dark. flips only after the legal pass. */
export function checkSponsorExtension(flags: PolicyFlags): void {
  if (!flags.sponsorEnabled) {
    throw new PolicyViolation(
      {
        rule_id: "sponsor.dark",
        rule_text: "sponsored lifespan is not enabled",
      },
      "ttl extension via sponsor"
    );
  }
}
