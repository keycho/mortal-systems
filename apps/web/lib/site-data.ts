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

/** no build has shipped yet, so every card is honest about it. when a
 * signed artifact exists, set its href and the card flips to a solid
 * button. (the handoff marked macos apple silicon available; there is no
 * artifact url yet, and the handoff's own rule is "never a dead button".) */
export const PLATFORMS: Platform[] = [
  { name: "macOS", arch: "apple silicon", signed: "signed · notarization: pending slot", href: null },
  { name: "macOS", arch: "intel", signed: "signed · notarization: pending slot", href: null },
  { name: "Windows", arch: "x64", signed: "signed · authenticode: pending slot", href: null },
  { name: "Linux", arch: "x64 · AppImage", signed: "signed · gpg key: pending slot", href: null },
];

export const JOBS: Array<{ label: string; body: string }> = [
  { label: "AGENTS", body: "give your claude code or ai agent a disposable identity, not your browser." },
  { label: "CLIENT WORK", body: "one identity per client, destroyed at offboarding. nothing bleeds between clients." },
  { label: "RESEARCH", body: "a research or due-diligence session that leaves nothing behind." },
  { label: "TESTING", body: "a fresh, clean environment for testing as a new user." },
];

/**
 * the proof band. the test count is the repo's real, verified count at the
 * time this file was last edited (vitest suites across all packages and
 * apps); update it when it drifts, never round it up.
 */
export const PROOF_BAND = ["241 tests", "open source", "signed builds at release", "every guarantee has a test id you can read"];
