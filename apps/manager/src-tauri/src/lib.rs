// see main.rs for the honest build status of this shell.

use serde_json::Value;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

struct RuntimeHandle {
    child: Mutex<Option<Child>>,
    endpoint: Mutex<Option<(String, String)>>, // (base_url, admin_token)
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
fn bundled_sidecar(app: &tauri::AppHandle) -> Option<(PathBuf, PathBuf, PathBuf)> {
    let base = app.path().resource_dir().ok()?.join("sidecar");
    let node = base.join("node");
    let cli = base.join("runtime").join("dist").join("cli.js");
    let companion = base.join("companion");
    if node.is_file() && cli.is_file() {
        Some((node, cli, companion))
    } else {
        None
    }
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
fn spawn_runtime(app: &tauri::AppHandle) -> std::io::Result<Child> {
    let node_env = std::env::var("MORTAL_NODE").ok();
    let dir_env = std::env::var("MORTAL_RUNTIME_DIR").ok();

    if node_env.is_none() && dir_env.is_none() {
        if let Some((node, cli, companion)) = bundled_sidecar(app) {
            let root = mortal_root();
            let _ = std::fs::create_dir_all(&root);
            let mut cmd = Command::new(node);
            cmd.arg(cli).arg("serve").arg("--seed-first-party");
            if companion.is_dir() {
                cmd.env("MORTAL_COMPANION_TEMPLATE", &companion);
            }
            cmd.stdout(sidecar_log(&root)).stderr(sidecar_log(&root));
            return cmd.spawn();
        }
    }

    let node = node_env.unwrap_or_else(|| "node".into());
    let runtime_dir = dir_env.unwrap_or_else(|| "../../packages/runtime".into());
    Command::new(node)
        .arg(format!("{runtime_dir}/dist/cli.js"))
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
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
        "runtime endpoint not available yet (is the sidecar up?)".to_string()
    })?;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/v1/rpc"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "method": method, "params": params }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json::<Value>().await.map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeHandle {
            child: Mutex::new(None),
            endpoint: Mutex::new(None),
        })
        .setup(|app| {
            let child = spawn_runtime(app.handle()).ok();
            if let Ok(mut guard) = app.state::<RuntimeHandle>().child.lock() {
                *guard = child;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![runtime_call])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state: tauri::State<RuntimeHandle> = window.state();
                if let Ok(mut child) = state.child.lock() {
                    if let Some(c) = child.as_mut() {
                        let _ = c.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running mortal manager");
}
