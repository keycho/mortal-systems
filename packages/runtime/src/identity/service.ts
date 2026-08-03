import {
  identityManifestSchema,
  toValidationIssues,
  tombstoneSchema,
  upgradeStoredManifest,
  type IdentityManifest,
  type IdentityState,
  type IdentitySummary,
} from "@mortal/schema";
import { ZodError } from "zod";
import { errors } from "../errors.js";
import type { IdentityRow, Repo } from "../store/repo.js";
import { assertTransition } from "./state.js";

/** neutral display values for tombstoned rows, where the manifest is gone */
const DESTROYED_COLOR = "#52525B";

/** parse a stored manifest_json, upgrading pre-rename content at read time */
export function parseStoredManifest(json: string) {
  return identityManifestSchema.parse(upgradeStoredManifest(JSON.parse(json)));
}


export function parseManifestRow(row: IdentityRow): IdentityManifest | null {
  if (row.state === "destroyed") return null;
  return parseStoredManifest(row.manifest_json);
}

export function summaryFromRow(row: IdentityRow): IdentitySummary {
  if (row.state === "destroyed") {
    const tomb = tombstoneSchema.safeParse(JSON.parse(row.manifest_json));
    return {
      id: row.id,
      name: tomb.success ? tomb.data.name : row.name,
      state: "destroyed",
      color: DESTROYED_COLOR,
      lifetime: "-",
      expiresAt: null,
      onExpiry: "destroy",
      blueprint: null,
      lastLaunchedAt: row.last_launched_at,
      storageBytes: 0,
      spaceNumber: row.space_number,
    };
  }
  const manifest = parseStoredManifest(row.manifest_json);
  return {
    id: row.id,
    name: manifest.name,
    state: row.state,
    color: manifest.color,
    lifetime: manifest.lifecycle.lifetime,
    expiresAt: row.expires_at,
    onExpiry: manifest.lifecycle.onExpiry,
    blueprint:
      manifest.blueprint.source !== null
        ? {
            source: manifest.blueprint.source,
            version: manifest.blueprint.version ?? "0.0.0",
          }
        : null,
    lastLaunchedAt: row.last_launched_at,
    storageBytes: row.storage_bytes,
    spaceNumber: row.space_number,
  };
}

export class IdentityService {
  constructor(
    private readonly repo: Repo,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly onTransition?: (id: string, state: IdentityState) => void
  ) {}

  /**
   * create an identity from a full manifest. the manifest is re-validated
   * against the canonical schema; runtime-assigned paths must match the
   * identity id (the poc does not accept custom partition layouts).
   */
  create(input: { manifest: unknown; blueprintId?: string }): IdentitySummary {
    let manifest: IdentityManifest;
    try {
      manifest = identityManifestSchema.parse(input.manifest);
    } catch (err) {
      if (err instanceof ZodError) {
        throw errors.validation("manifest failed validation", toValidationIssues(err));
      }
      throw err;
    }

    if (manifest.surfaces.browser.profilePath !== `profiles/${manifest.id}`) {
      throw errors.validation(
        `profilePath must be "profiles/${manifest.id}" (runtime-assigned in the poc)`
      );
    }
    if (manifest.surfaces.files.root !== `files/${manifest.id}`) {
      throw errors.validation(`files.root must be "files/${manifest.id}" (runtime-assigned in the poc)`);
    }
    if (manifest.lifecycle.state !== "created") {
      throw errors.validation('a new manifest must have lifecycle.state "created"');
    }
    if (this.repo.getIdentity(manifest.id)) {
      throw errors.conflict(`identity "${manifest.id}" already exists`);
    }

    const now = this.now();
    this.repo.transaction(() => {
      this.repo.insertIdentity({
        id: manifest.id,
        name: manifest.name,
        state: "created",
        manifestJson: JSON.stringify(manifest),
        blueprintId: input.blueprintId ?? null,
        createdAt: manifest.lifecycle.createdAt,
        expiresAt: manifest.lifecycle.expiresAt,
      });
      this.repo.appendActivity(
        manifest.id,
        "created",
        { name: manifest.name, lifetime: manifest.lifecycle.lifetime },
        now
      );
      if (manifest.lifecycle.expiresAt !== null) {
        this.repo.insertLifecycleJob(
          manifest.id,
          manifest.lifecycle.expiresAt,
          manifest.lifecycle.onExpiry
        );
        this.repo.appendActivity(
          manifest.id,
          "expiry_scheduled",
          { fireAt: manifest.lifecycle.expiresAt, action: manifest.lifecycle.onExpiry },
          now
        );
      }
    });

    return summaryFromRow(this.mustGetRow(manifest.id));
  }

  get(id: string): { summary: IdentitySummary; manifest: IdentityManifest | null } {
    const row = this.mustGetRow(id);
    return { summary: summaryFromRow(row), manifest: parseManifestRow(row) };
  }

  list(filter?: { state?: IdentityState[] }): IdentitySummary[] {
    return this.repo.listIdentities(filter?.state).map(summaryFromRow);
  }

  /** persist a state transition after checking the state machine */
  transition(id: string, to: IdentityState): IdentityRow {
    const row = this.mustGetRow(id);
    assertTransition(id, row.state, to);
    if (row.state !== to) {
      this.repo.updateIdentityState(id, to);
      // keep manifest_json's lifecycle.state in sync so exports stay truthful
      if (to !== "destroyed") {
        const manifest = parseStoredManifest(row.manifest_json);
        manifest.lifecycle.state = to;
        this.repo.db
          .prepare("UPDATE identities SET manifest_json = ? WHERE id = ?")
          .run(JSON.stringify(manifest), id);
      }
      this.onTransition?.(id, to);
    }
    return this.mustGetRow(id);
  }

  mustGetRow(id: string): IdentityRow {
    const row = this.repo.getIdentity(id);
    if (!row) throw errors.notFound("identity", id);
    return row;
  }
}
