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

/**
 * identity-manifest schema version.
 *
 * 2.1 raised exactly one ceiling over 2.0: permissions.network may reach
 * enforcement "enforced", but ONLY when an actual route is attached (see
 * networkPermissionSchema).
 *
 * 2.2 raises exactly one more: permissions.tools may reach "enforced", but
 * ONLY when the identity declares a tool scope (see toolsPermissionSchema).
 * every other ceiling is unchanged. we accept all three versions on read and
 * emit 2.2 for new identities — the established accept-old / emit-new /
 * upgrade-on-read bridge. blueprints stay 2.0: routes and tool scopes are
 * operator-specific infrastructure, never shareable template content.
 */
export const MANIFEST_VERSION = "2.2" as const;
export const ACCEPTED_MANIFEST_VERSIONS = ["2.0", "2.1", "2.2"] as const;

/**
 * a per-identity network route. the proxy is applied at launch via chromium's
 * --proxy-server; its presence is what lets network enforcement be "enforced".
 */
export const networkRouteSchema = z
  .object({
    proxy: z
      .string()
      .regex(
        /^(https?|socks5|socks4):\/\/[^\s/]+$/,
        "proxy must be http(s)://host:port or socks5://host:port"
      ),
    /** operator-facing label, e.g. "residential-eu" */
    label: z.string().max(120).nullable(),
  })
  .strict();
export type NetworkRoute = z.infer<typeof networkRouteSchema>;

/**
 * network permission with a route-gated enforcement ceiling. the two shapes
 * are the ONLY representable states, so "network enforced with no route" — an
 * unearned claim — cannot be written:
 *   - standard: no route, shared ip/path, enforcement advisory
 *   - routed:   a route attached, enforcement enforced (proven at launch)
 */
export const networkPermissionSchema = z
  .object({
    value: z.enum(["standard", "routed"]),
    enforcement: z.enum(["advisory", "enforced"]),
    route: networkRouteSchema.nullable(),
  })
  .strict()
  .refine(
    (n) =>
      (n.value === "standard" && n.enforcement === "advisory" && n.route === null) ||
      (n.value === "routed" && n.enforcement === "enforced" && n.route !== null),
    {
      message:
        "network: 'standard' requires no route and enforcement 'advisory'; 'routed' requires an attached route and enforcement 'enforced'",
    }
  );

/** mcp server and tool names, as they appear on the wire */
export const toolNameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/, "must be an mcp server/tool name");

/**
 * which brokered tools this identity's agent may reach.
 *
 * `tools: null` means every tool that server exposes — including tools it
 * grows later, which is why a null entry is the looser choice. an empty
 * `servers` array is legal and meaningful: a scoped identity that may reach
 * nothing at all.
 */
export const toolScopeSchema = z
  .object({
    servers: z
      .array(
        z
          .object({
            server: toolNameSchema,
            tools: z.array(toolNameSchema).max(128).nullable(),
          })
          .strict()
      )
      .max(64),
  })
  .strict();
export type ToolScope = z.infer<typeof toolScopeSchema>;

/**
 * tool permission with a scope-gated enforcement ceiling, exactly parallel to
 * network. the two shapes are the ONLY representable states, so "tools
 * enforced with no declared scope" — an unearned claim — cannot be written:
 *   - open:   no scope declared, mortal brokers whatever is registered, advisory
 *   - scoped: a scope declared, calls outside it are refused, enforcement enforced
 *
 * what "enforced" covers: the tool calls mortal brokers. an agent that holds
 * its own connection to a server is outside this boundary — see NON_GUARANTEES.
 */
export const toolsPermissionSchema = z
  .object({
    value: z.enum(["open", "scoped"]),
    enforcement: z.enum(["advisory", "enforced"]),
    scope: toolScopeSchema.nullable(),
  })
  .strict()
  .refine(
    (t) =>
      (t.value === "open" && t.enforcement === "advisory" && t.scope === null) ||
      (t.value === "scoped" && t.enforcement === "enforced" && t.scope !== null),
    {
      message:
        "tools: 'open' requires no scope and enforcement 'advisory'; 'scoped' requires a declared scope and enforcement 'enforced'",
    }
  );

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

export const COMPANION_EXTENSION_REF = "mortal-companion" as const;
export const WEBSTORE_ID_RE = /^[a-p]{32}$/;

/** extension refs are the mortal companion sentinel or chrome web store ids only */
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
    network: networkPermissionSchema,
    tools: toolsPermissionSchema,
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
    schemaVersion: z.enum(ACCEPTED_MANIFEST_VERSIONS),
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
        message: "the mortal-companion extension must be present",
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

/** the companion ref used before the mortal systems rename */
export const LEGACY_COMPANION_EXTENSION_REF = "liminal-companion" as const;

/**
 * accept identity manifests written before the rename: stored manifests may
 * still reference the legacy companion ref. pure, applied at read time (the
 * spec's manifest-upgrader mechanism); rows converge to the new ref the next
 * time they are re-serialized by a state transition.
 */
export function upgradeStoredManifest(parsed: unknown): unknown {
  if (parsed !== null && typeof parsed === "object") {
    const manifest = parsed as {
      surfaces?: { browser?: { extensions?: unknown[] } };
      permissions?: { network?: { route?: unknown }; tools?: unknown };
    };
    const extensions = manifest.surfaces?.browser?.extensions;
    if (Array.isArray(extensions)) {
      manifest.surfaces!.browser!.extensions = extensions.map((entry) =>
        entry === LEGACY_COMPANION_EXTENSION_REF ? COMPANION_EXTENSION_REF : entry
      );
    }
    // schema 2.0 -> 2.1: a routeless network permission gains an explicit
    // route: null. enforcement/value stay untouched (still standard/advisory).
    const network = manifest.permissions?.network;
    if (network !== undefined && network !== null && network.route === undefined) {
      network.route = null;
    }
    // 2.1 -> 2.2: an identity written before tool scoping declared no scope,
    // and an undeclared scope is exactly "open" — mortal brokers whatever is
    // registered and says so. never silently upgraded to "scoped".
    if (manifest.permissions !== undefined && manifest.permissions.tools === undefined) {
      manifest.permissions.tools = { value: "open", enforcement: "advisory", scope: null };
    }
  }
  return parsed;
}
