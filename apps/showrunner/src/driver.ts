import type { Page } from "playwright-core";
import type { LiveRuntimePort } from "./runtime-live.js";
import { PolicyViolation, hostAllowed } from "./policy.js";
import { TargetGoneError } from "./showrunner.js";

/**
 * the driver: an agent's hands on its own browser. every visible act is
 * performed on real pages this service serves — opening a post, typing a
 * post into the real compose form, replying in the real comment form —
 * at human speed, 60 to 100 wpm with pauses and corrections, because
 * speed kills the illusion and the illusion here is the truth slowed
 * down. the driver executes intents the showrunner has ALREADY passed
 * through the policy chokepoint; it adds pacing, never permission.
 *
 * a driver act can fail (the browser died, the page hung). failures
 * throw; the showrunner falls back to the transactional client path so
 * the life continues, and health() reports the dead browser. the visible
 * life degrades, the record never lies.
 */

export interface DriverOptions {
  runtime: LiveRuntimePort;
  /** this service's own origin, e.g. http://127.0.0.1:4925 */
  baseUrl: string;
  terrariumToken: string;
  /** speed multiplier for tests (0 = no delays) */
  paceScale?: number;
  /** tier-1: external domains agents may read. empty or absent means the
   * driver refuses every external url, sandbox or not. */
  readingAllowlist?: string[];
  /** the persona's own hosts, by agent id (serial ids resolve to their
   * base member). when present, a read's effective allowlist is this
   * list intersected with the global one, so each identity stays in its
   * own linguistic world; absent means the global list alone governs. */
  readingDomainsFor?: (agentId: string) => string[] | null | undefined;
  /** flipped true only when the boot sandbox probe passed */
  externalEnabled?: boolean;
}

/** link text and hrefs an external reader never clicks: reading is the
 * whole activity, and these are where reading stops being reading */
const FORBIDDEN_LINK =
  /log\s?-?in|sign\s?-?in|sign\s?-?up|subscri|register|account|donat|checkout|cart|paypal|newsletter|password/i;

/** the one short phrase an external page may contribute to an agent's
 * material; anything longer starts to be the page speaking */
export const EXTERNAL_PHRASE_MAX = 90;

/** a page that painted fewer visible characters than this never loaded
 * in any sense a reader would recognize; a real article has hundreds */
export const RENDERED_MIN_CHARS = 40;

/** how long a page gets to put words on the screen before it counts as
 * blank. slow is not dead: a page still painting at 2s is a page, and
 * only one that never paints inside this budget is skipped. */
export const PAINT_BUDGET_MS = 8_000;

/**
 * a navigation that never became a page: refused connection, http
 * error, or a load that painted nothing. the showrunner treats this as
 * "skip and read something else", never as a read: an agent must not
 * sit on camera dwelling on a white page, and the record must not
 * claim a read that did not happen.
 */
export class DeadPageError extends Error {
  readonly url: string;
  constructor(url: string, reason: string) {
    super(`page would not load: ${url} (${reason})`);
    this.name = "DeadPageError";
    this.url = url;
  }
}

/** how many onward links a page may offer the wander; enough to give a
 * path real choices, few enough that a link farm contributes noise, not
 * an itinerary */
export const HARVEST_MAX = 16;

export interface ExternalReadResult {
  domain: string;
  title: string;
  phrase: string;
  /** the url actually on screen when the read ended (a mid-read follow
   * moves it); the record and the walk both start from here */
  url?: string;
  /** allowlisted article links harvested from the final page: where the
   * walk can genuinely go next */
  links?: string[];
}

/**
 * a persona's effective reading ground: its own hosts intersected with
 * the global allowlist, so the persona border can only ever narrow the
 * outer wall, never widen it. no own list means the global list governs
 * alone. pure, so the interlanguage rule is testable without a browser.
 */
export function personaAllowlist(
  own: string[] | null | undefined,
  global: string[]
): string[] {
  if (!own || own.length === 0) return global;
  return own.filter((domain) => hostAllowed(domain, global));
}

/**
 * which harvested anchors count as places a reader would go next. pure
 * and node-side (the page only reports raw {href, text} pairs), so the
 * wander's edge of the allowlist is testable without a browser:
 * http(s) only, allowlisted host only, real link text, none of the
 * forbidden surfaces (login/subscribe/checkout), no self-links, and on
 * wikipedia/wikisource hosts only mainspace pages (/wiki/ with no
 * namespace colon, which also excludes 特別:, Auteur:, Spécial: and
 * their kin in any language). fragments are stripped so a
 * table-of-contents anchor is not a destination. the allowlist passed
 * here is the reader's own effective one, so an interlanguage sidebar
 * link survives only when it points into the reader's own language.
 */
export function linkCandidates(
  raw: Array<{ href: string; text: string }>,
  allowlist: string[],
  currentUrl?: string
): string[] {
  const seen = new Set<string>();
  // the current page may arrive unicode (a cast seed) while hrefs come
  // back percent-encoded from the URL parser; the self-check compares
  // decoded so a page can never offer itself under another spelling
  const current = currentUrl ? decodeURIComponentSafe(stripFragment(currentUrl)) : null;
  const out: string[] = [];
  for (const anchor of raw) {
    if (out.length >= HARVEST_MAX) break;
    const text = (anchor.text ?? "").trim();
    // "real link text" cannot be a latin character count alone: 本居宣長
    // is a whole destination in four characters. cjk text earns its way
    // at two; everything else at nine.
    const meaningful =
      text.length > 8 || (text.length >= 2 && /[぀-ヿ㐀-鿿]/.test(text));
    if (!meaningful) continue;
    let url: URL;
    try {
      url = new URL(anchor.href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    if (!hostAllowed(url.hostname, allowlist)) continue;
    if (FORBIDDEN_LINK.test(text) || FORBIDDEN_LINK.test(anchor.href)) continue;
    if (/(wikipedia|wikisource)\.org$/i.test(url.hostname)) {
      if (!url.pathname.startsWith("/wiki/")) continue;
      const article = decodeURIComponentSafe(url.pathname.slice("/wiki/".length));
      if (article.includes(":") || article.length === 0) continue;
    }
    url.hash = "";
    const href = url.toString();
    if (current && decodeURIComponentSafe(stripFragment(href)) === current) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

function stripFragment(url: string): string {
  const i = url.indexOf("#");
  return i === -1 ? url : url.slice(0, i);
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** driver-enforced tier-2 write caps; breaches throw PolicyViolation and
 * land as public enforcement events like every other refusal */
export const EXTERNAL_WRITE_CAPS = {
  postsPerDay: 2,
  repliesPerHour: 4,
};

class WriteLimiter {
  private posts = new Map<string, number[]>(); // agentId -> epoch ms
  private replies = new Map<string, number[]>();

  checkPost(agentId: string, now = Date.now()): void {
    const window = (this.posts.get(agentId) ?? []).filter((t) => now - t < 86_400_000);
    if (window.length >= EXTERNAL_WRITE_CAPS.postsPerDay) {
      throw new PolicyViolation(
        {
          rule_id: "tier2.rate_cap",
          rule_text: `at most ${EXTERNAL_WRITE_CAPS.postsPerDay} external posts a day`,
        },
        `external_post by ${agentId}`
      );
    }
    window.push(now);
    this.posts.set(agentId, window);
  }

  checkReply(agentId: string, now = Date.now()): void {
    const window = (this.replies.get(agentId) ?? []).filter((t) => now - t < 3_600_000);
    if (window.length >= EXTERNAL_WRITE_CAPS.repliesPerHour) {
      throw new PolicyViolation(
        {
          rule_id: "tier2.rate_cap",
          rule_text: `at most ${EXTERNAL_WRITE_CAPS.repliesPerHour} external replies an hour`,
        },
        `external_reply by ${agentId}`
      );
    }
    window.push(now);
    this.replies.set(agentId, window);
  }
}

/** tier-2 ui maps: where the compose surfaces live per write-capable
 * domain. selectors are validated against the real ui when the tier
 * flips; until then this is shape, exercised only by tests (which may
 * add entries for local fixtures). */
export const WRITE_UI: Record<string, { composeUrl: string; textbox: string; submit: string }> = {
  "bsky.app": {
    composeUrl: "https://bsky.app/",
    textbox: 'div[role="textbox"]',
    submit: 'button[aria-label="Publish post"]',
  },
};

export class BrowserDriver {
  private readonly opts: DriverOptions;
  private readonly busySet = new Set<string>();
  private readonly writeLimiter = new WriteLimiter();
  private readonly disclosureVerified = new Set<string>();

  constructor(opts: DriverOptions) {
    this.opts = opts;
  }

  busy(agentId: string): boolean {
    return this.busySet.has(agentId);
  }

  private page(agentId: string): Page {
    const page = this.opts.runtime.pageFor(agentId);
    if (!page) throw new Error(`no live browser for ${agentId}`);
    return page;
  }

  private async withBusy<T>(agentId: string, work: () => Promise<T>): Promise<T> {
    if (this.busySet.has(agentId)) throw new Error(`${agentId} is mid-act`);
    this.busySet.add(agentId);
    try {
      return await work();
    } finally {
      this.busySet.delete(agentId);
    }
  }

  private pace(ms: number): Promise<void> {
    const scaled = ms * (this.opts.paceScale ?? 1);
    return scaled <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, scaled));
  }

  /**
   * 60-100 wpm is roughly 5-8 chars/second: 120-200ms per keystroke,
   * longer breaths at sentence ends, and the occasional wrong key
   * corrected, because nobody types clean
   */
  async humanType(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector);
    for (const ch of text) {
      if (Math.random() < 0.02 && /[a-z]/.test(ch)) {
        const wrong = String.fromCharCode(97 + Math.floor(Math.random() * 26));
        await page.keyboard.type(wrong);
        await this.pace(180 + Math.random() * 240);
        await page.keyboard.press("Backspace");
        await this.pace(90 + Math.random() * 120);
      }
      await page.keyboard.type(ch);
      await this.pace(120 + Math.random() * 80);
      if (/[.?!]/.test(ch)) await this.pace(400 + Math.random() * 500);
      else if (ch === "\n") await this.pace(600 + Math.random() * 600);
    }
  }

  /**
   * navigation happens the way a person navigates: by clicking a link
   * that is actually on the rendered page. urls are never constructed
   * for posts. the front pages (a tenant's home, the terrarium index)
   * are the addresses an agent knows by heart, so goto is honest there.
   */
  private async gotoFront(page: Page, tenant: string, agentId: string): Promise<void> {
    // home ground is still a page that has to paint: a terrarium that
    // answers with an empty shell would put a white cell on the wall
    // exactly like a dead external link does
    await this.navigate(page, agentId, `${this.opts.baseUrl}/t/${tenant}/`);
  }

  /**
   * every navigation the wall shows goes through here, internal and
   * external alike: a cell must never dwell on a page that is not
   * there. the checks, in order — the navigation itself (a refused
   * connection, a hang), the status (a 404 is not a read), and then
   * the only test that matches what a viewer sees: did words actually
   * paint. slow is not dead, so paint is waited for up to
   * PAINT_BUDGET_MS rather than sampled once.
   *
   * on failure the browser is parked somewhere real (the identity's own
   * ground) rather than on a blank tab, because a white window on the
   * wall is the exact symptom this guard exists to prevent, and the
   * showrunner is about to choose another page anyway.
   */
  private async navigate(page: Page, agentId: string, url: string): Promise<void> {
    const gotoOnce = () => page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    let response: Awaited<ReturnType<typeof gotoOnce>>;
    try {
      try {
        response = await gotoOnce();
      } catch (err) {
        // a prior corpse's error page can commit exactly as this
        // navigation starts, interrupting it; that race has one round,
        // so one clean retry settles it
        if (!String(err).includes("is interrupted by another navigation")) throw err;
        response = await gotoOnce();
      }
    } catch (err) {
      await this.parkSomewhereReal(page, agentId);
      throw new DeadPageError(url, String(err).split("\n")[0] ?? "navigation failed");
    }
    if (response && !response.ok()) {
      await this.parkSomewhereReal(page, agentId);
      throw new DeadPageError(url, `http ${response.status()}`);
    }
    const painted = await this.waitForPaint(page);
    if (painted < RENDERED_MIN_CHARS) {
      await this.parkSomewhereReal(page, agentId);
      throw new DeadPageError(url, `blank page (${painted} chars painted)`);
    }
  }

  /** how many visible characters are on the screen right now */
  private async paintedChars(page: Page): Promise<number> {
    return page
      .evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length)
      .catch(() => 0);
  }

  /** wait for the page to put real words on the screen, up to the paint
   * budget; returns what it had when it got there or gave up */
  private async waitForPaint(page: Page): Promise<number> {
    const deadline = Date.now() + PAINT_BUDGET_MS;
    let painted = await this.paintedChars(page);
    while (painted < RENDERED_MIN_CHARS && Date.now() < deadline) {
      await page.waitForTimeout(250).catch(() => undefined);
      painted = await this.paintedChars(page);
    }
    return painted;
  }

  /** leave the browser on something a viewer would recognize as a page:
   * the identity's own ground, never a blank tab */
  private async parkSomewhereReal(page: Page, agentId: string): Promise<void> {
    // chromium may still be committing its own error page; let that
    // land first so this navigation is not the one interrupted
    await page.waitForEvent("framenavigated", { timeout: 600 }).catch(() => undefined);
    const home = (this.opts.runtime as { homeUrlFor?: (id: string) => string }).homeUrlFor?.(
      agentId
    );
    await page
      .goto(home ?? `${this.opts.baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 10_000 })
      .catch(() => undefined);
  }

  /** click the first rendered link whose href ends with the target path;
   * false when no such link exists on the page */
  private async clickLink(page: Page, pathSuffix: string): Promise<boolean> {
    const link = page.locator(`a[href$="${pathSuffix}"]`).first();
    if ((await link.count()) === 0) return false;
    await this.pace(600 + Math.random() * 900); // finding the link takes a moment
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      link.click(),
    ]);
    return true;
  }

  /** reach a post the human way: land on the tenant's front page, find
   * the post in the listing, click it. throws TargetGoneError, with the
   * browser honestly left on the front page, when the post is not there. */
  private async clickThroughToPost(
    page: Page,
    tenant: string,
    postId: string,
    agentId: string
  ): Promise<void> {
    await this.gotoFront(page, tenant, agentId);
    const clicked = await this.clickLink(page, `/posts/${postId}`);
    if (!clicked) {
      throw new TargetGoneError(`post ${postId} is not on ${tenant}'s page`, `/t/${tenant}/`);
    }
    // the click landed somewhere; the post itself must have painted
    // before the reader dwells on it (a peer's entry is a read like
    // any other, and gets the same guard)
    const painted = await this.waitForPaint(page);
    if (painted < RENDERED_MIN_CHARS) {
      await this.parkSomewhereReal(page, agentId);
      throw new DeadPageError(`/t/${tenant}/posts/${postId}`, `blank page (${painted} chars)`);
    }
  }

  /** open a page and dwell like a reader: settle, then drift down it.
   * terrarium post urls are reached by clicking through the listing;
   * a vanished post leaves the reader on the front page, reported. */
  async openPage(
    agentId: string,
    url: string,
    dwellMs = 20_000
  ): Promise<{ landed: string; detour: boolean; external?: ExternalReadResult }> {
    return this.withBusy(agentId, async () => {
      const page = this.page(agentId);
      let landed = url;
      let detour = false;
      let external: ExternalReadResult | undefined;
      const postUrl = /^\/t\/([a-z0-9-]+)\/posts\/([A-Za-z0-9_]+)$/.exec(url);
      if (postUrl) {
        try {
          await this.clickThroughToPost(
            page,
            postUrl[1] as string,
            postUrl[2] as string,
            agentId
          );
        } catch (err) {
          if (!(err instanceof TargetGoneError)) throw err;
          landed = err.landedUrl;
          detour = true;
          // the front page is where the reader honestly ended up, and it
          // has to have painted too
          const painted = await this.waitForPaint(page);
          if (painted < RENDERED_MIN_CHARS) {
            await this.parkSomewhereReal(page, agentId);
            throw new DeadPageError(err.landedUrl, `blank page (${painted} chars)`);
          }
        }
      } else if (/^https?:\/\//i.test(url)) {
        external = await this.readExternal(page, agentId, url, dwellMs);
        landed = url;
      } else {
        await this.navigate(page, agentId, `${this.opts.baseUrl}${url}`);
      }
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        await this.pace(dwellMs / steps);
        await page.mouse.wheel(0, 120 + Math.random() * 160).catch(() => undefined);
      }
      return { landed, detour, ...(external ? { external } : {}) };
    });
  }

  /**
   * tier-1 reading, on camera: strictly read-only outside the terrarium.
   * scroll and follow same-domain article links only, human pace; never
   * a form, never a login/subscribe link (and the runtime additionally
   * blocks non-GET requests to foreign origins at the network layer).
   * the driver re-checks the allowlist even though the policy chokepoint
   * already did: defense in depth on the one surface that leaves home.
   */
  private async readExternal(
    page: Page,
    agentId: string,
    url: string,
    dwellMs: number
  ): Promise<ExternalReadResult> {
    if (!this.opts.externalEnabled) {
      throw new PolicyViolation(
        {
          rule_id: "tier1.sandbox",
          rule_text: "external pages render only in a sandboxed browser",
        },
        `browse ${url}`
      );
    }
    // the reader's effective ground: its persona's own hosts, inside the
    // global wall. the landing, the mid-read follow and the harvest all
    // measure against this one list, so a read cannot start, move or
    // point outside the identity's own linguistic world.
    const allowlist = personaAllowlist(
      this.opts.readingDomainsFor?.(agentId),
      this.opts.readingAllowlist ?? []
    );
    const host = new URL(url).hostname;
    if (!hostAllowed(host, allowlist)) {
      throw new PolicyViolation(
        {
          rule_id: "tier1.reading_allowlist",
          rule_text: "reading happens on this identity's own allowlisted domains only",
        },
        `browse ${host}`
      );
    }
    await this.navigate(page, agentId, url);
    await this.pace(1500 + Math.random() * 1500); // arrive, settle
    // one short phrase is all a page may contribute; material, not voice
    const phrase = (
      (await page
        .locator("p")
        .first()
        .textContent({ timeout: 3000 })
        .catch(() => "")) ?? ""
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, EXTERNAL_PHRASE_MAX);

    // maybe follow one same-domain article link, like a reader would
    if (Math.random() < 0.6) {
      const next = await page
        .evaluate(
          ({ forbidden }) => {
            const here = window.location.hostname;
            const anchors = Array.from(document.querySelectorAll("a[href]"))
              .map((a) => ({
                href: (a as HTMLAnchorElement).href,
                text: (a.textContent ?? "").trim(),
              }))
              .filter((a) => {
                try {
                  const u = new URL(a.href);
                  return (
                    u.hostname === here &&
                    /^https?:$/.test(u.protocol) &&
                    a.text.length > 8 &&
                    !new RegExp(forbidden, "i").test(a.text) &&
                    !new RegExp(forbidden, "i").test(a.href)
                  );
                } catch {
                  return false;
                }
              });
            return anchors.length > 0
              ? (anchors[Math.floor(Math.random() * anchors.length)]?.href ?? null)
              : null;
          },
          { forbidden: FORBIDDEN_LINK.source }
        )
        .catch(() => null);
      // a url found in page content is followed only if it is itself on
      // the reader's own allowlist; same-domain filtering above makes
      // this a tautology today, and the explicit check keeps it true
      if (next && hostAllowed(new URL(next).hostname, allowlist)) {
        await this.pace(dwellMs / 3);
        const followed = await page
          .goto(next, { waitUntil: "domcontentloaded", timeout: 45_000 })
          .catch(() => null);
        // a follow that lands nowhere is walked back: the reader was
        // already on a real page, and stays there rather than white
        const followedPaint = await page
          .evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length)
          .catch(() => 0);
        if ((followed && !followed.ok()) || followedPaint < RENDERED_MIN_CHARS) {
          await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
        }
      }
    }

    // the read's truth is the FINAL page: a mid-read follow moved the
    // reader, and the record, the material and the walk all start from
    // where it actually ended, never where it meant to go
    const finalUrl = page.url();
    const finalHost = (() => {
      try {
        return new URL(finalUrl).hostname;
      } catch {
        return host;
      }
    })();
    const title = (await page.title().catch(() => "")) || finalHost;
    // harvest where this page can genuinely lead: raw anchors from the
    // browser, the wander's edge decided node-side where it is testable
    const rawAnchors = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"))
          .slice(0, 400)
          .map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: (a.textContent ?? "").trim(),
          }))
      )
      .catch(() => [] as Array<{ href: string; text: string }>);
    const links = linkCandidates(rawAnchors, allowlist, finalUrl);
    return { domain: finalHost, title: title.slice(0, 120), phrase, url: finalUrl, links };
  }

  /** write and publish a post through the real compose form; the browser
   * is the actor and the redirect tells us what was made */
  /**
   * write the post into the real compose form and leave it there,
   * unpublished. this is what a day at the ceiling looks like: the
   * identity still composes, on camera, in the same form, at the same
   * typing speed -- the draft simply does not get submitted. nothing
   * about the world changes, which is the point: a draft is not a lie,
   * it is work that has not been published yet.
   */
  async draftPost(
    agentId: string,
    tenant: string,
    title: string,
    bodyMd: string
  ): Promise<void> {
    return this.withBusy(agentId, async () => {
      const page = this.page(agentId);
      await page.goto(`${this.opts.baseUrl}/t/${tenant}/compose`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await this.humanType(page, 'input[name="title"]', title);
      await this.pace(700 + Math.random() * 800);
      await this.humanType(page, 'textarea[name="body_md"]', bodyMd);
      // the reread, and then nothing. the cursor stays in the body and
      // the wall keeps showing writing until the next act moves it.
      await this.pace(2000 + Math.random() * 2500);
    });
  }

  async publishPost(
    agentId: string,
    tenant: string,
    title: string,
    bodyMd: string
  ): Promise<{ id: string; url: string }> {
    return this.withBusy(agentId, async () => {
      const page = this.page(agentId);
      await page.goto(`${this.opts.baseUrl}/t/${tenant}/compose`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await this.humanType(page, 'input[name="title"]', title);
      await this.pace(700 + Math.random() * 800);
      await this.humanType(page, 'textarea[name="body_md"]', bodyMd);
      await this.pace(1200 + Math.random() * 1500); // the reread before publishing
      await page
        .locator('input[name="token"]')
        .evaluate((el, token) => ((el as HTMLInputElement).value = token), this.opts.terrariumToken);
      await Promise.all([
        page.waitForURL(/\/posts\/[A-Za-z0-9_]+$/, { timeout: 30_000 }),
        page.click('button[type="submit"]'),
      ]);
      const match = /\/posts\/([A-Za-z0-9_]+)$/.exec(new URL(page.url()).pathname);
      if (!match) throw new Error("publish did not land on the post page");
      return { id: match[1] as string, url: `/t/${tenant}/posts/${match[1]}` };
    });
  }

  /**
   * tier 2, dark: post on an external platform through its real ui at
   * human pace. the policy chokepoint has already admitted the intent
   * (so this never runs while TIER2_WRITE_ENABLED is false); the driver
   * still enforces its own caps, verifies the profile carries the
   * disclosure line before the first write of a boot, and types like a
   * person. returns the post's url for the mirrored action event.
   */
  async externalPost(
    agentId: string,
    domain: string,
    text: string,
    profileUrl?: string
  ): Promise<{ url: string | null }> {
    this.writeLimiter.checkPost(agentId);
    const ui = WRITE_UI[domain.toLowerCase()];
    if (!ui) {
      throw new PolicyViolation(
        { rule_id: "tier2.write_allowlist", rule_text: "no ui map for this domain" },
        `external_post on ${domain}`
      );
    }
    return this.withBusy(agentId, async () => {
      const page = this.page(agentId);
      await this.verifyDisclosure(page, agentId, domain, profileUrl);
      await page.goto(ui.composeUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await this.pace(2000 + Math.random() * 2000);
      await this.humanType(page, ui.textbox, text);
      await this.pace(1500 + Math.random() * 1500); // the reread
      await page.click(ui.submit);
      await this.pace(2000);
      return { url: page.url().startsWith("http") ? page.url() : null };
    });
  }

  /** the bio contract is enforced, not promised: before the first
   * external write of a boot, the driver reads the agent's own profile
   * and refuses to write anywhere a disclosure line is missing */
  private async verifyDisclosure(
    page: Page,
    agentId: string,
    domain: string,
    profileUrl?: string
  ): Promise<void> {
    const key = `${agentId}:${domain}`;
    if (this.disclosureVerified.has(key)) return;
    if (!profileUrl) {
      throw new PolicyViolation(
        {
          rule_id: "tier2.disclosure",
          rule_text: "external writing requires a verified disclosed profile",
        },
        `external write on ${domain} with no profile to verify`
      );
    }
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    if (!/autonomous identity/i.test(body) || !/mortal\.systems/i.test(body)) {
      throw new PolicyViolation(
        {
          rule_id: "tier2.disclosure",
          rule_text: 'profile bios must carry "autonomous identity · mortal.systems" and link home',
        },
        `external write on ${domain}`
      );
    }
    this.disclosureVerified.add(key);
  }

  /** reply to a human in the real comment form on the real post page,
   * reached by clicking through the listing like anyone else */
  async replyComment(
    agentId: string,
    tenant: string,
    postId: string,
    author: string,
    body: string
  ): Promise<void> {
    return this.withBusy(agentId, async () => {
      const page = this.page(agentId);
      await this.clickThroughToPost(page, tenant, postId, agentId);
      // reread the thread before answering, like anyone decent
      await this.pace(2500 + Math.random() * 2500);
      await page.fill('input[name="author"]', author);
      await this.humanType(page, 'textarea[name="body"]', body);
      await page
        .locator("form")
        .last()
        .evaluate((form, extras) => {
          for (const [name, value] of Object.entries(extras)) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.value = value;
            form.appendChild(input);
          }
        }, { token: this.opts.terrariumToken, agent_id: agentId });
      await Promise.all([
        page.waitForLoadState("domcontentloaded"),
        page.click('button[type="submit"]'),
      ]);
    });
  }
}
