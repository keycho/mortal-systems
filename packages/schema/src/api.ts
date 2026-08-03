import type { Enforcement } from "./enforcement.js";
import type { IdentityManifest, IdentityState } from "./manifest.js";

/**
 * the typed runtime api contract. one contract for every client: the manager
 * (via the tauri shell), tests, and the future sdk/mcp. transport is loopback
 * http rpc with bearer tokens; the companion gets a separate identity-scoped
 * /v1/self surface (day 3).
 */

// ---- destruction ----

export const DESTROY_STEPS = ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"] as const;
export type DestroyStep = (typeof DESTROY_STEPS)[number];

export const DESTROY_STEP_LABELS: Record<DestroyStep, string> = {
  D0: "capture paths and journal",
  D1: "fence: state destroying, cancel jobs, refuse launch",
  D2: "halt process tree",
  D3: "remove browser profile",
  D4: "remove files, downloads, companion instance",
  D5: "delete notes, ai messages, bookmarks rows",
  D6: "tombstone identity row",
  D7: "finalize activity log, clear journal",
};

export interface DestructionStepResult {
  step: DestroyStep;
  ok: boolean;
  detail?: string;
}

export interface DestructionReport {
  identityId: string;
  startedAt: string;
  completedAt: string;
  /** true when this destruction was resumed from the journal after a crash or restart */
  resumed: boolean;
  steps: DestructionStepResult[];
  /** the documented non-guarantees. always present, never trimmed. */
  caveats: string[];
}

// ---- activity ----

export const ACTIVITY_EVENTS = [
  "created",
  "provisioned",
  "launched",
  "suspended",
  "resumed",
  "blueprint_installed",
  "exported",
  "expiry_scheduled",
  "expiring",
  "expired_late",
  "destroy_started",
  "destroy_step",
  "destroyed",
  "archived",
  "error",
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENTS)[number];

export interface ActivityEvent {
  id: number;
  identityId: string;
  event: ActivityEventType;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

// ---- summaries ----

export interface IdentitySummary {
  id: string;
  name: string;
  state: IdentityState;
  color: string;
  lifetime: string;
  expiresAt: string | null;
  onExpiry: "destroy" | "suspend" | "archive";
  blueprint: { source: string; version: string } | null;
  lastLaunchedAt: string | null;
  storageBytes: number;
  /** display ordinal for "space NNN" rendering, assigned at creation */
  spaceNumber: number;
}

export interface BlueprintSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  recommendedLifetime: string;
  theme: string;
  publisher: string | null;
  reviewTier: "standard" | "verified" | "elevated";
  source: string;
  signed: boolean;
  installedAt: string;
}

export interface DetectedBrowser {
  kind: "chrome" | "chromium" | "brave";
  path: string;
  version: string | null;
  source: "standard-path" | "env-override" | "path-lookup";
}

export interface RuntimeStatus {
  version: string;
  root: string;
  port: number;
  pid: number;
  startedAt: string;
  browsers: DetectedBrowser[];
  defaultBrowser: DetectedBrowser | null;
  identitiesRunning: number;
  /** honest operational warnings, e.g. branded-chrome --load-extension caveats */
  warnings: string[];
}

export interface RuntimeCapabilities {
  enforceable: string[];
  advisory: string[];
  roadmap: string[];
  /** reserved contract methods that return NOT_IMPLEMENTED in the poc */
  reservedMethods: string[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

// ---- rpc envelope ----

export const ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_STATE: "INVALID_STATE",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  BROWSER_NOT_FOUND: "BROWSER_NOT_FOUND",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface RpcError {
  code: ErrorCode;
  message: string;
  /** for NOT_IMPLEMENTED: carries the roadmap enforcement flag for feature detection */
  enforcement?: Enforcement;
  issues?: ValidationIssue[];
}

export type RpcResponse<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: RpcError };

export interface ManifestOverrides {
  name?: string;
  color?: string;
  lifetime?: string;
  onExpiry?: "destroy" | "suspend" | "archive";
  aiProvider?: "user-key" | "none";
  /** web store ids the user explicitly consented to declare on the identity */
  consentedExtensionIds?: string[];
}

/**
 * method → params/result map. the runtime dispatches on this; clients get
 * end-to-end types from it.
 */
export interface RpcContract {
  "identity.create": { params: { manifest: IdentityManifest }; result: IdentitySummary };
  "identity.createFromBlueprint": {
    params: { blueprintId: string; overrides?: ManifestOverrides };
    result: IdentitySummary;
  };
  "identity.get": {
    params: { id: string };
    /** manifest is null once the identity is destroyed (only the tombstone remains) */
    result: { summary: IdentitySummary; manifest: IdentityManifest | null };
  };
  "identity.list": {
    params: { filter?: { state?: IdentityState[] } };
    result: IdentitySummary[];
  };
  "identity.launch": {
    params: { id: string };
    result: { pid: number; cdpEndpoint: string | null };
  };
  "identity.suspend": { params: { id: string }; result: null };
  "identity.resume": {
    params: { id: string };
    result: { pid: number; cdpEndpoint: string | null };
  };
  "identity.expire": { params: { id: string }; result: null };
  "identity.destroy": {
    params: { id: string; reason?: string };
    result: DestructionReport;
  };
  "blueprint.validate": {
    params: { manifestJson: string };
    result: { ok: boolean; errors: ValidationIssue[] };
  };
  "blueprint.install": {
    params: { manifestJson: string; source: string };
    result: { blueprintId: string };
  };
  "blueprint.export": { params: { identityId: string }; result: { manifestJson: string } };
  "blueprint.list": { params: Record<string, never>; result: BlueprintSummary[] };
  "activity.read": {
    params: { identityId: string; limit?: number };
    result: ActivityEvent[];
  };
  "runtime.status": { params: Record<string, never>; result: RuntimeStatus };
  "runtime.capabilities": { params: Record<string, never>; result: RuntimeCapabilities };
}

export type RpcMethod = keyof RpcContract;

/**
 * future contract methods, reserved but not implemented in the poc. calling
 * one returns a typed NOT_IMPLEMENTED error carrying enforcement: "roadmap",
 * so sdk consumers feature-detect via runtime.capabilities() instead of
 * try/catch.
 */
export const RESERVED_METHODS = [
  "identity.duplicate",
  "identity.export",
  "identity.attachAgent",
  "identity.attachNetworkRoute",
  "identity.createAlias",
  "identity.mountTool",
  "identity.issueCredential",
  "identity.revokeCredential",
  "provider.list",
  "provider.attach",
  "receipt.verify",
] as const;
