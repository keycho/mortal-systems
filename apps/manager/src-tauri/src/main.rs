// liminal manager — tauri 2 shell.
//
// STATUS (poc): scaffolded but NOT compiled or run in the linux build
// container (no webkit2gtk). written for the macos poc target; treat as
// unverified until built there. the ui works headlessly today via
// `pnpm dev` (vite + runtime loopback proxy).
//
// responsibilities of this shell, per the architecture:
// - spawn/monitor the @liminal/runtime sidecar (node dist/cli.js serve)
// - read <root>/runtime.json + <root>/admin.token once the sidecar is up
// - broker typed rpc calls from the ui via the `runtime_call` command, so the
//   admin token never enters the webview
// - never render web content; the manager is not a browser

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    liminal_manager_lib::run()
}
