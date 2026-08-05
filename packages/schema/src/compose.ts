import { computeExpiresAt, PERSISTENT } from "./duration.js";
import type { BlueprintManifest } from "./blueprint.js";
import {
  COMPANION_EXTENSION_REF,
  identityManifestSchema,
  MANIFEST_VERSION,
  type IdentityManifest,
  type NetworkRoute,
} from "./manifest.js";
import type { ManifestOverrides } from "./api.js";

/** quiet institutional gray; identities created without a color get this */
export const DEFAULT_COLOR = "#8A8F98";

export interface ComposeManifestInput {
  id: string;
  name: string;
  /** iso datetime; the caller supplies "now" so this stays a pure function */
  createdAt: string;
  color?: string;
  theme?: string;
  /** default "persistent" */
  lifetime?: string;
  /** default: "archive" for persistent, "destroy" otherwise */
  onExpiry?: "destroy" | "suspend" | "archive";
  systemInstructions?: string;
  aiProvider?: "user-key" | "none";
  /** default true */
  retainHistory?: boolean;
  wallet?: "none" | "read-intent" | "declared";
  email?: "none" | "temporary" | "dedicated";
  /**
   * attach a network route: when present, network becomes value "routed" /
   * enforcement "enforced" and the launcher applies it via --proxy-server.
   * absent → standard / advisory (shared ip). the schema makes any other
   * combination unrepresentable.
   */
  networkRoute?: NetworkRoute;
  /** chrome web store ids beyond the always-present companion */
  extensions?: string[];
  blueprint?: { source: string | null; version: string | null; signature: string | null };
  publisher?: { id: string | null; reviewTier: "standard" | "verified" | "elevated" | null };
}

/**
 * build a valid identity manifest from creation inputs. pure: no clocks, no
 * randomness, no filesystem. output is validated against the canonical schema
 * before being returned.
 */
export function composeManifest(input: ComposeManifestInput): IdentityManifest {
  const lifetime = input.lifetime ?? PERSISTENT;
  const persistent = lifetime === PERSISTENT;
  const color = input.color ?? DEFAULT_COLOR;

  const manifest: IdentityManifest = {
    schemaVersion: MANIFEST_VERSION,
    id: input.id,
    name: input.name,
    color,
    blueprint: input.blueprint ?? { source: null, version: null, signature: null },
    lifecycle: {
      lifetime,
      createdAt: input.createdAt,
      expiresAt: computeExpiresAt(input.createdAt, lifetime),
      onExpiry: input.onExpiry ?? (persistent ? "archive" : "destroy"),
      state: "created",
    },
    surfaces: {
      browser: {
        type: "chromium-local",
        profilePath: `profiles/${input.id}`,
        theme: input.theme ?? color,
        extensions: [COMPANION_EXTENSION_REF, ...(input.extensions ?? [])],
      },
      memory: { type: "local", scope: "identity-only", retention: "until-destroy" },
      files: { type: "local", root: `files/${input.id}` },
    },
    permissions: {
      filesystem: { value: "identity-partition-only", enforcement: "enforced" },
      memoryScope: { value: "identity-only", enforcement: "enforced" },
      wallet: { value: input.wallet ?? "none", enforcement: "advisory" },
      email: { value: input.email ?? "none", enforcement: "roadmap" },
      network:
        input.networkRoute !== undefined
          ? { value: "routed", enforcement: "enforced", route: input.networkRoute }
          : { value: "standard", enforcement: "advisory", route: null },
    },
    privacy: {
      retainHistory: { value: input.retainHistory ?? true, enforcement: "enforced" },
      redaction: { value: false, enforcement: "roadmap" },
    },
    ai: {
      systemInstructions: input.systemInstructions ?? "",
      provider: input.aiProvider ?? "user-key",
      historyRetention: "until-destroy",
    },
    publisher: input.publisher ?? { id: null, reviewTier: null },
  };

  return identityManifestSchema.parse(manifest);
}

/**
 * map an installed blueprint to manifest-composition input. recommended
 * extensions are never carried over implicitly: only ids the user explicitly
 * consented to (overrides.consentedExtensionIds) are declared on the identity.
 */
export function manifestInputFromBlueprint(
  blueprint: BlueprintManifest,
  opts: {
    id: string;
    createdAt: string;
    source: string | null;
    signature: string | null;
    overrides?: ManifestOverrides;
  }
): ComposeManifestInput {
  const o = opts.overrides ?? {};
  return {
    id: opts.id,
    createdAt: opts.createdAt,
    name: o.name ?? blueprint.name,
    color: o.color ?? blueprint.theme,
    theme: blueprint.theme,
    lifetime: o.lifetime ?? blueprint.recommendedLifetime,
    onExpiry: o.onExpiry ?? blueprint.lifecycle?.onExpiry,
    systemInstructions: blueprint.ai?.systemInstructions,
    aiProvider: o.aiProvider,
    retainHistory: blueprint.privacy?.retainHistory.value,
    wallet: blueprint.permissions?.wallet?.value,
    email: blueprint.permissions?.email?.value,
    extensions: o.consentedExtensionIds ?? [],
    blueprint: {
      source: opts.source,
      version: blueprint.blueprintVersion,
      signature: opts.signature,
    },
    publisher: blueprint.publisher,
  };
}
