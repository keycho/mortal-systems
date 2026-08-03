// side-effect import: wires the chromium launcher into runtime startup
import "./launcher/register.js";

export { LiminalRuntime, registerLauncher, type LauncherApi, type RuntimeOptions } from "./runtime.js";
export { Launcher } from "./launcher/launch.js";
export { discoverBrowsers, discoveryWarnings, majorVersion } from "./launcher/discover.js";
export { provisionIdentity, scrubHistory, hexToSkColor } from "./launcher/provision.js";
export {
  computeUnpackedExtensionId,
  pickCompanionExtensionId,
  type ObservedTarget,
} from "./launcher/extension-id.js";
export { tokenForIdentity, getOrCreateTokenSecret, findIdentityByToken } from "./api/tokens.js";
export { EventBus, type SelfEvent } from "./api/events.js";
export { Scheduler, type SchedulerOptions } from "./scheduler/scheduler.js";
export { BlueprintService, bookmarkFoldersFor } from "./blueprints/pipeline.js";
export { RuntimeError, errors } from "./errors.js";
export { openDb } from "./store/db.js";
export { migrate, MIGRATIONS, type Migration } from "./store/migrations.js";
export { Repo } from "./store/repo.js";
export { IdentityService, summaryFromRow, parseManifestRow } from "./identity/service.js";
export { assertTransition, canTransition, LAUNCHABLE_STATES, LIVE_STATES } from "./identity/state.js";
export { Destroyer, type DestroyPaths, type HaltFn } from "./destroy/destroy.js";
export { resolveRoot, insideRoot, defaultRoot } from "./util/paths.js";
export { RUNTIME_VERSION } from "./version.js";
