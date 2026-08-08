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
}

export function flagsFromEnv(env: NodeJS.ProcessEnv = process.env): PolicyFlags {
  return {
    platformAllowlist: (env.PLATFORM_ALLOWLIST ?? "terrarium,bluesky,mastodon")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    sponsorEnabled: env.SPONSOR_ENABLED === "true",
  };
}

export type ActionIntent =
  | { type: "browse"; url: string }
  | { type: "post" | "comment" | "login" | "create_account"; platform: string }
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
    case "browse":
      // tier 1: read-only browsing is always on; drivers enforce read-only
      // and human speed, this gate enforces that browsing carries no login
      return;
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
