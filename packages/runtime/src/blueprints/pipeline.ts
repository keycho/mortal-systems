import {
  BLUEPRINT_MAX_BYTES,
  blueprintManifestSchema,
  composeManifest,
  DurationError,
  generateBlueprintId,
  generateIdentityId,
  manifestInputFromBlueprint,
  randomId,
  toValidationIssues,
  type BlueprintManifest,
  type BlueprintSummary,
  type IdentitySummary,
  type ManifestOverrides,
  type ValidationIssue,
} from "@mortal/schema";
import { ZodError } from "zod";
import { errors } from "../errors.js";
import type { BlueprintRow } from "../store/repo.js";
import type { MortalRuntime } from "../runtime.js";

/**
 * the blueprint import pipeline, every import without exception (first-party
 * included): size gate 256kb -> json parse -> strict zod (banned content is
 * schema-impossible; unknown keys reject) -> url checks (http(s) only, no
 * credentials; enforced inside the schema) -> extension refs are web-store
 * ids only, shown for consent, never auto-installed except the companion.
 * the preview screen and explicit confirm live in the manager; this module
 * provides the validated data they render.
 */

const BOOKMARK_FOLDERS_SETTING = (identityId: string) => `bookmark_folders:${identityId}`;

export interface ValidateResult {
  ok: boolean;
  errors: ValidationIssue[];
}

export class BlueprintService {
  constructor(private readonly runtime: MortalRuntime) {}

  validate(manifestJson: string): ValidateResult {
    if (Buffer.byteLength(manifestJson, "utf8") > BLUEPRINT_MAX_BYTES) {
      return {
        ok: false,
        errors: [{ path: "", message: `blueprint exceeds the ${BLUEPRINT_MAX_BYTES / 1024}kb size gate` }],
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestJson);
    } catch {
      return { ok: false, errors: [{ path: "", message: "blueprint is not valid json" }] };
    }
    const result = blueprintManifestSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, errors: toValidationIssues(result.error) };
    }
    return { ok: true, errors: [] };
  }

  install(input: { manifestJson: string; source: string }): { blueprintId: string } {
    const verdict = this.validate(input.manifestJson);
    if (!verdict.ok) {
      throw errors.validation("blueprint failed validation", verdict.errors);
    }
    const manifest = blueprintManifestSchema.parse(JSON.parse(input.manifestJson));

    // reinstalling the same name+version is idempotent
    const existing = this.runtime.repo.findBlueprintByNameVersion(
      manifest.name,
      manifest.blueprintVersion
    );
    if (existing) return { blueprintId: existing.id };

    const id = generateBlueprintId();
    this.runtime.repo.insertBlueprint({
      id,
      name: manifest.name,
      version: manifest.blueprintVersion,
      publisher: manifest.publisher.id,
      reviewTier: manifest.publisher.reviewTier ?? "standard",
      manifestJson: JSON.stringify(manifest),
      signature: null, // unsigned in v1; the ui shows an "unsigned" badge
      source: input.source,
      category: manifest.category,
      installedAt: new Date().toISOString(),
    });
    return { blueprintId: id };
  }

  list(): BlueprintSummary[] {
    return this.runtime.repo.listBlueprints().map((row) => this.summarize(row));
  }

  get(id: string): { summary: BlueprintSummary; manifest: BlueprintManifest } {
    const row = this.runtime.repo.getBlueprint(id);
    if (!row) throw errors.notFound("blueprint", id);
    return {
      summary: this.summarize(row),
      manifest: blueprintManifestSchema.parse(JSON.parse(row.manifest_json)),
    };
  }

  /** blueprint -> live identity: manifest composed, bookmarks/notes seeded, expiry scheduled */
  createIdentity(input: { blueprintId: string; overrides?: ManifestOverrides }): IdentitySummary {
    const { manifest: blueprint } = this.get(input.blueprintId);
    const row = this.runtime.repo.getBlueprint(input.blueprintId)!;

    const id = generateIdentityId();
    const now = new Date().toISOString();
    let manifest;
    try {
      manifest = composeManifest(
        manifestInputFromBlueprint(blueprint, {
          id,
          createdAt: now,
          source: row.source,
          signature: row.signature,
          overrides: input.overrides,
        })
      );
    } catch (err) {
      if (err instanceof ZodError) {
        throw errors.validation("overrides produce an invalid manifest", toValidationIssues(err));
      }
      if (err instanceof DurationError) {
        throw errors.validation(err.message, [{ path: "overrides.lifetime", message: err.message }]);
      }
      throw err;
    }

    const summary = this.runtime.identities.create({ manifest, blueprintId: input.blueprintId });

    this.runtime.repo.transaction(() => {
      for (const [index, bookmark] of (blueprint.bookmarks ?? []).entries()) {
        this.runtime.repo.insertBookmark({
          id: `bmk_${randomId(21)}`,
          identityId: id,
          title: bookmark.title,
          url: bookmark.url,
          folder: bookmark.folder ?? null,
          position: index,
        });
      }
      for (const note of blueprint.notes ?? []) {
        this.runtime.repo.insertNote({
          id: `not_${randomId(21)}`,
          identityId: id,
          title: note.title,
          bodyMd: note.bodyMd,
          updatedAt: now,
        });
      }
      if (blueprint.bookmarkFolders && blueprint.bookmarkFolders.length > 0) {
        this.runtime.repo.setSetting(
          BOOKMARK_FOLDERS_SETTING(id),
          JSON.stringify(blueprint.bookmarkFolders)
        );
      }
      this.runtime.repo.appendActivity(
        id,
        "blueprint_installed",
        {
          blueprintId: input.blueprintId,
          name: blueprint.name,
          version: blueprint.blueprintVersion,
          source: row.source,
          signed: row.signature !== null,
        },
        now
      );
    });

    return this.runtime.identities.list().find((s) => s.id === id) ?? summary;
  }

  /**
   * identity -> blueprint: strips all runtime state. ids, paths, timestamps,
   * lifecycle state, notes and ai history (session-like) never leave; the
   * result must itself pass the import pipeline.
   */
  export(identityId: string): { manifestJson: string } {
    const { manifest } = this.runtime.identities.get(identityId);
    if (!manifest) {
      throw errors.invalidState(`identity "${identityId}" is destroyed; nothing exportable remains`);
    }
    const row = this.runtime.identities.mustGetRow(identityId);
    const original =
      row.blueprint_id !== null ? this.runtime.repo.getBlueprint(row.blueprint_id) : undefined;
    const originalManifest = original
      ? blueprintManifestSchema.parse(JSON.parse(original.manifest_json))
      : null;

    const bookmarks = this.runtime.repo.listBookmarks(identityId).map((b) => ({
      title: b.title,
      url: b.url,
      ...(b.folder !== null ? { folder: b.folder } : {}),
    }));
    const foldersRaw = this.runtime.repo.getSetting(BOOKMARK_FOLDERS_SETTING(identityId));

    const persistent = manifest.lifecycle.lifetime === "persistent";
    const exported: BlueprintManifest = blueprintManifestSchema.parse({
      schemaVersion: "2.0",
      blueprintVersion: "1.0.0",
      name: manifest.name,
      description:
        originalManifest?.description ??
        `exported from the "${manifest.name}" identity. configuration only; no session data.`,
      category: originalManifest?.category ?? "custom",
      recommendedLifetime: manifest.lifecycle.lifetime,
      theme: manifest.surfaces.browser.theme,
      // onExpiry destroy cannot be expressed for persistent blueprints
      ...(persistent && manifest.lifecycle.onExpiry === "destroy"
        ? {}
        : { lifecycle: { onExpiry: manifest.lifecycle.onExpiry } }),
      ...(bookmarks.length > 0 ? { bookmarks } : {}),
      ...(foldersRaw ? { bookmarkFolders: JSON.parse(foldersRaw) } : {}),
      ...(manifest.ai.systemInstructions.length > 0
        ? { ai: { systemInstructions: manifest.ai.systemInstructions } }
        : {}),
      permissions: {
        wallet: { value: manifest.permissions.wallet.value, enforcement: "advisory" },
        network: { value: manifest.permissions.network.value, enforcement: "advisory" },
        email: { value: manifest.permissions.email.value, enforcement: "roadmap" },
      },
      privacy: {
        retainHistory: {
          value: manifest.privacy.retainHistory.value,
          enforcement: "enforced",
        },
      },
      publisher: { id: null, reviewTier: null },
    });

    this.runtime.repo.appendActivity(
      identityId,
      "exported",
      { as: "blueprint", name: exported.name },
      new Date().toISOString()
    );
    return { manifestJson: JSON.stringify(exported, null, 2) };
  }

  private summarize(row: BlueprintRow): BlueprintSummary {
    const manifest = blueprintManifestSchema.parse(JSON.parse(row.manifest_json));
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      description: manifest.description,
      category: row.category ?? manifest.category,
      recommendedLifetime: manifest.recommendedLifetime,
      theme: manifest.theme,
      publisher: row.publisher,
      reviewTier: (row.review_tier as BlueprintSummary["reviewTier"]) ?? "standard",
      source: row.source,
      signed: row.signature !== null,
      installedAt: row.installed_at,
    };
  }
}

/** provisioning reads this to scaffold empty bookmark folders */
export function bookmarkFoldersFor(runtime: MortalRuntime, identityId: string): string[] {
  const raw = runtime.repo.getSetting(BOOKMARK_FOLDERS_SETTING(identityId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
