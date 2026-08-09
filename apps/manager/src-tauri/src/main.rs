// mortal manager — tauri 2 shell.
//
// STATUS: compiled and launch-smoked by release ci (release-macos.yml) on the
// macos runner — the smoke asserts the bundled sidecar boots, /v1/health
// answers, and the app process stays up. still never compiled in the linux
// dev container (no webkit2gtk). windowed human verification stays a founder
// action. the ui also works headlessly via `pnpm dev` (vite + runtime
// loopback proxy).
//
// the csp in tauri.conf.json MUST keep `connect-src ipc: http://ipc.localhost`.
// invoke() is a fetch to the ipc scheme, so without it the webview blocks
// every runtime_call and the window reports the runtime unreachable while the
// runtime is perfectly healthy. (that config is json: it cannot carry this
// comment itself, and its schema rejects unknown keys.) release ci gates on it.
//
// responsibilities of this shell, per the architecture:
// - spawn/monitor the @mortal/runtime sidecar (node dist/cli.js serve)
// - read <root>/runtime.json + <root>/admin.token once the sidecar is up
// - broker typed rpc calls from the ui via the `runtime_call` command, so the
//   admin token never enters the webview
// - never render web content; the manager is not a browser

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mortal_manager_lib::run()
}
