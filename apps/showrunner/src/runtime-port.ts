import { createHash } from "node:crypto";

/**
 * the boundary to the mortal runtime. the wall never fakes a lifecycle:
 * spawn is identity.create(), death is identity.destroy(), and the port is
 * where those calls happen. the launcher/manager side implements this
 * against the real runtime api (POST /identities, destroy with teardown
 * receipt, activity stats); that work is specced at this interface only.
 *
 * StubRuntimePort exists for tests and the dev loop: it keeps honest books
 * (real timestamps, real receipt hashes over real teardown records) but
 * launches no browser. the cli says so out loud when it uses it.
 */

export interface SpawnSpec {
  agent_id: string;
  class: string;
  region: string | null;
  locale: string | null;
  ttl_seconds: number;
}

export interface SpawnResult {
  identity_id: string;
  fingerprint_short: string;
}

export interface DestroyResult {
  /** the runtime's teardown receipt for the destroyed identity */
  receipt: string;
}

export interface IdentityStats {
  cookie_count: number;
  account_count: number;
  memory_bytes: number;
}

export interface RuntimePort {
  spawn(spec: SpawnSpec): Promise<SpawnResult>;
  destroy(identityId: string, cause: string): Promise<DestroyResult>;
  stats(identityId: string): Promise<IdentityStats>;
}

export class StubRuntimePort implements RuntimePort {
  private readonly live = new Map<string, { spec: SpawnSpec; created_at: string }>();
  private counter = 0;

  async spawn(spec: SpawnSpec): Promise<SpawnResult> {
    const identityId = `idn_stub_${++this.counter}_${spec.agent_id}`;
    this.live.set(identityId, { spec, created_at: new Date().toISOString() });
    const fingerprint = createHash("sha256")
      .update(`${identityId}:${spec.region ?? "nowhere"}`)
      .digest("hex")
      .slice(0, 8);
    return { identity_id: identityId, fingerprint_short: `fp_${fingerprint.slice(0, 4)}` };
  }

  async destroy(identityId: string, cause: string): Promise<DestroyResult> {
    const record = this.live.get(identityId);
    if (!record) throw new Error(`no live identity ${identityId}`);
    this.live.delete(identityId);
    const receipt = createHash("sha256")
      .update(
        JSON.stringify({
          identity_id: identityId,
          created_at: record.created_at,
          destroyed_at: new Date().toISOString(),
          cause,
        })
      )
      .digest("hex");
    return { receipt };
  }

  async stats(identityId: string): Promise<IdentityStats> {
    if (!this.live.has(identityId)) throw new Error(`no live identity ${identityId}`);
    return { cookie_count: 0, account_count: 0, memory_bytes: 0 };
  }
}
