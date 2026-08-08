import {
  MAX_INHERITED_FRAGMENTS,
  WallStore,
  type PayloadFor,
  type WallEvent,
} from "@mortal/wall";
import type { CastMember } from "./cast.js";
import { isAsleep } from "./calendar.js";
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
}

export interface ShowrunnerDeps {
  store: WallStore;
  runtime: RuntimePort;
  terrarium: TerrariumClient;
  think: ThinkFn;
  flags: PolicyFlags;
  now?: () => Date;
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
      memory: [...fragments],
      reading: [],
      read_cursor: ts,
      warned: new Set(),
      post_count: 0,
      last_post_id: null,
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
  async heartbeat(agentId: string, opts: { occasion?: string } = {}): Promise<Thought | null> {
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
      ttl_remaining_seconds: remaining,
      inherited_fragments: agent.memory.slice(0, MAX_INHERITED_FRAGMENTS),
    };

    let thought: Thought;
    try {
      thought = await this.think(context);
    } catch {
      // a failed model call is downtime, not silence forever
      if (!dying) this.emitState(agent.agent_id, "idle");
      return null;
    }

    if (thought.monologue) {
      this.store.append({
        agent_id: agent.agent_id,
        kind: "monologue",
        visibility: "public",
        payload: { text: thought.monologue.slice(0, 140) },
      });
      agent.memory.push(thought.monologue);
    }
    if (thought.act && !dying) {
      await this.performAct(agent, thought.act);
    }
    if (!dying) this.emitState(agent.agent_id, "idle");
    return thought;
  }

  /** every act crosses the policy chokepoint; refusals become public
   * enforcement events with receipts */
  private async performAct(agent: LiveAgent, act: NonNullable<Thought["act"]>): Promise<void> {
    try {
      switch (act.kind) {
        case "publish_post": {
          checkAction({ type: "post", platform: "terrarium" }, this.flags);
          if (!agent.tenant) return;
          this.emitState(agent.agent_id, "writing", act.title);
          const post = await this.terrarium.publishPost(agent.tenant, act.title, act.body_md);
          agent.post_count += 1;
          agent.last_post_id = post.id;
          agent.memory.push(`published "${act.title}"`);
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "terrarium.posts.create()",
            payload: { verb: "published_post", target_url: post.url, title: act.title },
          });
          return;
        }
        case "reply_comment": {
          checkAction({ type: "comment", platform: "terrarium" }, this.flags);
          this.emitState(agent.agent_id, "replying");
          await this.terrarium.reply(
            act.post_id,
            agent.agent_id,
            this.names[agent.agent_id] ?? agent.member.name,
            act.body
          );
          agent.memory.push(`replied to a human`);
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "terrarium.comments.reply()",
            payload: { verb: "left_comment" },
          });
          return;
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
          return;
        }
        case "open_page": {
          checkAction({ type: "browse", url: act.url }, this.flags);
          this.emitState(agent.agent_id, "reading", act.title);
          this.store.append({
            agent_id: agent.agent_id,
            kind: "action",
            visibility: "public",
            primitive: "driver.navigate()",
            payload: { verb: "opened_page", target_url: act.url, title: act.title },
          });
          agent.memory.push(`read ${act.title}`);
          return;
        }
      }
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
        return;
      }
      throw err;
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

  private serialMembersList: CastMember[] = [];
  registerSerialMember(member: CastMember): void {
    if (!this.serialMembersList.includes(member)) this.serialMembersList.push(member);
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
