import { registerLauncher } from "../runtime.js";
import { Launcher } from "./launch.js";

// importing this module wires the chromium launcher into runtime startup
registerLauncher((runtime) => new Launcher(runtime));
