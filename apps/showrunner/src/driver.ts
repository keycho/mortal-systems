import type { Page } from "playwright-core";
import type { LiveRuntimePort } from "./runtime-live.js";
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
}

export class BrowserDriver {
  private readonly opts: DriverOptions;
  private readonly busySet = new Set<string>();

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
  private async gotoFront(page: Page, tenant: string): Promise<void> {
    await page.goto(`${this.opts.baseUrl}/t/${tenant}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
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
  private async clickThroughToPost(page: Page, tenant: string, postId: string): Promise<void> {
    await this.gotoFront(page, tenant);
    const clicked = await this.clickLink(page, `/posts/${postId}`);
    if (!clicked) {
      throw new TargetGoneError(`post ${postId} is not on ${tenant}'s page`, `/t/${tenant}/`);
    }
  }

  /** open a page and dwell like a reader: settle, then drift down it.
   * terrarium post urls are reached by clicking through the listing;
   * a vanished post leaves the reader on the front page, reported. */
  async openPage(
    agentId: string,
    url: string,
    dwellMs = 20_000
  ): Promise<{ landed: string; detour: boolean }> {
    return this.withBusy(agentId, async () => {
      const page = this.page(agentId);
      let landed = url;
      let detour = false;
      const postUrl = /^\/t\/([a-z0-9-]+)\/posts\/([A-Za-z0-9_]+)$/.exec(url);
      if (postUrl) {
        try {
          await this.clickThroughToPost(page, postUrl[1] as string, postUrl[2] as string);
        } catch (err) {
          if (!(err instanceof TargetGoneError)) throw err;
          landed = err.landedUrl;
          detour = true;
        }
      } else {
        const target = url.startsWith("http") ? url : `${this.opts.baseUrl}${url}`;
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
      }
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        await this.pace(dwellMs / steps);
        await page.mouse.wheel(0, 120 + Math.random() * 160).catch(() => undefined);
      }
      return { landed, detour };
    });
  }

  /** write and publish a post through the real compose form; the browser
   * is the actor and the redirect tells us what was made */
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
      await this.clickThroughToPost(page, tenant, postId);
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
