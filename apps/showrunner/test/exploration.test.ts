import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WallStore, type PayloadFor } from "@mortal/wall";
import { TerrariumStore } from "terrarium";
import {
  BrowserDriver,
  DeadPageError,
  LAUNCH_CAST,
  LiveRuntimePort,
  READING_ALLOWLIST_DEFAULT,
  RECENT_READS_MAX,
  Showrunner,
  StubRuntimePort,
  castNames,
  chooseNextRead,
  linkCandidates,
  normalizeReadUrl,
  personaAllowlist,
  storeTerrariumClient,
  type ActDriver,
  type CastMember,
  type PolicyFlags,
} from "../src/index.js";

/**
 * exploratory browsing: the drift is a walk, not a playlist. the walk's
 * decision and the harvest's edge are pure and pinned here; the
 * showrunner integration proves a harvested link beats the rotation and
 * the record shows where a read actually ended; and a real chromium
 * walks a local fixture graph so the whole chain (page -> anchors ->
 * allowlist filter -> next step) is proven against a real DOM.
 */

describe("the walk's decision", () => {
  const rotation = ["https://a.example/seed1", "https://a.example/seed2"];

  it("prefers a fresh link the current page genuinely offers", () => {
    const next = chooseNextRead({
      pageLinks: ["https://a.example/link1", "https://a.example/link2"],
      rotation,
      recentReads: ["https://a.example/link1"],
      driftIndex: 0,
    });
    expect(next).toEqual({ url: "https://a.example/link2", via: "link" });
  });

  it("starts a fresh trail from the rotation when every link is recent", () => {
    const next = chooseNextRead({
      pageLinks: ["https://a.example/link1"],
      rotation,
      recentReads: ["https://a.example/link1", "https://a.example/seed1"],
      driftIndex: 0,
    });
    expect(next).toEqual({ url: "https://a.example/seed2", via: "seed" });
  });

  it("returns to the stalest page when everything nearby is recent, never the latest", () => {
    const next = chooseNextRead({
      pageLinks: ["https://a.example/link1"],
      rotation: ["https://a.example/seed1"],
      // oldest first: seed1 was read longest ago
      recentReads: ["https://a.example/seed1", "https://a.example/link1"],
      driftIndex: 3,
    });
    expect(next).toEqual({ url: "https://a.example/seed1", via: "stale" });
  });

  it("compares urls in one shape: encoded and unicode are the same page", () => {
    expect(normalizeReadUrl("https://ja.wikipedia.org/wiki/%E7%BF%BB%E8%A8%B3#top")).toBe(
      normalizeReadUrl("https://ja.wikipedia.org/wiki/翻訳")
    );
    const next = chooseNextRead({
      pageLinks: ["https://ja.wikipedia.org/wiki/%E7%BF%BB%E8%A8%B3"],
      rotation: ["https://ja.wikipedia.org/wiki/俳句"],
      recentReads: ["https://ja.wikipedia.org/wiki/翻訳"],
      driftIndex: 0,
    });
    // the encoded link IS the recently-read unicode page: the walk knows
    expect(next).toEqual({ url: "https://ja.wikipedia.org/wiki/俳句", via: "seed" });
  });

  it("with nothing to go on, stays home", () => {
    expect(
      chooseNextRead({ pageLinks: [], rotation: [], recentReads: [], driftIndex: 0 })
    ).toBeNull();
  });
});

describe("the walk cannot leave the persona's ground", () => {
  it("intersects a persona's own hosts with the global allowlist, never widening it", () => {
    expect(
      personaAllowlist(["ja.wikipedia.org"], ["ja.wikipedia.org", "en.wikipedia.org"])
    ).toEqual(["ja.wikipedia.org"]);
    // absent or empty own list: the global wall alone governs
    expect(personaAllowlist(undefined, ["en.wikipedia.org"])).toEqual(["en.wikipedia.org"]);
    expect(personaAllowlist([], ["en.wikipedia.org"])).toEqual(["en.wikipedia.org"]);
    // an own host outside the global wall is dropped, never granted
    expect(
      personaAllowlist(["evil.example", "en.wikipedia.org"], ["en.wikipedia.org"])
    ).toEqual(["en.wikipedia.org"]);
  });

  it("drops interlanguage links for a reader whose world is english", () => {
    // the exact production bug: every one of these hosts is on the
    // global allowlist, so the old harvest let an en reader walk into
    // ja.wikipedia through the sidebar. the persona border drops them.
    const effective = personaAllowlist(
      ["en.wikipedia.org", "news.ycombinator.com"],
      [...READING_ALLOWLIST_DEFAULT]
    );
    const links = linkCandidates(
      [
        { href: "https://en.wikipedia.org/wiki/Epitaph", text: "epitaphs and their history" },
        { href: "https://ja.wikipedia.org/wiki/墓碑銘", text: "日本語版の記事" },
        { href: "https://fr.wikipedia.org/wiki/Épitaphe", text: "article en français ici" },
        { href: "https://de.wikipedia.org/wiki/Grabinschrift", text: "deutscher artikel dazu" },
      ],
      effective,
      "https://en.wikipedia.org/wiki/Eulogy"
    );
    expect(links).toEqual(["https://en.wikipedia.org/wiki/Epitaph"]);
  });

  it("keeps the interlanguage link that is the reader's own language", () => {
    const effective = personaAllowlist(["ja.wikipedia.org"], [...READING_ALLOWLIST_DEFAULT]);
    const links = linkCandidates(
      [
        { href: "https://ja.wikipedia.org/wiki/翻訳", text: "翻訳" },
        { href: "https://en.wikipedia.org/wiki/Translation", text: "Translation in english" },
      ],
      effective,
      "https://ja.wikipedia.org/wiki/日記"
    );
    // hrefs come back percent-encoded from the URL parser; same page
    expect(links.map(normalizeReadUrl)).toEqual(["https://ja.wikipedia.org/wiki/翻訳"]);
  });

  it("applies the mainspace rule to wikisource namespaces too", () => {
    const links = linkCandidates(
      [
        {
          href: "https://pt.wikisource.org/wiki/Memórias_Póstumas_de_Brás_Cubas",
          text: "o livro inteiro para ler",
        },
        {
          href: "https://pt.wikisource.org/wiki/Autor:Machado_de_Assis",
          text: "a página do autor aqui",
        },
        {
          href: "https://fr.wikisource.org/wiki/Spécial:Recherche",
          text: "chercher dans la bibliothèque",
        },
      ],
      ["pt.wikisource.org", "fr.wikisource.org"],
      "https://pt.wikisource.org/wiki/Dom_Casmurro"
    );
    expect(links.map(normalizeReadUrl)).toEqual([
      "https://pt.wikisource.org/wiki/Memórias_Póstumas_de_Brás_Cubas",
    ]);
  });

  it("chooseNextRead never picks outside the persona's hosts, even from stale memory", () => {
    // a pre-border harvest left a foreign link in the walk's memory
    const next = chooseNextRead({
      pageLinks: ["https://ja.wikipedia.org/wiki/俳句", "https://en.wikipedia.org/wiki/Haiku"],
      rotation: ["https://en.wikipedia.org/wiki/Memento_mori"],
      recentReads: [],
      driftIndex: 0,
      allowedHosts: ["en.wikipedia.org"],
    });
    expect(next).toEqual({ url: "https://en.wikipedia.org/wiki/Haiku", via: "link" });
    // and the stale fallback stays in-world too
    const stale = chooseNextRead({
      pageLinks: ["https://ja.wikipedia.org/wiki/俳句"],
      rotation: ["https://en.wikipedia.org/wiki/Memento_mori"],
      recentReads: ["https://en.wikipedia.org/wiki/Memento_mori"],
      driftIndex: 3,
      allowedHosts: ["en.wikipedia.org"],
    });
    expect(stale).toEqual({ url: "https://en.wikipedia.org/wiki/Memento_mori", via: "stale" });
  });
});

describe("what a page may offer the wander", () => {
  const allowlist = ["ja.wikipedia.org", "aworkinglibrary.com"];

  it("keeps allowlisted articles, drops namespaces, fragments, foreign hosts and login surfaces", () => {
    const links = linkCandidates(
      [
        { href: "https://ja.wikipedia.org/wiki/本居宣長", text: "本居宣長" },
        { href: "https://ja.wikipedia.org/wiki/源氏物語#冒頭", text: "源氏物語" },
        { href: "https://ja.wikipedia.org/wiki/特別:検索", text: "特別:検索ページ" },
        { href: "https://ja.wikipedia.org/w/index.php?title=x", text: "編集する専用リンク" },
        { href: "https://evil.example/wiki/本居宣長", text: "offsite mirror of the article" },
        { href: "https://aworkinglibrary.com/reading/a-book", text: "a book worth the evening" },
        { href: "https://ja.wikipedia.org/wiki/ログイン", text: "login to wikipedia now" },
        { href: "https://ja.wikipedia.org/wiki/短い", text: "短" },
      ],
      allowlist,
      "https://ja.wikipedia.org/wiki/物の哀れ"
    );
    // harvested hrefs arrive the way a browser writes them (percent
    // encoded); the walk compares under normalizeReadUrl, so encoded and
    // unicode are one page
    expect(links.map(normalizeReadUrl)).toEqual([
      "https://ja.wikipedia.org/wiki/本居宣長",
      // the fragment is gone: a table-of-contents anchor is not a destination
      "https://ja.wikipedia.org/wiki/源氏物語",
      "https://aworkinglibrary.com/reading/a-book",
    ]);
  });

  it("never offers the page itself, dedupes, and caps the harvest", () => {
    const self = "https://ja.wikipedia.org/wiki/俳句";
    const many = Array.from({ length: 40 }, (_, i) => ({
      href: `https://ja.wikipedia.org/wiki/page${i}`,
      text: `a long enough anchor ${i}`,
    }));
    const links = linkCandidates(
      [
        { href: self, text: "俳句のページ自身" },
        { href: "https://ja.wikipedia.org/wiki/季語", text: "季語" },
        { href: "https://ja.wikipedia.org/wiki/季語", text: "季語ふたたび" },
        ...many,
      ],
      ["ja.wikipedia.org"],
      self
    );
    expect(links.map(normalizeReadUrl)).not.toContain(normalizeReadUrl(self));
    expect(links.filter((l) => normalizeReadUrl(l).endsWith("季語")).length).toBe(1);
    expect(links.length).toBeLessThanOrEqual(16);
  });
});

describe("the drift walks (showrunner + fake driver)", () => {
  let dir: string;
  let wallStore: WallStore;
  let terrariumStore: TerrariumStore;

  const FLAGS: PolicyFlags = {
    platformAllowlist: ["terrarium"],
    sponsorEnabled: false,
    externalBrowsing: true,
    readingAllowlist: ["en.wikipedia.org", "news.ycombinator.com", "aworkinglibrary.com", "craigmod.com", "solar.lowtechmagazine.com"],
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "walk-"));
    wallStore = new WallStore(join(dir, "wall.db"));
    terrariumStore = new TerrariumStore(join(dir, "t.db"));
  });
  afterEach(() => {
    wallStore.close();
    terrariumStore.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("records where a read actually ended, then follows that page's links instead of the rotation", async () => {
    const opened: string[] = [];
    const driver: ActDriver = {
      busy: () => false,
      openPage: async (_id, url) => {
        opened.push(url);
        return {
          landed: url,
          detour: false,
          external: {
            domain: "en.wikipedia.org",
            title: "Motoori Norinaga",
            phrase: "the scholar of mono no aware",
            // a mid-read follow moved the reader somewhere else
            url: "https://en.wikipedia.org/wiki/Motoori_Norinaga",
            links: [
              "https://en.wikipedia.org/wiki/The_Tale_of_Genji",
              "https://en.wikipedia.org/wiki/Kokugaku",
            ],
          },
        };
      },
      publishPost: async () => ({ id: "p", url: "/x" }),
      replyComment: async () => undefined,
    };
    const showrunner = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: storeTerrariumClient(terrariumStore),
      think: async () => ({}),
      flags: { ...FLAGS },
    });
    Object.assign(showrunner.names, castNames());
    const marlowe = LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    await showrunner.spawn(marlowe);
    showrunner.driver = driver;
    const agent = showrunner.live.get("ag_marlowe");
    if (!agent) throw new Error("no agent");

    // a seed read: the intent was Mono_no_aware, the read ended on Motoori_Norinaga
    await (
      showrunner as unknown as { performAct: (a: unknown, act: unknown) => Promise<boolean> }
    ).performAct(agent, {
      kind: "open_page",
      url: "https://en.wikipedia.org/wiki/Mono_no_aware",
      title: "mono no aware",
    });
    const actions = wallStore.list({ kinds: ["action"], agentId: "ag_marlowe" });
    const read = actions[actions.length - 1]?.payload as PayloadFor<"action">;
    // the record shows the FINAL page, never the intent
    expect(read.target_url).toBe("https://en.wikipedia.org/wiki/Motoori_Norinaga");
    expect(agent.recent_reads).toContain("https://en.wikipedia.org/wiki/Motoori_Norinaga");
    expect(agent.page_links).toHaveLength(2);

    // the next drift follows the page's own link, not the rotation
    await (
      showrunner as unknown as { driftWhileIdle: (a: unknown) => Promise<void> }
    ).driftWhileIdle(agent);
    expect(opened[opened.length - 1]).toBe("https://en.wikipedia.org/wiki/The_Tale_of_Genji");
    // ...whose landing refreshed the walk state again (fake returns the
    // same external every time; the point is the CHOICE, made above)
  });

  it("never retraces the last N reads from the rotation, and a restart remembers", async () => {
    const marlowe = LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    const rotation = marlowe.idle_rotation ?? [];
    // every rotation page but one was read recently
    const recent = rotation.slice(0, rotation.length - 1);
    const fresh = rotation[rotation.length - 1] as string;
    const next = chooseNextRead({
      pageLinks: [],
      rotation,
      recentReads: recent,
      driftIndex: 5,
    });
    expect(next?.url).toBe(fresh);
    expect(next?.via).toBe("seed");

    // resume rebuilds the walk's memory from the record
    const first = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: storeTerrariumClient(terrariumStore),
      think: async () => ({}),
      flags: { ...FLAGS },
    });
    Object.assign(first.names, castNames());
    await first.spawn(marlowe);
    for (const url of recent.slice(0, 3)) {
      wallStore.append({
        agent_id: "ag_marlowe",
        kind: "action",
        visibility: "public",
        primitive: "driver.navigate()",
        payload: { verb: "opened_page", target_url: url, title: "x" },
      });
    }
    const resumed = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: storeTerrariumClient(terrariumStore),
      think: async () => ({}),
      flags: { ...FLAGS },
    });
    Object.assign(resumed.names, castNames());
    const { recovered } = await resumed.resume([marlowe]);
    expect(recovered).toContain("ag_marlowe");
    const back = resumed.live.get("ag_marlowe");
    expect(back?.recent_reads).toEqual(recent.slice(0, 3));
    expect(back?.recent_reads.length).toBeLessThanOrEqual(RECENT_READS_MAX);
  });

  it("a dead page never lands on the record, and the drift walks somewhere else", async () => {
    const deadUrl = "https://en.wikipedia.org/wiki/Memento_mori";
    const opened: string[] = [];
    const driver: ActDriver = {
      busy: () => false,
      openPage: async (_id, url) => {
        opened.push(url);
        if (url === deadUrl) throw new DeadPageError(url, "http 404");
        return {
          landed: url,
          detour: false,
          external: {
            domain: new URL(url).hostname,
            title: "a page that loaded",
            phrase: "",
            url,
            links: [],
          },
        };
      },
      publishPost: async () => ({ id: "p", url: "/x" }),
      replyComment: async () => undefined,
    };
    const showrunner = new Showrunner({
      store: wallStore,
      runtime: new StubRuntimePort(),
      terrarium: storeTerrariumClient(terrariumStore),
      think: async () => ({}),
      flags: { ...FLAGS },
    });
    Object.assign(showrunner.names, castNames());
    const marlowe = LAUNCH_CAST.find((m) => m.agent_id === "ag_marlowe") as CastMember;
    await showrunner.spawn(marlowe);
    showrunner.driver = driver;
    const agent = showrunner.live.get("ag_marlowe");
    if (!agent) throw new Error("no agent");
    // the page the walk will choose first is dead
    agent.page_links = [deadUrl];

    await (
      showrunner as unknown as { driftWhileIdle: (a: unknown) => Promise<void> }
    ).driftWhileIdle(agent);

    // the record never claims the read that did not happen
    const reads = wallStore
      .list({ kinds: ["action"], agentId: "ag_marlowe" })
      .map((e) => (e.payload as PayloadFor<"action">).target_url);
    expect(reads).not.toContain(deadUrl);
    // the corpse is remembered, so the walk will not choose it again
    expect(agent.recent_reads).toContain(deadUrl);
    // and the drift tried somewhere else instead of dwelling on white
    expect(opened[0]).toBe(deadUrl);
    expect(opened.length).toBe(2);
    expect(opened[1]).not.toBe(deadUrl);
    expect(reads).toContain(opened[1]);
    // the honest beat is on the stream: the state says why, then moves on
    const states = wallStore
      .list({ kinds: ["state_change"], agentId: "ag_marlowe" })
      .map((e) => e.payload as PayloadFor<"state_change">);
    expect(
      states.some((s) => s.state === "idle" && s.detail === "the page would not load")
    ).toBe(true);
  });
});

/** chromium for the live test: CHROME_PATH, a playwright browsers dir,
 * or nothing (the suite skips) */
function resolveChromium(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsersRoot && existsSync(browsersRoot)) {
    for (const entry of readdirSync(browsersRoot)) {
      if (/^chromium-\d+$/.test(entry)) {
        const candidate = join(browsersRoot, entry, "chrome-linux", "chrome");
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}
const chromiumPath = resolveChromium();

describe.skipIf(chromiumPath === null)("a real page's links reach the walk (real chromium)", () => {
  let fixtures: Server;
  let base: string;

  /** a tiny linked graph in the wikipedia shape, served locally */
  const PAGES: Record<string, string> = {
    "/wiki/mono-no-aware": `<html><head><title>mono no aware</title></head><body>
      <p>an essay about the pathos of things, long enough to phrase.</p>
      <a href="/wiki/motoori-norinaga">motoori norinaga, the scholar</a>
      <a href="/wiki/genji-monogatari">the tale of genji, at length</a>
      <a href="/wiki/mono-no-aware#top">back to the top of this page</a>
      <a href="https://offsite.example/wiki/x">an offsite mirror of the article</a>
      <a href="/login">login to the archive here</a>
      </body></html>`,
    "/wiki/motoori-norinaga": `<html><head><title>motoori norinaga</title></head><body>
      <p>the scholar who named the feeling, and spent a life reading the classics for it.</p>
      <a href="/wiki/genji-monogatari">the tale of genji, his subject</a>
      </body></html>`,
    "/wiki/genji-monogatari": `<html><head><title>genji</title></head><body><p>the novel itself, a thousand pages of court life and weather and grief.</p></body></html>`,
    // a page that answers 200 and paints nothing: as dead as a 404
    "/wiki/blank-shell": `<html><head><title>shell</title></head><body></body></html>`,
  };

  beforeEach(async () => {
    fixtures = createServer((req, res) => {
      const body = PAGES[new URL(req.url ?? "/", "http://x").pathname];
      if (!body) {
        res.statusCode = 404;
        res.end("gone");
        return;
      }
      res.setHeader("content-type", "text/html");
      res.end(body);
    });
    await new Promise<void>((resolve) => fixtures.listen(0, "127.0.0.1", resolve));
    const addr = fixtures.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });
  afterEach(async () => {
    await new Promise((resolve) => fixtures.close(resolve));
  });

  it("harvests real anchors through the allowlist and reports the final page", async () => {
    const port = new LiveRuntimePort({ executablePath: chromiumPath as string });
    port.setHome(`${base}/`);
    try {
      await port.spawn({
        agent_id: "ag_walker",
        class: "minimal",
        region: null,
        locale: null,
        ttl_seconds: 3600,
      });
      const driver = new BrowserDriver({
        runtime: port,
        baseUrl: base,
        terrariumToken: "t",
        paceScale: 0,
        readingAllowlist: ["127.0.0.1"],
        externalEnabled: true,
      });
      const result = await driver.openPage("ag_walker", `${base}/wiki/mono-no-aware`, 0);
      expect(result.external).toBeDefined();
      const external = result.external as NonNullable<typeof result.external>;
      // the final page is reported (the 60% mid-read follow may have
      // moved the reader to a linked page; both are in the fixture graph)
      expect(external.url).toBeDefined();
      const finalPath = new URL(external.url as string).pathname;
      expect(Object.keys(PAGES)).toContain(finalPath);
      // the harvest came from the real DOM of the final page, through
      // the allowlist: offsite and login links never survive
      const links = external.links ?? [];
      for (const link of links) {
        expect(new URL(link).hostname).toBe("127.0.0.1");
        expect(link).not.toContain("login");
        expect(link).not.toContain("#");
      }
      // the graph guarantees the final page offers at least one onward
      // link unless the walk already reached the leaf
      if (finalPath !== "/wiki/genji-monogatari") {
        expect(links.length).toBeGreaterThan(0);
      }
    } finally {
      await port.close();
    }
  }, 60_000);

  it("a 404, a blank render and a refused connection all read as dead pages", async () => {
    const port = new LiveRuntimePort({ executablePath: chromiumPath as string });
    port.setHome(`${base}/`);
    try {
      await port.spawn({
        agent_id: "ag_walker",
        class: "minimal",
        region: null,
        locale: null,
        ttl_seconds: 3600,
      });
      const driver = new BrowserDriver({
        runtime: port,
        baseUrl: base,
        terrariumToken: "t",
        paceScale: 0,
        readingAllowlist: ["127.0.0.1"],
        externalEnabled: true,
      });
      // a 404: the server answers, but there is no page there
      await expect(driver.openPage("ag_walker", `${base}/wiki/no-such-page`, 0)).rejects.toThrow(
        DeadPageError
      );
      // a 200 that paints nothing: a white cell, refused before the dwell
      await expect(driver.openPage("ag_walker", `${base}/wiki/blank-shell`, 0)).rejects.toThrow(
        DeadPageError
      );
      // a refused connection: nothing is listening at all
      await expect(
        driver.openPage("ag_walker", "http://127.0.0.1:9/wiki/nowhere", 0)
      ).rejects.toThrow(DeadPageError);
      // and after all three corpses, a real page still reads normally
      const alive = await driver.openPage("ag_walker", `${base}/wiki/genji-monogatari`, 0);
      expect(alive.external?.title).toContain("genji");
    } finally {
      await port.close();
    }
  }, 60_000);
});
