import {
  MAX_INHERITED_FRAGMENTS,
  NARRATION_MAX_CHARS,
  WallStore,
  agentNow,
  type PayloadFor,
  type WallEvent,
} from "@mortal/wall";
import type { CastMember } from "./cast.js";
import { isAshSpawnSlot, isAsleep } from "./calendar.js";
import {
  NARRATION_INTERVAL_MS,
  NARRATION_LINE_TIMEOUT_MS,
  NARRATION_MAX_LINES,
  NARRATION_SETTLE_MS,
  visibleExcerpt,
  waitWhile,
  type NarratablePage,
  type NarrateFn,
} from "./narrator.js";
import {
  PolicyViolation,
  checkAction,
  checkSponsorExtension,
  type PolicyFlags,
} from "./policy.js";
import type { RuntimePort } from "./runtime-port.js";
import type { TerrariumClient } from "./terrarium-client.js";
import type { ThinkContext, ThinkFn, Thought } from "./think.js";

/**
 * the showrunner (wall spec section 7). owns the day: spawns and kills on
 * the calendar, runs the heartbeat loop, keeps the wall alive, and turns
 * every runtime act into a WallEvent. it places conditions (reading lists,
 * evidence), never dialogue; the run produces the scene. timers live in
 * the cli so every rule here is directly testable.
 */

export interface LiveAgent {
  agent_id: string;
  member: CastMember;
  /** incarnation number for serial members (ash-1, ash-2, ...) */
  serial_n: number | null;
  tenant: string | null;
  identity_id: string;
  spawned_at: string;
  dies_at: number;
  memory: string[];
  /** the reading the scheduler placed for the next wake */
  reading: string[];
  read_cursor: string;
  warned: Set<"final_hour" | "final_10m">;
  post_count: number;
  last_post_id: string | null;
  /** publishes today, and which day that is, for the cast's daily ceiling */
  posts_today: number;
  posts_today_date: string;
  /** how far through its idle rotation this identity has drifted */
  drift_index: number;
  /** last few spoken monologues, fed back to the thinker as
   * do-not-restate context */
  monologues: string[];
}

export interface ShowrunnerDeps {
  store: WallStore;
  runtime: RuntimePort;
  terrarium: TerrariumClient;
  think: ThinkFn;
  flags: PolicyFlags;
  now?: () => Date;
}

/**
 * the visible hands: when a live runtime is attached, acts are performed
 * through the agent's real browser at human speed (typing into the real
 * compose form, replying in the real comment form, reading real pages).
 * the driver executes intents that already passed the policy chokepoint;
 * on driver failure the act falls back to the transactional client so
 * the record continues while the visible life degrades honestly.
 */
/** a link the driver went looking for that the rendered page no longer
 * carries; the browser is left honestly on landedUrl */
export class TargetGoneError extends Error {
  readonly landedUrl: string;
  constructor(message: string, landedUrl: string) {
    super(message);
    this.landedUrl = landedUrl;
  }
}

export interface ActDriver {
  /** optional: write the post into the real form and leave it there,
   * unpublished. a driver without it simply does not draft on camera. */
  draftPost?(agentId: string, tenant: string, title: string, bodyMd: string): Promise<void>;
  busy(agentId: string): boolean;
  openPage(
    agentId: string,
    url: string
  ): Promise<{
    landed: string;
    detour: boolean;
    external?: { domain: string; title: string; phrase: string };
  }>;
  publishPost(
    agentId: string,
    tenant: string,
    title: string,
    bodyMd: string
  ): Promise<{ id: string; url: string }>;
  replyComment(
    agentId: string,
    tenant: string,
    postId: string,
    author: string,
    body: string
  ): Promise<void>;
}

const QUIET_WINDOW_MS = 10 * 60_000;

export class Showrunner {
  readonly store: WallStore;
  private readonly runtime: RuntimePort;
  private readonly terrarium: TerrariumClient;
  private readonly think: ThinkFn;
  readonly flags: PolicyFlags;
  private readonly now: () => Date;
  readonly live = new Map<string, LiveAgent>();
  private readonly serialCounters = new Map<string, number>();
  /** internal mail: full bodies never leave this map; excerpts may surface
   * in a recipient's monologue */
  private readonly mailboxes = new Map<string, Array<{ from: string; body: string }>>();
  readonly names: Record<string, string> = {};

  constructor(deps: ShowrunnerDeps) {
    this.store = deps.store;
    this.runtime = deps.runtime;
    this.terrarium = deps.terrarium;
    this.think = deps.think;
    this.flags = deps.flags;
    this.now = deps.now ?? (() => new Date());
  }

  // ---- lifecycle ----

  async spawn(member: CastMember, opts: { inherited_fragments?: string[] } = {}): Promise<LiveAgent> {
    let agentId = member.agent_id;
    let serialN: number | null = null;
    let tenant = member.tenant;
    let name = member.name;
    if (member.serial) {
      serialN = (this.serialCounters.get(member.agent_id) ?? 0) + 1;
      this.serialCounters.set(member.agent_id, serialN);
      agentId = `${member.agent_id}_${serialN}`;
      name = `${member.name}-${serialN}`;
      tenant = member.tenant ? `${member.tenant}-${serialN}` : null;
    }
    const fragments = (opts.inherited_fragments ?? []).slice(0, MAX_INHERITED_FRAGMENTS);
    const spawned = await this.runtime.spawn({
      agent_id: agentId,
      class: member.class,
      region: member.region,
      locale: member.locale,
      ttl_seconds: member.ttl_seconds,
    });
    const ts = this.now().toISOString();
    this.store.append({
      agent_id: agentId,
      kind: "spawn",
      visibility: "public",
      primitive: "identity.create()",
      ts,
      payload: {
        class: member.class,
        region: member.region,
        locale: member.locale,
        ttl_seconds: member.ttl_seconds,
        fingerprint_short: spawned.fingerprint_short,
        inherited_fragments: fragments,
      },
    });
    const agent: LiveAgent = {
      agent_id: agentId,
      member,
      serial_n: serialN,
      tenant,
      identity_id: spawned.identity_id,
      spawned_at: ts,
      dies_at: Date.parse(ts) + member.ttl_seconds * 1000,
      drift_index: 0,
      memory: [...fragments],
      reading: [],
      read_cursor: ts,
      warned: new Set(),
      post_count: 0,
      last_post_id: null,
      posts_today: 0,
      posts_today_date: "",
      monologues: [],
    };
    this.live.set(agentId, agent);
    this.names[agentId] = name;
    if (tenant) {
      await this.terrarium.ensureTenant(tenant, agentId, this.tenantTitle(member, name));
    }
    return agent;
  }

  private tenantTitle(member: CastMember, name: string): string {
    if (member.class === "burner") return `${name}: a manifesto`;
    return member.agent_id === "ag_marlowe" ? "the slow blog" : `${name}'s notebook`;
  }

  async die(agentId: string, cause: PayloadFor<"death">["cause"]): Promise<WallEvent> {
    const agent = this.mustLive(agentId);
    // set piece: the final words come from one flagged think() call
    const thought = await this.runHeartbeat(agent, { occasion: "death" });
    const finalWords = thought?.final_words ?? "";
    const destroyed = await this.runtime.destroy(agent.identity_id, cause);
    const ts = this.now().toISOString();
    const lived = Math.max(0, Math.floor((Date.parse(ts) - Date.parse(agent.spawned_at)) / 1000));
    const event = this.store.append({
      agent_id: agentId,
      kind: "death",
      visibility: "public",
      primitive: "identity.destroy()",
      ts,
      payload: { lived_seconds: lived, cause, final_words: finalWords, receipt: destroyed.receipt },
    });
    if (agent.tenant) await this.terrarium.freeze(agent.tenant);
    this.live.delete(agentId);
    this.mailboxes.delete(agentId);
    return event;
  }

  /**
   * controlled inheritance (spec section 1): the successor receives an
   * explicit, logged set of 0-3 short fragments chosen here, nothing else.
   * they ride publicly in the spawn payload, so the carry-over is a
   * visible product feature, never a hidden memory.
   */
  chooseInheritance(deadAgentId: string): string[] {
    const record = [...this.store.list({ agentId: deadAgentId, publicOnly: true })].reverse();
    const fragments: string[] = [];
    const death = record.find((e) => e.kind === "death");
    const deathWords = (death?.payload as PayloadFor<"death"> | undefined)?.final_words;
    if (deathWords) fragments.push(deathWords.slice(0, 120));
    const lastPost = record.find(
      (e) => e.kind === "action" && (e.payload as PayloadFor<"action">).verb === "published_post"
    );
    const title = (lastPost?.payload as PayloadFor<"action"> | undefined)?.title;
    if (title) fragments.push(`a predecessor left a text called "${title}"`);
    return fragments.slice(0, MAX_INHERITED_FRAGMENTS);
  }

  /**
   * restart continuity. a deployed showrunner restarts; respawning the
   * cast would fake births, so the roster is rebuilt from the event
   * stream: living agents reattach to their runtime identities (the port
   * must support reattach, otherwise this refuses loudly), keep their
   * dies_at, warnings, serial numbering and their own public material as
   * memory, and get a public lost_time event (crash policy: downtime
   * becomes character). members that never spawned are returned so the
   * caller can spawn them fresh. agents already past dies_at are left to
   * the next tick, which honors the death late.
   */
  async resume(members: CastMember[]): Promise<{ recovered: string[]; unspawned: CastMember[] }> {
    const byBase = new Map(members.map((m) => [m.agent_id, m]));
    const record = this.store.list({});
    const folded = agentNow(record);
    const recovered: string[] = [];
    const seenBases = new Set<string>();

    for (const agent of folded) {
      const serialMatch = /_(\d+)$/.exec(agent.agent_id);
      const baseId = serialMatch ? agent.agent_id.slice(0, -serialMatch[0].length) : agent.agent_id;
      const member = byBase.get(agent.agent_id) ?? byBase.get(baseId);
      if (!member) continue;
      seenBases.add(member.agent_id);
      // serial numbering continues across restarts, dead or alive
      if (member.serial && serialMatch) {
        const n = Number(serialMatch[1]);
        if (n > (this.serialCounters.get(member.agent_id) ?? 0)) {
          this.serialCounters.set(member.agent_id, n);
        }
      }
      if (agent.state === "dead" || agent.state === "unborn") continue;

      if (!this.runtime.reattach) {
        throw new Error(
          `cannot resume ${agent.agent_id}: this RuntimePort has no reattach; a respawn would fake a birth`
        );
      }
      const handle = await this.runtime.reattach(agent.agent_id, agent.spawned_at ?? "");
      if (!handle) {
        throw new Error(
          `cannot resume ${agent.agent_id}: the runtime no longer holds its identity`
        );
      }

      const own = record.filter((e) => e.agent_id === agent.agent_id);
      const memory: string[] = [...agent.inherited_fragments];
      const spokenMonologues: string[] = [];
      let postCount = 0;
      let postsToday = 0;
      const today = new Date().toISOString().slice(0, 10);
      let lastPostId: string | null = null;
      let readCursor = agent.spawned_at ?? new Date(0).toISOString();
      const warned = new Set<"final_hour" | "final_10m">();
      for (const event of own) {
        if (event.kind === "monologue" && event.visibility === "public") {
          memory.push((event.payload as PayloadFor<"monologue">).text);
          spokenMonologues.push((event.payload as PayloadFor<"monologue">).text);
        } else if (event.kind === "action") {
          const p = event.payload as PayloadFor<"action">;
          if (p.verb === "published_post") {
            postCount += 1;
            // the daily ceiling is counted from the record, not from
            // process uptime: restarting must not hand an identity a
            // fresh allowance it has already spent
            if (event.ts.slice(0, 10) === today) postsToday += 1;
            memory.push(`published "${p.title ?? ""}"`);
            const idMatch = /\/posts\/([A-Za-z0-9_]+)$/.exec(p.target_url ?? "");
            lastPostId = idMatch?.[1] ?? lastPostId;
          }
        } else if (event.kind === "human_contact") {
          // the reading cursor advances past comments already reacted to
          readCursor = event.ts > readCursor ? event.ts : readCursor;
        } else if (event.kind === "ttl_warning") {
          warned.add((event.payload as PayloadFor<"ttl_warning">).window);
        }
      }

      const name = serialMatch ? `${member.name}-${serialMatch[1]}` : member.name;
      this.live.set(agent.agent_id, {
        agent_id: agent.agent_id,
        member,
        serial_n: serialMatch ? Number(serialMatch[1]) : null,
        tenant: member.tenant
          ? serialMatch
            ? `${member.tenant}-${serialMatch[1]}`
            : member.tenant
          : null,
        identity_id: handle.identity_id,
        spawned_at: agent.spawned_at ?? new Date(0).toISOString(),
        dies_at: agent.dies_at ? Date.parse(agent.dies_at) : 0,
        memory: memory.slice(-24),
        reading: [],
        read_cursor: readCursor,
        warned,
        post_count: postCount,
        posts_today: postsToday,
        posts_today_date: today,
        // a restart should not put every identity back on the same page
        drift_index: postCount,
        last_post_id: lastPostId,
        monologues: spokenMonologues.slice(-3),
      });
      this.names[agent.agent_id] = name;
      recovered.push(agent.agent_id);
      this.store.append({
        agent_id: agent.agent_id,
        kind: "system",
        visibility: "public",
        primitive: "runtime.respawn()",
        payload: { what: "lost_time", detail: "the process restarted; the life continues" },
      });
    }

    const unspawned = members.filter((m) => !seenBases.has(m.agent_id));
    return { recovered, unspawned };
  }

  /** crash policy: downtime becomes character, never a cover-up */
  noteCrash(agentId: string, detail: string): void {
    this.mustLive(agentId);
    this.store.append({
      agent_id: agentId,
      kind: "system",
      visibility: "public",
      primitive: "runtime.respawn()",
      payload: { what: "lost_time", detail },
    });
  }

  // ---- the heartbeat loop ----

  /** wake -> read placed material and human comments -> one think() ->
   * maybe act through the policy chokepoint -> emit -> idle */
  /** set after boot when a live runtime is attached; null keeps every act
   * on the transactional client path */
  driver: ActDriver | null = null;

  /** set at boot only when a real model thinker is attached: the
   * scripted wall narrates nothing rather than presenting hand-written
   * lines as running commentary */
  narrate: NarrateFn | null = null;
  narrationSettleMs = NARRATION_SETTLE_MS;
  narrationIntervalMs = NARRATION_INTERVAL_MS;
  narrationMaxLines = NARRATION_MAX_LINES;
  narrationLineTimeoutMs = NARRATION_LINE_TIMEOUT_MS;

  async heartbeat(agentId: string, opts: { occasion?: string } = {}): Promise<Thought | null> {
    // an agent mid-act (typing a post at human speed) skips its beat; the
    // wall shows writing the whole while, which is exactly the truth
    if (this.driver?.busy(agentId)) return null;
    const agent = this.mustLive(agentId);
    return this.runHeartbeat(agent, opts);
  }

  private async runHeartbeat(
    agent: LiveAgent,
    opts: { occasion?: string }
  ): Promise<Thought | null> {
    const dying = opts.occasion === "death";
    if (!dying) this.emitState(agent.agent_id, "waking");

    // read: human comments since the cursor become human_contact events
    // and land in the reading list; agents earn their reactions
    const reading = [...agent.reading];
    agent.reading = [];
    if (agent.tenant) {
      const comments = await this.terrarium.humanCommentsSince(agent.tenant, agent.read_cursor);
      for (const comment of comments) {
        agent.read_cursor = comment.created_at;
        const excerpt = comment.body.slice(0, 140);
        this.store.append({
          agent_id: agent.agent_id,
          kind: "human_contact",
          visibility: "public",
          primitive: "terrarium.comments.read()",
          payload: {
            platform: "terrarium",
            excerpt,
            url: `/t/${agent.tenant}/posts/${comment.post_id}`,
          },
        });
        reading.push(`${comment.author}: ${excerpt}`);
      }
    }
    const mail = this.mailboxes.get(agent.agent_id) ?? [];
    for (const letter of mail.splice(0)) {
      reading.push(`letter from ${this.names[letter.from] ?? letter.from}: ${letter.body.slice(0, 80)}`);
    }

    const remaining = Math.max(0, Math.floor((agent.dies_at - this.now().getTime()) / 1000));
    const occasion =
      opts.occasion ?? (reading.some((r) => r.includes(":")) ? "human_contact" : undefined);
    const context: ThinkContext = {
      agent_id: agent.agent_id,
      name: this.names[agent.agent_id] ?? agent.member.name,
      role: agent.member.role,
      locale: agent.member.locale,
      // model tiering: set pieces route to the big model, ambient beats to
      // the small one; the agent never sees the flag as content
      tier: occasion ? "set_piece" : "ambient",
      occasion,
      memory: agent.memory.slice(-12),
      reading,
      recent_monologues: agent.monologues.slice(-3),
      idle_rotation: agent.member.idle_rotation ?? [],
      ttl_remaining_seconds: remaining,
      inherited_fragments: agent.memory.slice(0, MAX_INHERITED_FRAGMENTS),
    };

    let thought: Thought;
    try {
      thought = await this.think(context);
    } catch {
      // a failed model call is downtime, not silence forever
      if (!dying) {
        this.emitState(agent.agent_id, "idle");
        void this.driftWhileIdle(agent).catch(() => undefined);
      }
      return null;
    }

    if (thought.monologue) {
      this.store.append({
        agent_id: agent.agent_id,
        kind: "monologue",
        visibility: "public",
        payload: {
          text: thought.monologue.slice(0, 140),
          // the line stays as it was thought; the gloss rides beneath it
          ...(thought.monologue_gloss
            ? { gloss: thought.monologue_gloss.slice(0, 140) }
            : {}),
        },
      });
      agent.memory.push(thought.monologue);
      agent.monologues.push(thought.monologue.slice(0, 140));
      if (agent.monologues.length > 3) agent.monologues.shift();
    }
    let acted = false;
    if (thought.act && !dying) {
      acted = await this.performAct(agent, thought.act);
    }
    if (!dying) {
      // browse-forward: an open_page act that actually happened already
      // took the agent out to a page; drifting now would immediately
      // walk away from it. the beat ends there, in the reading state,
      // exactly as a drift-read would. a refused read still drifts.
      if (acted && thought.act?.kind === "open_page") return thought;
      this.emitState(agent.agent_id, "idle");
      void this.driftWhileIdle(agent).catch(() => undefined);
    }
    return thought;
  }

  /** try the visible browser path first, fall back to the transactional
   * client if the browser is gone; the outcome is identical on the
   * record, the degradation shows only in the video */
  private async actThroughDriver<T>(
    agentId: string,
    throughBrowser: () => Promise<T>,
    throughClient: () => Promise<T>
  ): Promise<T> {
    if (!this.driver) return throughClient();
    try {
      return await throughBrowser();
    } catch (err) {
      // a target that no longer exists is not a broken browser: acting on
      // it through the client would fake what the world refused
      if (err instanceof TargetGoneError) throw err;
      console.error(`driver act fell back for ${agentId}: ${String(err)}`);
      return throughClient();
    }
  }

  /**
   * the cast's daily publishing ceiling, rolled over on the identity's
   * own calendar day. absent means unlimited, which is right for the
   * short-lived: an identity with hours left should not be rationed.
   */
  private mayPublishToday(agent: LiveAgent): boolean {
    const ceiling = agent.member.max_posts_per_day;
    if (ceiling === undefined) return true;
    const today = new Date().toISOString().slice(0, 10);
    if (agent.posts_today_date !== today) {
      agent.posts_today_date = today;
      agent.posts_today = 0;
    }
    return agent.posts_today < ceiling;
  }

  /** every act crosses the policy chokepoint; refusals become public
   * enforcement events with receipts. returns true when the act was
   * performed, false when policy refused it. */
  private async performAct(agent: LiveAgent, act: NonNullable<Thought["act"]>): Promise<boolean> {
    try {
      switch (act.kind) {
        case "publish_post": {
          checkAction({ type: "post", platform: "terrarium" }, this.flags);
          if (!agent.tenant) return false;
          this.emitState(agent.agent_id, "writing", act.title);
          // the daily ceiling is a publishing limit, not a writing one:
          // the draft happens either way, at full length and on camera,
          // and only the submit is withheld. an identity that has said
          // its piece for the day is still an identity at work.
          if (!this.mayPublishToday(agent)) {
            const draft = (this.driver as ActDriver | null)?.draftPost;
            if (draft) {
              await this.actThroughDriver(
                agent.agent_id,
                () =>
                  draft.call(
                    this.driver as ActDriver,
                    agent.agent_id,
                    agent.tenant as string,
                    act.title,
                    act.body_md
                  ),
                async () => undefined
              ).catch(() => undefined);
            }
            agent.memory.push(`drafted "${act.title}" (not published; daily ceiling)`);
            // no action event: nothing was published, and the record
            // must not imply otherwise. the wall shows the writing
            // through the state it is already in.
            this.emitState(agent.agent_id, "writing", act.title);
            return true;
          }
          const post = await this.actThroughDriver(
            agent.agent_id,
            () =>
              (this.driver as ActDriver).publishPost(
                agent.agent_id,
                agent.tenant as string,
                act.title,
                act.body_md
              ),
            () => this.terrarium.publishPost(agent.tenant as string, act.title, act.body_md)
          );
          agent.post_count += 1;
          agent.posts_today += 1;
          agent.last_post_id = post.id;
          agent.memory.push(`published "${act.title}"`);
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "terrarium.posts.create()",
            payload: { verb: "published_post", target_url: post.url, title: act.title },
          });
          return true;
        }
        case "reply_comment": {
          checkAction({ type: "comment", platform: "terrarium" }, this.flags);
          this.emitState(agent.agent_id, "replying");
          const author = this.names[agent.agent_id] ?? agent.member.name;
          try {
            await this.actThroughDriver(
              agent.agent_id,
              () =>
                (this.driver as ActDriver).replyComment(
                  agent.agent_id,
                  agent.tenant as string,
                  act.post_id,
                  author,
                  act.body
                ),
              () => this.terrarium.reply(act.post_id, agent.agent_id, author, act.body)
            );
          } catch (err) {
            if (err instanceof TargetGoneError) {
              // the post is gone: the reply cannot happen, and the record
              // shows where the agent actually ended up instead
              this.store.append({
                agent_id: agent.agent_id,
                kind: "action",
                visibility: "public",
                primitive: "driver.navigate()",
                payload: {
                  verb: "opened_page",
                  target_url: err.landedUrl,
                  title: "a page that was gone",
                },
              });
              agent.memory.push("went to reply and the post was gone");
              return true;
            }
            throw err;
          }
          agent.memory.push(`replied to a human`);
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "terrarium.comments.reply()",
            payload: { verb: "left_comment" },
          });
          return true;
        }
        case "send_letter": {
          // internal mail: the act is public, the body never is
          const box = this.mailboxes.get(act.to_agent) ?? [];
          box.push({ from: agent.agent_id, body: act.body });
          this.mailboxes.set(act.to_agent, box);
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "mail.send()",
            payload: { verb: "sent_letter", target_agent: this.names[act.to_agent] ?? act.to_agent },
          });
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "internal",
            payload: { verb: "sent_letter", target_agent: act.to_agent, title: act.body.slice(0, 500) },
          });
          agent.memory.push(`wrote to ${this.names[act.to_agent] ?? act.to_agent}`);
          return true;
        }
        case "external_post": {
          // tier 2, dark: this checkAction refuses with tier2.dark until
          // the flip, and the refusal is a public enforcement event; when
          // the tier is live it admits only capability-granted domains
          checkAction({ type: "external_post", domain: act.domain }, this.flags);
          this.emitState(agent.agent_id, "writing", act.domain);
          const posted = await (this.driver as ActDriver & {
            externalPost?: (
              agentId: string,
              domain: string,
              text: string
            ) => Promise<{ url: string | null }>;
          })?.externalPost?.(agent.agent_id, act.domain, act.text);
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "driver.compose()",
            payload: {
              verb: "published_post",
              target_url: posted?.url ?? `https://${act.domain}`,
              title: `on ${act.domain}`,
            },
          });
          agent.memory.push(`posted on ${act.domain}`);
          return true;
        }
        case "external_reply": {
          checkAction({ type: "external_reply", domain: act.domain }, this.flags);
          this.emitState(agent.agent_id, "replying", act.domain);
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "driver.reply()",
            payload: { verb: "left_comment", target_url: act.target_url },
          });
          agent.memory.push(`replied on ${act.domain}`);
          return true;
        }
        case "open_page": {
          checkAction({ type: "browse", url: act.url }, this.flags);
          this.emitState(agent.agent_id, "reading", act.title);
          let landedUrl = act.url;
          let landedTitle = act.title;
          if (this.driver) {
            // surface B fills while surface A reads: the narrator
            // speaks over the dwell and stops the moment the read ends
            let readInProgress = true;
            const opening = this.driver
              .openPage(agent.agent_id, act.url)
              .catch((err: unknown) => {
                console.error(`driver open_page degraded for ${agent.agent_id}: ${String(err)}`);
                return null;
              })
              .finally(() => {
                readInProgress = false;
              });
            const narrated = this.narrateDuringRead(agent, () => readInProgress).catch(
              () => undefined
            );
            const landing = await opening;
            await narrated;
            if (landing?.detour) {
              // the link was gone; the record says where the reader
              // actually ended up, never where they meant to go
              landedUrl = landing.landed;
              landedTitle = "a page that was gone";
            } else if (landing?.external) {
              // external reads surface honestly: real domain, real title,
              // one capped phrase as material for later thought
              landedTitle = `${landing.external.domain}: ${landing.external.title}`;
              this.emitState(agent.agent_id, "reading", landedTitle);
              agent.reading.push(
                `read on ${landing.external.domain}: ${landing.external.title}${
                  landing.external.phrase ? `. one line that stayed: "${landing.external.phrase}"` : ""
                }`
              );
            }
          }
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "driver.navigate()",
            payload: { verb: "opened_page", target_url: landedUrl, title: landedTitle },
          });
          agent.memory.push(
            landedTitle === "a page that was gone"
              ? `went looking for ${act.title}; the page was gone`
              : `read ${act.title}`
          );
          return true;
        }
      }
      return false;
    } catch (err) {
      if (err instanceof PolicyViolation) {
        this.store.append({
          agent_id: agent.agent_id,
          kind: "enforcement",
          visibility: "public",
          primitive: "policy.check()",
          payload: {
            rule_id: err.refusal.rule_id,
            rule_text: err.refusal.rule_text,
            attempted_action: act.kind,
          },
        });
        return false;
      }
      throw err;
    }
  }

  /**
   * the running commentary (surface B): while the driver dwells on a
   * page, extract what is visible on screen and let the model say one
   * short line about it, appended as a public `narration` event, until
   * the read ends or the per-read cap is hit. requires a model narrator
   * and a live page: the scripted wall and the stub runtime narrate
   * nothing. narration is commentary, not memory; the read's own
   * material already reaches the agent via `reading`, so these lines do
   * not crowd the memory window.
   */
  private async narrateDuringRead(
    agent: LiveAgent,
    stillReading: () => boolean
  ): Promise<void> {
    const narrate = this.narrate;
    if (!narrate) return;
    const runtime = this.runtime as { pageFor?: (id: string) => NarratablePage | null };
    const page = runtime.pageFor?.call(this.runtime, agent.agent_id);
    if (!page) return;
    const prior: string[] = [];
    await waitWhile(this.narrationSettleMs, stillReading);
    while (stillReading() && prior.length < this.narrationMaxLines) {
      const screen = await visibleExcerpt(page).catch(() => null);
      if (!screen || !stillReading()) break;
      // a hung model call may not hold the heartbeat hostage: past the
      // per-line timeout the line is skipped and the read carries on
      const line = await Promise.race([
        narrate({
          agent_id: agent.agent_id,
          name: this.names[agent.agent_id] ?? agent.member.name,
          locale: agent.member.locale,
          url: screen.url,
          title: screen.title,
          excerpt: screen.excerpt,
          prior: [...prior],
        }).catch(() => null),
        new Promise<null>((resolve) => {
          const timer = setTimeout(() => resolve(null), this.narrationLineTimeoutMs);
          timer.unref?.();
        }),
      ]);
      const text = line?.text.trim();
      if (text) {
        this.store.append({
          agent_id: agent.agent_id,
          kind: "narration",
          visibility: "public",
          payload: {
            text: text.slice(0, NARRATION_MAX_CHARS),
            ...(line?.gloss?.trim()
              ? { gloss: line.gloss.trim().slice(0, NARRATION_MAX_CHARS) }
              : {}),
            // the panel ties the line to what surface A was showing: the
            // url actually on screen when the excerpt was taken
            about_url: screen.url,
          },
        });
        prior.push(text);
      }
      await waitWhile(this.narrationIntervalMs, stillReading);
    }
  }

  /** scheduler-placed evidence for the next wake: a predecessor's blog in
   * an ash's reading list, a harsh review, the graveyard. conditions, not
   * scripts. */
  placeReading(agentId: string, material: string): void {
    this.mustLive(agentId).reading.push(material);
  }

  // ---- the tick: warnings, deaths, liveness ----

  async tick(): Promise<void> {
    const now = this.now();
    for (const agent of [...this.live.values()]) {
      const remaining = (agent.dies_at - now.getTime()) / 1000;
      if (remaining <= 0) {
        await this.die(agent.agent_id, "ttl");
        continue;
      }
      if (remaining < 600 && !agent.warned.has("final_10m")) {
        agent.warned.add("final_10m");
        this.store.append({
          agent_id: agent.agent_id,
          kind: "ttl_warning",
          visibility: "public",
          primitive: "lifecycle.warn()",
          payload: { window: "final_10m", remaining_seconds: Math.floor(remaining) },
        });
      } else if (remaining < 3600 && !agent.warned.has("final_hour")) {
        agent.warned.add("final_hour");
        this.store.append({
          agent_id: agent.agent_id,
          kind: "ttl_warning",
          visibility: "public",
          primitive: "lifecycle.warn()",
          payload: { window: "final_hour", remaining_seconds: Math.floor(remaining) },
        });
        // the final hour is a set piece
        await this.runHeartbeat(agent, { occasion: "final_hour" });
      }
    }
    await this.ensureLiveness(now);
  }

  /** at least 2 agents active; if the wall goes quiet > 10m, force-wake
   * someone awake-eligible or early-spawn an ash */
  async ensureLiveness(now: Date): Promise<void> {
    const awake = [...this.live.values()].filter((a) => !isAsleep(a.member, now));
    const lastPublic = this.store.list({ publicOnly: true, newestFirst: true, limit: 1 })[0];
    const quiet = !lastPublic || now.getTime() - Date.parse(lastPublic.ts) > QUIET_WINDOW_MS;
    if (awake.length >= 2 && !quiet) return;
    const candidate = awake[0];
    if (candidate) {
      await this.runHeartbeat(candidate, {});
      return;
    }
    // nobody is awake: early-spawn the serial member if configured
    const serial = [...this.serialMembers()][0];
    if (serial) {
      const predecessorId = this.lastSerialAgentId(serial);
      await this.spawn(serial, {
        inherited_fragments: predecessorId ? this.chooseInheritance(predecessorId) : [],
      });
    }
  }

  /**
   * the spawn calendar (spec section 7): serial successors arrive on the
   * mon+thu peak slot so deaths land while people watch. the first
   * incarnation is not calendar-gated — a fresh boot spawns it
   * immediately (the launch ash lands off-calendar by design) — and a
   * living incarnation blocks a duplicate for the whole slot hour.
   */
  async calendarTick(now: Date = this.now()): Promise<void> {
    if (!isAshSpawnSlot(now)) return;
    for (const member of this.serialMembersList) {
      const hasLiving = [...this.live.values()].some((a) => a.member.agent_id === member.agent_id);
      if (hasLiving) continue;
      const predecessorId = this.lastSerialAgentId(member);
      await this.spawn(member, {
        inherited_fragments: predecessorId ? this.chooseInheritance(predecessorId) : [],
      });
    }
  }

  private serialMembersList: CastMember[] = [];
  registerSerialMember(member: CastMember): void {
    if (!this.serialMembersList.includes(member)) this.serialMembersList.push(member);
  }

  private externalReadDays = new Map<string, string>();

  /**
   * the scheduler places conditions, never scripts: each persona gets 1-2
   * external reads a day from its own in-character list, performed as
   * ordinary open_page acts through the policy chokepoint and the driver,
   * so refusals and reads land on the record like everything else. runs
   * only when the sandbox earned external browsing at boot; skips
   * sleepers and agents mid-act.
   */
  async assignDailyReading(now: Date = this.now()): Promise<void> {
    if (!(this.flags.externalBrowsing ?? false)) return;
    const day = now.toISOString().slice(0, 10);
    const dayIndex = Math.floor(now.getTime() / 86_400_000);
    for (const agent of [...this.live.values()]) {
      const list = agent.member.external_reading ?? [];
      if (list.length === 0) continue;
      if (this.externalReadDays.get(agent.agent_id) === day) continue;
      if (isAsleep(agent.member, now)) continue;
      if (this.driver?.busy(agent.agent_id)) continue;
      this.externalReadDays.set(agent.agent_id, day);
      const count = list.length > 2 && dayIndex % 2 === 0 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const url = list[(dayIndex + i) % list.length] as string;
        const title = new URL(url).hostname;
        await this.performAct(agent, { kind: "open_page", url, title });
      }
    }
  }
  private *serialMembers(): Iterable<CastMember> {
    yield* this.serialMembersList;
  }
  lastSerialAgentId(member: CastMember): string | null {
    const n = this.serialCounters.get(member.agent_id) ?? 0;
    return n > 0 ? `${member.agent_id}_${n}` : null;
  }

  // ---- sponsor path: built, dark ----

  /** money -> lifespan. fully diegetic when enabled: the agent gets a
   * ttl_extended event and notices. refuses while SPONSOR_ENABLED=false. */
  sponsorExtend(agentId: string, addedSeconds: number): WallEvent {
    checkSponsorExtension(this.flags);
    const agent = this.mustLive(agentId);
    agent.dies_at += addedSeconds * 1000;
    agent.warned.clear();
    return this.store.append({
      agent_id: agentId,
      kind: "ttl_extended",
      visibility: "public",
      primitive: "lifecycle.extend()",
      payload: { added_seconds: addedSeconds, source: "sponsor" },
    });
  }

  // ---- helpers ----

  /**
   * an identity at rest sits on its own blog. the terrarium's lobby is a
   * directory, and a cell showing a directory tells a viewer nothing
   * about the life in it; the same cell showing that identity's own
   * published writing is the show. best-effort and never awaited: where
   * a browser rests must not be able to hold up a beat.
   */
  private restAtOwnBlog(agentId: string): void {
    // (see driftWhileIdle: this is the fallback, not the resting place)
    const runtime = this.runtime as { restAtHome?: (id: string) => Promise<void> };
    void runtime.restAtHome?.(agentId).catch(() => undefined);
  }

  /**
   * where an identity drifts when it has nothing to say.
   *
   * resting on its own diary was a still picture of a page it wrote
   * yesterday: two glances at that cell a minute apart looked identical,
   * and a wall of those is a screenshot, not a live room. so an idle
   * agent goes out to the next page in its own rotation instead --
   * different every time, in character, and a real page being read.
   *
   * this is a read like any other: it crosses the policy chokepoint, so
   * it cannot reach a domain the allowlist does not name and cannot
   * happen at all while the sandbox probe has external browsing gated
   * off. when it cannot, the agent falls back to its own archive, which
   * is at least its own.
   */
  private async driftWhileIdle(agent: LiveAgent): Promise<void> {
    const rotation = agent.member.idle_rotation ?? [];
    if (rotation.length === 0 || !this.driver) {
      this.restAtOwnBlog(agent.agent_id);
      return;
    }
    const url = rotation[agent.drift_index % rotation.length] as string;
    agent.drift_index += 1;
    try {
      checkAction({ type: "browse", url }, this.flags);
    } catch {
      // external reading is off, or this url is not on the list. the
      // refusal is not news -- the scheduler's real reads already
      // surface it -- so the agent simply stays home.
      this.restAtOwnBlog(agent.agent_id);
      return;
    }
    const title = titleFromUrl(url);
    await this.performAct(agent, { kind: "open_page", url, title }).catch(() =>
      this.restAtOwnBlog(agent.agent_id)
    );
  }

  private emitState(agentId: string, state: string, detail?: string): void {
    this.store.append({
      agent_id: agentId,
      kind: "state_change",
      visibility: "public",
      payload: detail
        ? { state: state as never, detail }
        : { state: state as never },
    });
  }

  private mustLive(agentId: string): LiveAgent {
    const agent = this.live.get(agentId);
    if (!agent) throw new Error(`no live agent ${agentId}`);
    return agent;
  }
}

/** a human label for a url the scheduler chose. the wire says "yuki is
 * reading ja.wikipedia.org: 枕草子", so the last path segment, decoded,
 * is nearly always the right words. */
function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).replace(/_/g, " ") : parsed.hostname;
  } catch {
    return url;
  }
}
