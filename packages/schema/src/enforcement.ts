/**
 * enforcement labels and the user-facing enforcement table.
 *
 * every permission and privacy control mortal exposes carries exactly one of
 * these labels. the schema constrains which labels each field may carry (see
 * manifest.ts), so a manifest that over-claims enforcement is unrepresentable.
 * this file is the single source the guarantees page, the manager ui, the
 * companion ui, and the ci guarantees gate all read from.
 */

export const ENFORCEMENTS = ["enforced", "advisory", "roadmap"] as const;
export type Enforcement = (typeof ENFORCEMENTS)[number];

export interface EnforcementRow {
  /** dotted field path, or a structural guarantee identifier */
  field: string;
  /** short human label */
  label: string;
  /** the value space this field may take in schema 2.0 */
  value: string;
  enforcement: Enforcement;
  /** honest one-paragraph description of what the label means */
  description: string;
  /**
   * guarantee test ids that must cover this row. informational here; the
   * binding check is tests/guarantees.map.ts plus scripts/check-guarantees.ts,
   * which fails the build if an enforced row is unmapped.
   */
  plannedTests: string[];
  /**
   * set when enforcement is conditional on per-identity configuration: the
   * precondition, in plain language. the identity's own manifest is always
   * authoritative — agent code must read manifest.permissions.<field>
   * .enforcement, never assume the table's ceiling applies to its identity.
   */
  conditional?: string;
}

export const ENFORCEMENT_TABLE: readonly EnforcementRow[] = [
  {
    field: "surfaces.browser.isolation",
    label: "browser state isolation",
    value: "separate chromium user-data-dir per identity",
    enforcement: "enforced",
    description:
      "cookies, localstorage, indexeddb, service workers, http cache, extension state and logged-in sessions live inside the identity's own chromium profile and are absent from every other identity.",
    plannedTests: ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G16"],
  },
  {
    field: "permissions.filesystem",
    label: "filesystem partition",
    value: "identity-partition-only",
    enforcement: "enforced",
    description:
      "files and downloads land under the identity's own files root. destroying one identity never touches another identity's partition.",
    plannedTests: ["G8"],
  },
  {
    field: "permissions.memoryScope",
    label: "memory scope",
    value: "identity-only",
    enforcement: "enforced",
    description:
      "notes and ai context are readable and writable only with the identity's own token. cross-identity access is refused by the runtime, not hidden by the ui.",
    plannedTests: ["G9", "G18"],
  },
  {
    field: "privacy.retainHistory",
    label: "history retention",
    value: "true | false",
    enforcement: "enforced",
    description:
      "when false, browsing-history artifacts are removed from the identity's profile when its browser session ends.",
    plannedTests: ["G15"],
  },
  {
    field: "lifecycle.expiry",
    label: "lifecycle expiry",
    value: "finite lifetimes fire on schedule",
    enforcement: "enforced",
    description:
      "a non-persistent identity expires on schedule and runs its onExpiry action. expirations missed while the runtime was stopped are honored late on the next start, never skipped.",
    plannedTests: ["G10", "G11"],
  },
  {
    field: "lifecycle.destruction",
    label: "destruction",
    value: "journaled deletion contract D0-D7",
    enforcement: "enforced",
    description:
      "destruction removes the identity's browser profile, files, downloads, notes, ai history and database rows, records a tombstone and a destruction report, and resumes from its journal if interrupted.",
    plannedTests: ["G12", "G13", "G14"],
  },
  {
    field: "permissions.wallet",
    label: "wallet",
    value: "none | read-intent | declared",
    enforcement: "advisory",
    description:
      "a declaration shown in the ui, not a technical control. mortal does not restrict which wallet extensions run inside an identity in v1.",
    plannedTests: ["BADGE-1"],
  },
  {
    field: "permissions.network",
    label: "network route",
    value: "standard | routed",
    enforcement: "enforced",
    description:
      "an identity with a network route attached is bound to it: chromium is launched on that route, every non-local request goes through it, and there is no direct fallback if the route is down. an identity with no route stays 'standard' and shares your ip address and network path — the schema cannot express enforcement without an attached route, so the badge only reads enforced when the control is real.",
    plannedTests: ["G19"],
    conditional:
      "enforced only for identities with a network route attached; routeless identities remain advisory",
  },
  {
    field: "permissions.email",
    label: "email",
    value: "none | temporary | dedicated",
    enforcement: "roadmap",
    description:
      "email aliasing is not built. the field exists so blueprints can declare intent; it enforces nothing today.",
    plannedTests: ["BADGE-1"],
  },
  {
    field: "privacy.redaction",
    label: "redaction",
    value: "false",
    enforcement: "roadmap",
    description: "content redaction is not built. the schema pins this value to false.",
    plannedTests: ["BADGE-1"],
  },
];

/** fields whose enforcement is "enforced" — every one must be mapped to a passing test (ci gate) */
export const ENFORCED_FIELDS: readonly string[] = ENFORCEMENT_TABLE.filter(
  (r) => r.enforcement === "enforced"
).map((r) => r.field);

export const ADVISORY_FIELDS: readonly string[] = ENFORCEMENT_TABLE.filter(
  (r) => r.enforcement === "advisory"
).map((r) => r.field);

export const ROADMAP_FIELDS: readonly string[] = ENFORCEMENT_TABLE.filter(
  (r) => r.enforcement === "roadmap"
).map((r) => r.field);

/**
 * the branded-chrome companion caveat (risk r3), single-sourced like the
 * enforcement table: every surface that states the claim renders this string
 * (runtime discovery warning, companion-missing launch warning, cli help),
 * and the docs that repeat it are held to it verbatim by
 * scripts/check-guarantees.ts, so the wording cannot drift.
 *
 * precision matters: isolation is NOT affected — branded chrome still honors
 * --user-data-dir, so identities keep their separate profiles. what branded
 * chrome cannot do is load the companion extension.
 */
export const BRANDED_CHROME_COMPANION_CAVEAT =
  "branded google chrome cannot load the companion (the --load-extension killswitch was removed in chrome >=141); " +
  "use chromium or brave — or set MORTAL_BROWSER_PATH — or install the companion from the web store when it ships. " +
  "isolation is unaffected: --user-data-dir still works on branded chrome, so every identity keeps its own separate profile; " +
  "only the companion surface (side panel, badge, self api) is unavailable.";

/**
 * fields that are enforced but only for identities configured for them.
 * field -> precondition. consumed by runtime.capabilities() so agents can
 * feature-detect honestly instead of assuming a ceiling applies to them.
 */
export const CONDITIONAL_ENFORCEMENT: Readonly<Record<string, string>> = Object.fromEntries(
  ENFORCEMENT_TABLE.filter((r) => r.conditional !== undefined).map((r) => [r.field, r.conditional!])
);

/** fixed caveats attached to every destruction report. never trimmed. */
export const DESTRUCTION_CAVEATS: readonly string[] = [
  "data websites stored server-side while this identity was logged in is not removed",
  "anything exported or moved outside the identity's folders is not removed",
  "os-level artifacts outside mortal's control (search indexes, thumbnails, backups you configured) are not removed",
  "on some storage hardware, deleted data may remain recoverable by forensic tools. destroyed means removed, not forensically shredded",
];

/** printed verbatim in the ui wherever an identity is shown as destroyed */
export const DESTROYED_MEANS =
  "mortal systems removed the identity's browser profile, files, downloads, notes, memory, and ai history from this machine, and recorded the destruction. " +
  "mortal cannot remove: data websites stored server-side while you were logged in, anything you exported or moved outside the identity's folders, " +
  "os-level artifacts (search indexes, thumbnails, backups you configured), or data recoverable by forensic tools on some storage hardware. " +
  "destroyed means removed, not forensically shredded.";

/** printed on the site and in the manager. mortal separates state; it does not anonymize in v1. */
export const NON_GUARANTEES: readonly string[] = [
  "identities without a network route attached share your ip address",
  "identities on the same machine share your device fingerprint",
  "websites can correlate identities via behavior, reused accounts, or reused wallets",
  "clipboard contents you carry between identities are not separated",
  "data a website already holds server-side is outside mortal's reach",
];
