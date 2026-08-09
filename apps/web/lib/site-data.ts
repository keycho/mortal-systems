/**
 * landing-page content, ported from the design handoff. copy is the
 * handoff's, verbatim, with three exceptions where the handoff's data had
 * gone stale against the schema (the enforcement table is the source of
 * truth and the site must never contradict the /guarantees page it links
 * to):
 *
 * - network: the handoff labeled it "G12 · ADVISORY · routing per identity
 *   is not in version one". since G19, an attached route IS enforced
 *   (bring your own proxy); routeless identities remain advisory. the cell
 *   now carries G19 · ENFORCED with the condition stated in the copy.
 * - device fingerprint: the handoff labeled it "G13 · ADVISORY". it is a
 *   stated non-guarantee (see NON_GUARANTEES), not a default you can
 *   change, so advisory would contradict the legend. it renders with the
 *   handoff's own DECLARED chip idiom (stated, not a technical control).
 * - blueprint network rows keep their truthful ADVISORY label but drop the
 *   stale G12 test id (G19 tests route enforcement, not the shared-host
 *   default, and G12 is a destruction test).
 */

export type ChipTone = "enforced" | "advisory" | "declared";

export interface GuaranteeCell {
  id: string | null;
  tone: ChipTone;
  name: string;
  desc: string;
}

/** the landing grid: seven enforced guarantees and two stated limits */
export const GUARANTEE_CELLS: GuaranteeCell[] = [
  { id: "G1", tone: "enforced", name: "cookies", desc: "each identity has its own cookie jar. nothing crosses." },
  { id: "G2", tone: "enforced", name: "local storage", desc: "storage, indexeddb and cache are scoped to the identity." },
  { id: "G4", tone: "enforced", name: "history", desc: "browsing history lives in the identity and is removed on expiry." },
  {
    id: "G7",
    tone: "enforced",
    name: "local sessions",
    desc: "cookies, tokens and local login state are deleted with the identity. mortal does not claim to invalidate server-side sessions.",
  },
  { id: "G8", tone: "enforced", name: "files", desc: "downloads land in the identity’s own partition, never yours." },
  {
    id: "G9",
    tone: "enforced",
    name: "memory",
    desc: "notes and context remain scoped to the identity. they are never shared with another identity.",
  },
  { id: "G11", tone: "enforced", name: "lifetime", desc: "expiry triggers destruction. it is not a suggestion." },
  {
    id: "G19",
    tone: "enforced",
    name: "network",
    desc: "an attached route is enforced: no direct fallback. identities without one share your ip. mortal does not provide routing; bring your own proxy.",
  },
  {
    id: null,
    tone: "declared",
    name: "device fingerprint",
    desc: "identities on one machine share hardware traits. stated, not hidden.",
  },
];

export interface BlueprintRow {
  k: string;
  v: string;
  tid: string | null;
  tone: ChipTone;
}

export interface BlueprintCard {
  name: string;
  dot: string;
  cat: string;
  desc: string;
  rows: BlueprintRow[];
}

export const BLUEPRINT_CARDS: BlueprintCard[] = [
  {
    name: "Client Operations",
    dot: "var(--state-persistent-d)",
    cat: "CLIENT WORK",
    desc: "a persistent space scoped to a single client engagement. context never bleeds into other clients.",
    rows: [
      { k: "lifetime", v: "persistent", tid: "G11", tone: "enforced" },
      { k: "browser", v: "isolated profile", tid: "G1", tone: "enforced" },
      { k: "memory", v: "identity only", tid: "G9", tone: "enforced" },
      { k: "files", v: "managed locally", tid: "G8", tone: "enforced" },
    ],
  },
  {
    name: "Vendor Audit",
    dot: "var(--state-expiring-d)",
    cat: "RESEARCH",
    desc: "a timed browser environment for corporate filings, records and due-diligence workflows. local session state is destroyed on expiry.",
    rows: [
      { k: "lifetime", v: "12h · destroy on expiry", tid: "G11", tone: "enforced" },
      { k: "browser", v: "isolated profile", tid: "G1", tone: "enforced" },
      { k: "history", v: "removed on expiry", tid: "G4", tone: "enforced" },
      { k: "network", v: "shared host route", tid: null, tone: "advisory" },
      { k: "credentials", v: "not managed by mortal", tid: null, tone: "declared" },
    ],
  },
  {
    name: "Onchain Investigator",
    dot: "var(--state-active-d)",
    cat: "INVESTIGATION",
    desc: "a short-lived space for one investigation. everything it touches is destroyed on expiry.",
    rows: [
      { k: "lifetime", v: "45m · destroy on expiry", tid: "G11", tone: "enforced" },
      { k: "browser", v: "isolated profile", tid: "G1", tone: "enforced" },
      { k: "downloads", v: "scoped", tid: "G8", tone: "enforced" },
      { k: "network", v: "shared host route", tid: null, tone: "advisory" },
    ],
  },
];

export interface Platform {
  name: string;
  arch: string;
  signed: string;
  /** a real artifact url, or null. null renders the dashed "coming" state:
   * a solid download button may only exist once there is a file behind it. */
  href: string | null;
}

/** the one shipped artifact: the unsigned macos (apple silicon) alpha,
 * built by release-macos.yml and published to a github release under
 * this asset name. /releases/latest/download resolves to the newest
 * release carrying it. */
export const MACOS_ALPHA_DMG_URL =
  "https://github.com/keycho/mortal-systems/releases/latest/download/mortal_0.1.0.dmg";

/** every real download button says the same thing */
export const DOWNLOAD_CTA_LABEL = "download mortalOS";

/** printed verbatim next to every download surface. the build is
 * deliberately unsigned (no apple developer enrollment until demonstrated
 * interest), and hiding that would be a lie of omission. */
export const ALPHA_INSTALL_NOTE =
  "alpha · unsigned macOS build. after downloading, right-click the app → Open to bypass the unidentified-developer warning.";

/** revealed the moment a download starts, right where the click
 * happened: the unsigned warning arrives exactly when it becomes
 * relevant, and the claims are the footer's own, nothing new */
export const POST_DOWNLOAD_NOTE =
  "downloading mortalOS. alpha software, unsigned build: macOS will warn the first time, so right-click the app and choose Open. local-first, no account, no telemetry.";

/** a card flips to a solid button only when a real artifact url lands in
 * its href; null renders the dashed "coming" state (never a dead button).
 * the macos apple-silicon alpha shipped unsigned and its label says so;
 * the remaining cards stay pending slots until their artifacts exist. */
export const PLATFORMS: Platform[] = [
  { name: "macOS", arch: "apple silicon", signed: "alpha · unsigned · right-click Open to run", href: MACOS_ALPHA_DMG_URL },
  { name: "macOS", arch: "intel", signed: "signed · notarization: pending slot", href: null },
  { name: "Windows", arch: "x64", signed: "signed · authenticode: pending slot", href: null },
  { name: "Linux", arch: "x64 · AppImage", signed: "signed · gpg key: pending slot", href: null },
];

/** the use-case band (founder copy, final as written) */
export const USE_CASES: Array<{ label: string; body: string }> = [
  {
    label: "AGENT OPERATIONS",
    body: "Give each agent a persistent operational identity instead of access to your personal browser. It can build context over time without inheriting yours.",
  },
  {
    label: "GLOBAL RESEARCH",
    body: "Launch region-specific research identities with dedicated routes, local browser settings and isolated downloads.",
  },
  {
    label: "MULTI-CLIENT WORK",
    body: "Keep one persistent identity per client. Sessions, notes, files and accounts never cross engagements.",
  },
  {
    label: "CRYPTO OPERATIONS",
    body: "Separate investigations, communities, projects and operational accounts into isolated environments with explicit permissions.",
  },
  {
    label: "PRODUCT TESTING",
    body: "Enter your product as a clean user, returning user or user from another market without contaminating the test with existing browser state.",
  },
  {
    label: "DISPOSABLE TASKS",
    body: "Provision an identity for a single operation and automatically destroy its managed state when the work ends.",
  },
];

/**
 * landing display copy for the blueprints section (founder copy). these are
 * NOT the shipped blueprints: the three real first-party blueprints render
 * from BLUEPRINT_CARDS below, and the section's footnote says exactly which
 * ship. rendered with the site's middot idiom, never an em dash.
 */
export const BLUEPRINT_DISPLAY: Array<{ name: string; region: string }> = [
  { name: "regional researcher", region: "germany" },
  { name: "onchain investigator", region: "singapore" },
  { name: "client operations", region: "united states" },
  { name: "product tester", region: "brazil" },
  { name: "community operator", region: "global" },
];

/**
 * the proof band. the test count is the repo's real, verified count at the
 * time this file was last edited (vitest suites across all packages and
 * apps); update it when it drifts, never round it up.
 */
export const PROOF_BAND = ["258 tests", "open source", "signed builds at release", "every guarantee has a test id you can read"];
