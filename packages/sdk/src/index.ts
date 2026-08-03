/**
 * @liminal/sdk — proof-of-concept stub.
 *
 * exports the runtime contract types so sdk consumers can compile against the
 * real api shape today. the typed client implementation (mirroring RpcContract,
 * with capability introspection via runtime.capabilities()) is days 31-60
 * scope and is intentionally not implemented here.
 */
export type {
  ActivityEvent,
  ActivityEventType,
  BlueprintManifest,
  BlueprintSummary,
  DestructionReport,
  DestructionStepResult,
  DestroyStep,
  DetectedBrowser,
  Enforcement,
  ErrorCode,
  IdentityManifest,
  IdentityState,
  IdentitySummary,
  ManifestOverrides,
  RpcContract,
  RpcError,
  RpcMethod,
  RpcResponse,
  RuntimeCapabilities,
  RuntimeStatus,
  Tombstone,
  ValidationIssue,
} from "@liminal/schema";
