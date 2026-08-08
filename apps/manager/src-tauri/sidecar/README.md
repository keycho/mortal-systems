# sidecar (ci-assembled, never committed)

release ci (.github/workflows/release-macos.yml) assembles the self-contained
runtime here before `tauri build`:

- `node` — the node binary for the target platform/arch
- `runtime/` — `pnpm --filter @mortal/runtime deploy --legacy --prod` output
  (dist + production node_modules, including the platform's better-sqlite3
  binding and the @mortal workspace packages)
- `companion/` — the built extension template (apps/companion/dist)

the shell (src/lib.rs) uses this tree only when the MORTAL_NODE /
MORTAL_RUNTIME_DIR env overrides are absent, so the three-process dev flow is
unchanged. in a dev checkout this directory holds only this README and the
bundler ships it as the sole (harmless) resource.
