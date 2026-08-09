// see main.rs for the honest build status of this shell.

use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

/// what actually happened to the sidecar, so a packaged app can say why it
/// has no runtime instead of blaming the user's missing dev environment.
#[derive(Clone, Default, Serialize)]
struct SidecarDiag {
    /// "bundled" | "bundled-system-node" | "dev-fallback" | "env-override"
    mode: String,
    node: Option<String>,
    cli: Option<String>,
    log: Option<String>,
    #[serde(rename = "spawnError")]
    spawn_error: Option<String>,
    #[serde(rename = "quarantineCleared")]
    quarantine_cleared: bool,
    /// set when the process started and then died
    exited: Option<String>,
}

struct RuntimeHandle {
    child: Mutex<Option<Child>>,
    endpoint: Mutex<Option<(String, String)>>, // (base_url, admin_token)
    diag: Mutex<SidecarDiag>,
    /// set once the webview has actually completed a call through this shell
    bridged: Mutex<bool>,
}

/// record, once, that the window reached the runtime through the ipc bridge.
///
/// this exists because a healthy runtime and a working app are different
/// claims: a csp that forbids tauri's ipc transport leaves the runtime
/// perfectly up and the window unable to speak to it. the marker is the
/// difference, observable from outside the app — release ci asserts it, and
/// it answers "did the ui ever connect?" in a support thread.
fn mark_bridged(state: &tauri::State<'_, RuntimeHandle>, method: &str) {
    let Ok(mut done) = state.bridged.lock() else {
        return;
    };
    if *done {
        return;
    }
    *done = true;
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let root = mortal_root();
    let _ = std::fs::write(
        root.join("ui-bridge.json"),
        serde_json::json!({ "ok": true, "method": method, "at": at }).to_string(),
    );
}

fn mortal_root() -> PathBuf {
    if let Ok(root) = std::env::var("MORTAL_ROOT") {
        return PathBuf::from(root);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".mortal")
}

/// the ci-assembled self-contained sidecar under Resources/sidecar:
/// `node` (executable), `runtime/dist/cli.js` (+ its node_modules from
/// `pnpm deploy`), and `companion/` (the built extension template).
fn bundled_sidecar(app: &tauri::AppHandle) -> Option<(PathBuf, PathBuf, PathBuf, PathBuf)> {
    let base = app.path().resource_dir().ok()?.join("sidecar");
    let node = base.join("node");
    let cli = base.join("runtime").join("dist").join("cli.js");
    let companion = base.join("companion");
    if node.is_file() && cli.is_file() {
        Some((node, cli, companion, base))
    } else {
        None
    }
}

/// a .dmg downloaded through a browser carries com.apple.quarantine on every
/// nested file. approving the app itself does not always clear it from the
/// helpers inside, and gatekeeper then refuses to exec the bundled node —
/// which looks, from the ui, exactly like "no runtime". clearing it on our
/// own bundle is the documented recovery.
#[cfg(target_os = "macos")]
fn clear_quarantine(dir: &PathBuf) -> bool {
    Command::new("/usr/bin/xattr")
        .arg("-dr")
        .arg("com.apple.quarantine")
        .arg(dir)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn clear_quarantine(_dir: &PathBuf) -> bool {
    false
}

fn try_spawn(
    node: &PathBuf,
    cli: &PathBuf,
    companion: Option<&PathBuf>,
    root: &PathBuf,
    seed: bool,
) -> std::io::Result<Child> {
    let mut cmd = Command::new(node);
    cmd.arg(cli).arg("serve");
    if seed {
        cmd.arg("--seed-first-party");
    }
    if let Some(dir) = companion {
        if dir.is_dir() {
            cmd.env("MORTAL_COMPANION_TEMPLATE", dir);
        }
    }
    cmd.stdout(sidecar_log(root)).stderr(sidecar_log(root));
    cmd.spawn()
}

fn sidecar_log(root: &PathBuf) -> Stdio {
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join("sidecar.log"))
        .map(Stdio::from)
        .unwrap_or_else(|_| Stdio::null())
}

/// spawn the runtime sidecar. env overrides (MORTAL_NODE, MORTAL_RUNTIME_DIR)
/// keep the dev flow exactly as before; without them the bundled
/// Resources/sidecar tree is used when present, falling back to the
/// monorepo-relative dev default.
fn spawn_runtime(app: &tauri::AppHandle) -> (Option<Child>, SidecarDiag) {
    let root = mortal_root();
    let _ = std::fs::create_dir_all(&root);
    let mut diag = SidecarDiag {
        log: Some(root.join("sidecar.log").to_string_lossy().into_owned()),
        ..Default::default()
    };

    let node_env = std::env::var("MORTAL_NODE").ok();
    let dir_env = std::env::var("MORTAL_RUNTIME_DIR").ok();

    if node_env.is_none() && dir_env.is_none() {
        if let Some((node, cli, companion, base)) = bundled_sidecar(app) {
            diag.mode = "bundled".into();
            diag.node = Some(node.to_string_lossy().into_owned());
            diag.cli = Some(cli.to_string_lossy().into_owned());
            match try_spawn(&node, &cli, Some(&companion), &root, true) {
                Ok(child) => return (Some(child), diag),
                Err(err) => {
                    diag.spawn_error = Some(err.to_string());
                    if clear_quarantine(&base) {
                        diag.quarantine_cleared = true;
                        if let Ok(child) = try_spawn(&node, &cli, Some(&companion), &root, true) {
                            diag.spawn_error = None;
                            return (Some(child), diag);
                        }
                    }
                    // last resort: the user's own node, running our bundled
                    // runtime code. better a working app than a pure one.
                    if let Ok(child) =
                        try_spawn(&PathBuf::from("node"), &cli, Some(&companion), &root, true)
                    {
                        diag.mode = "bundled-system-node".into();
                        diag.spawn_error = None;
                        return (Some(child), diag);
                    }
                    return (None, diag);
                }
            }
        }
        diag.mode = "dev-fallback".into();
    } else {
        diag.mode = "env-override".into();
    }

    let node = node_env.unwrap_or_else(|| "node".into());
    let runtime_dir = dir_env.unwrap_or_else(|| "../../packages/runtime".into());
    let cli = PathBuf::from(format!("{runtime_dir}/dist/cli.js"));
    diag.node = Some(node.clone());
    diag.cli = Some(cli.to_string_lossy().into_owned());
    match Command::new(&node)
        .arg(&cli)
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
    {
        Ok(child) => (Some(child), diag),
        Err(err) => {
            diag.spawn_error = Some(err.to_string());
            (None, diag)
        }
    }
}

fn read_endpoint() -> Option<(String, String)> {
    let root = mortal_root();
    let meta: Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("runtime.json")).ok()?).ok()?;
    let token: Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("admin.token")).ok()?).ok()?;
    let port = meta.get("port")?.as_u64()?;
    let tok = token.get("token")?.as_str()?.to_string();
    Some((format!("http://127.0.0.1:{port}"), tok))
}

#[tauri::command]
async fn runtime_call(
    state: tauri::State<'_, RuntimeHandle>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let endpoint = {
        let mut guard = state.endpoint.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            *guard = read_endpoint();
        }
        guard.clone()
    };
    let (base, token) = endpoint.ok_or_else(|| {
        "the local runtime has not published its endpoint yet".to_string()
    })?;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/v1/rpc"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "method": &method, "params": params }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let body = res.json::<Value>().await.map_err(|e| e.to_string())?;
    mark_bridged(&state, &method);
    Ok(body)
}

/// what the ui shows when it cannot reach the runtime. reports the real
/// cause — a failed spawn, or a process that started and died — instead of
/// leaving the window to guess.
#[tauri::command]
fn runtime_diagnostics(state: tauri::State<'_, RuntimeHandle>) -> Result<SidecarDiag, String> {
    let mut diag = state.diag.lock().map_err(|e| e.to_string())?.clone();
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    match guard.as_mut() {
        Some(child) => {
            if let Ok(Some(status)) = child.try_wait() {
                diag.exited = Some(status.to_string());
            }
        }
        None => {
            if diag.spawn_error.is_none() {
                diag.spawn_error = Some("the runtime process is not running".into());
            }
        }
    }
    Ok(diag)
}

/// user-triggered recovery: kill whatever is left, forget the cached
/// endpoint, and start the runtime again.
#[tauri::command]
fn runtime_restart(
    app: tauri::AppHandle,
    state: tauri::State<'_, RuntimeHandle>,
) -> Result<SidecarDiag, String> {
    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }
    {
        let mut endpoint = state.endpoint.lock().map_err(|e| e.to_string())?;
        *endpoint = None;
    }
    let (child, diag) = spawn_runtime(&app);
    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = child;
    }
    {
        let mut stored = state.diag.lock().map_err(|e| e.to_string())?;
        *stored = diag.clone();
    }
    Ok(diag)
}

pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeHandle {
            child: Mutex::new(None),
            endpoint: Mutex::new(None),
            diag: Mutex::new(SidecarDiag::default()),
            bridged: Mutex::new(false),
        })
        .setup(|app| {
            let (child, diag) = spawn_runtime(app.handle());
            let state = app.state::<RuntimeHandle>();
            if let Ok(mut guard) = state.child.lock() {
                *guard = child;
            }
            if let Ok(mut stored) = state.diag.lock() {
                *stored = diag;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_call,
            runtime_diagnostics,
            runtime_restart
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state: tauri::State<RuntimeHandle> = window.state();
                // bound as a local so the guard drops before `state`
                // (E0597 otherwise: the lock temporary outlives the borrow)
                let guard = state.child.lock();
                if let Ok(mut child) = guard {
                    if let Some(c) = child.as_mut() {
                        let _ = c.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running mortal manager");
}
