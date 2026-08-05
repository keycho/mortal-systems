# threat model — mortal poc

status: living document. the companion-trust section below is designed and
current; sections marked *stub* get their full sweep on day 7.

## scope and assets

mortal separates **state and context** between identities on one machine:
chromium profile state (cookies, storage, sessions, extensions), files and
downloads, notes, ai context, and lifecycle. the assets are (a) each
identity's partition and memory, (b) the per-identity companion bearer
tokens, (c) the admin rpc token, (d) the deletion contract's integrity.

**non-goals in v1, printed in the ui:** anonymity. identities on the same
machine share ip and device fingerprint; websites can correlate via behavior,
reused accounts, reused wallets, clipboard. server-side data is out of reach.

## trust boundaries

- **the machine is the outer boundary.** a local process running as the user
  can read the runtime root (stamped tokens, admin token file, sqlite). the
  poc does not defend against local malware; mvp moves token custody to the
  os keychain and adds at-rest encryption (see DECISIONS.md).
- **the browser origin boundary is defended.** a malicious *website* inside
  any identity's browser that probes `127.0.0.1` always carries an `Origin`
  header; the runtime refuses any origin that is not that identity's own
  companion. token-only requests without an `Origin` are, by construction,
  local processes already inside the outer boundary.
- **identity-to-identity is defended by construction.** the `/v1/self`
  surface derives the identity from the bearer token; no route can name
  another identity; note/message ids are identity-scoped in every query.
  chromium profile separation (separate `--user-data-dir`) carries the
  browser-state half; the g-suite (day 6) is its test.

## companion trust and distribution

**today (unpacked stamping).** the runtime stamps one companion copy per
identity and loads it with `--load-extension`. each copy gets a path-derived,
per-identity extension id (no manifest `key` — deliberately, see
DECISIONS.md), so the origin check distinguishes *which identity's* companion
is calling. verified against real chromium on linux and macos (brave).
limitation, stated honestly (r3, upgraded from "may ignore" on 2026-08-05):
branded google chrome cannot load the companion (the --load-extension
killswitch was removed in chrome >=141); use chromium or brave — or set
MORTAL_BROWSER_PATH — or install the companion from the web store when it
ships. isolation is unaffected: --user-data-dir still works on branded
chrome, so every identity keeps its own separate profile; only the companion
surface (side panel, badge, self api) is unavailable. where the companion is
absent, the runtime says so in `status.warnings`, and `/v1/self` simply has
no legitimate browser client — authentication for local token-only clients
rests on the bearer token alone, inside the local trust boundary. this
promotes the web store listing from optional to the distribution path for
chrome-majority users (tracked as a human-on-ramp blocker in PROGRESS.md).

**designed (not built): chrome web store distribution + pairing handshake.**
a store-distributed companion has one constant, key-derived extension id for
every user and profile. consequences and design, decided now so the store
path cannot be built naively later:

- the origin check degrades by design from "which identity" to "a genuine
  companion": it pins the single store id and can no longer distinguish
  identities. identity binding therefore moves out of the origin and into a
  **pairing handshake**:
  1. **preferred: native-messaging attestation.** the runtime registers a
     native messaging host. the store companion calls
     `chrome.runtime.connectNative`; the browser spawns the host, which
     identifies the calling browser's profile (`--user-data-dir` of its
     parent browser process), maps profile → identity, and returns
     `{identityId, token}` directly into that profile's companion storage.
     binding is profile-derived — exactly the identity boundary — with no
     user interaction.
  2. **fallback: one-time pairing code.** the manager displays a short-lived
     (60s), single-use code per identity; the user enters it in the side
     panel; the runtime exchanges code → token over loopback. binding rests
     on the user acting in the right window; codes never grant more than
     their one identity.
- invariants under either mechanism: the hmac-derived bearer token remains
  the sole authority; each profile's companion storage holds only its own
  identity's token (chrome extension storage is per-profile — the same
  isolation the g-suite tests); revocation is secret rotation.
- threat delta vs unpacked: cross-identity replay (a companion in profile A
  presenting a stolen token B) is no longer origin-detectable. mitigations:
  token issuance is bound to the profile (native host delivers into the
  requesting profile only; pairing codes are single-use and short-lived), and
  obtaining token B in the first place requires filesystem or profile
  compromise — outside the browser-origin threat class the check exists for.
- malicious websites remain refused (their origin is never the store id);
  other extensions cannot read the companion's storage.
- **no store submission in the poc.** nothing above is implemented; it is
  recorded so the constraint (constant store id ⇒ handshake required) is a
  design input, not a surprise.

## adversaries considered (summary)

| adversary | defense | status |
|---|---|---|
| malicious website probing the loopback api | origin pinning per identity; 403 | tested (linux, macos/brave) |
| one identity's compromised companion reaching another identity | token scoping; no cross-identity routes; per-identity origin (unpacked) | tested (runtime-level G18 shape) |
| cross-identity browser-state leakage | separate user-data-dirs | day-6 g-suite |
| stale/forged blueprint content | strict schema, banned content unrepresentable, url hygiene | tested at schema level; pipeline day 5 |
| local processes as the user | outside the poc boundary; keychain custody + at-rest encryption at mvp | documented, not defended |
| forensic recovery after destroy | out of scope; "destroyed means removed, not forensically shredded" | documented in every destruction report |

## stubs pending day 7

full sweep of: scheduler-driven expiry abuse (clock manipulation), companion
sse resource exhaustion, blueprint registry distribution (poc has no
registry), tauri shell surface, downloads-partition escape vectors.
