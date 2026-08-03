import { z } from "zod";
import { PERSISTENT, lifetimeSchema } from "./duration.js";

/**
 * the canonical identity manifest, schema version 2.0.
 *
 * hard invariants, enforced by zod rather than convention:
 * - unknown keys are rejected everywhere (.strict())
 * - enforcement ceilings are literal types per field, so a manifest that
 *   over-claims enforcement (e.g. wallet "enforced") is unrepresentable
 * - expiresAt === null iff lifetime === "persistent"
 * - onExpiry "destroy" requires a non-persistent lifetime
 * - all paths are relative, resolved under the runtime root; absolute paths
 *   and ".." segments are rejected
 */

export const SCHEMA_VERSION = "2.0" as const;

export const identityStateSchema = z.enum([
  "created",
  "provisioning",
  "ready",
  "running",
  "suspended",
  "expiring",
  "destroying",
  "destroyed",
  "archived",
]);
export type IdentityState = z.infer<typeof identityStateSchema>;

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "must be a #RRGGBB hex color");

export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "must be a semver version");

export const identityIdSchema = z
  .string()
  .regex(/^idn_[A-Za-z0-9_-]{10,32}$/, "must be an idn_<nanoid> identity id");

export const identityNameSchema = z.string().min(1).max(64);

/** relative path under the runtime root. rejects absolute paths, drive letters, unc, "..", and null bytes. */
export const relativePathSchema = z
  .string()
  .min(1)
  .max(300)
  .superRefine((p, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (p.includes("\0")) return issue("path contains a null byte");
    if (p.startsWith("/") || p.startsWith("\\")) return issue("path must be relative to the runtime root");
    if (/^[A-Za-z]:[\\/]/.test(p)) return issue("windows drive-letter paths are not allowed");
    if (p.startsWith("~")) return issue("home-relative paths are not allowed");
    if (!/^[A-Za-z0-9._/-]+$/.test(p)) return issue("path contains unsupported characters");
    const segments = p.split("/");
    if (segments.some((s) => s === "..")) return issue('".." segments are not allowed');
    if (segments.some((s) => s.length === 0)) return issue("empty path segments are not allowed");
  });

export const COMPANION_EXTENSION_REF = "liminal-companion" as const;
export const WEBSTORE_ID_RE = /^[a-p]{32}$/;

/** extension refs are the liminal companion sentinel or chrome web store ids only */
export const extensionRefSchema = z.union([
  z.literal(COMPANION_EXTENSION_REF),
  z.string().regex(WEBSTORE_ID_RE, "extension refs must be 32-char chrome web store ids"),
]);

const isoDatetimeSchema = z.string().datetime({ offset: true });

export const lifecycleSchema = z
  .object({
    lifetime: lifetimeSchema,
    createdAt: isoDatetimeSchema,
    expiresAt: isoDatetimeSchema.nullable(),
    onExpiry: z.enum(["destroy", "suspend", "archive"]),
    state: identityStateSchema,
  })
  .strict();

const browserSurfaceSchema = z
  .object({
    type: z.literal("chromium-local"),
    profilePath: relativePathSchema,
    theme: hexColorSchema,
    extensions: z.array(extensionRefSchema).max(20),
  })
  .strict();

const memorySurfaceSchema = z
  .object({
    type: z.literal("local"),
    scope: z.literal("identity-only"),
    retention: z.literal("until-destroy"),
  })
  .strict();

const filesSurfaceSchema = z
  .object({
    type: z.literal("local"),
    root: relativePathSchema,
  })
  .strict();

/**
 * permissions with per-field enforcement ceilings. in schema 2.0 the schema
 * literally cannot express wallet.enforcement = "enforced" or
 * email.enforcement = "enforced"; raising a ceiling requires a schema version
 * bump plus a passing test.
 */
export const permissionsSchema = z
  .object({
    filesystem: z
      .object({ value: z.literal("identity-partition-only"), enforcement: z.literal("enforced") })
      .strict(),
    memoryScope: z
      .object({ value: z.literal("identity-only"), enforcement: z.literal("enforced") })
      .strict(),
    wallet: z
      .object({ value: z.enum(["none", "read-intent", "declared"]), enforcement: z.literal("advisory") })
      .strict(),
    email: z
      .object({ value: z.enum(["none", "temporary", "dedicated"]), enforcement: z.literal("roadmap") })
      .strict(),
    network: z
      .object({ value: z.literal("standard"), enforcement: z.literal("advisory") })
      .strict(),
  })
  .strict();

export const privacySchema = z
  .object({
    retainHistory: z
      .object({ value: z.boolean(), enforcement: z.literal("enforced") })
      .strict(),
    redaction: z
      .object({ value: z.literal(false), enforcement: z.literal("roadmap") })
      .strict(),
  })
  .strict();

export const aiConfigSchema = z
  .object({
    systemInstructions: z.string().max(8000),
    provider: z.enum(["user-key", "none"]),
    historyRetention: z.literal("until-destroy"),
  })
  .strict();

export const publisherSchema = z
  .object({
    id: z.string().min(1).max(120).nullable(),
    reviewTier: z.enum(["standard", "verified", "elevated"]).nullable(),
  })
  .strict();

export const blueprintRefSchema = z
  .object({
    source: z.string().min(1).max(300).nullable(),
    version: semverSchema.nullable(),
    signature: z.string().max(2000).nullable(),
  })
  .strict();

export const identityManifestSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: identityIdSchema,
    name: identityNameSchema,
    color: hexColorSchema,
    blueprint: blueprintRefSchema,
    lifecycle: lifecycleSchema,
    surfaces: z
      .object({
        browser: browserSurfaceSchema,
        memory: memorySurfaceSchema,
        files: filesSurfaceSchema,
      })
      .strict(),
    permissions: permissionsSchema,
    privacy: privacySchema,
    ai: aiConfigSchema,
    publisher: publisherSchema,
  })
  .strict()
  .superRefine((m, ctx) => {
    const persistent = m.lifecycle.lifetime === PERSISTENT;
    if (persistent && m.lifecycle.expiresAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifecycle", "expiresAt"],
        message: "expiresAt must be null when lifetime is persistent",
      });
    }
    if (!persistent && m.lifecycle.expiresAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifecycle", "expiresAt"],
        message: "expiresAt is required when lifetime is not persistent",
      });
    }
    if (persistent && m.lifecycle.onExpiry === "destroy") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifecycle", "onExpiry"],
        message: 'onExpiry "destroy" requires a non-persistent lifetime',
      });
    }
    if (!m.surfaces.browser.extensions.includes(COMPANION_EXTENSION_REF)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["surfaces", "browser", "extensions"],
        message: "the liminal-companion extension must be present",
      });
    }
  });

export type IdentityManifest = z.infer<typeof identityManifestSchema>;
export type IdentityPermissions = z.infer<typeof permissionsSchema>;
export type IdentityPrivacy = z.infer<typeof privacySchema>;

/** what remains of a manifest after destruction */
export const tombstoneSchema = z
  .object({
    id: identityIdSchema,
    name: identityNameSchema,
    destroyedAt: isoDatetimeSchema,
  })
  .strict();

export type Tombstone = z.infer<typeof tombstoneSchema>;
