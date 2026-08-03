// see main.rs for the honest build status of this shell.

use serde_json::Value;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

struct RuntimeHandle {
    child: Mutex<Option<Child>>,
    endpoint: Mutex<Option<(String, String)>>, // (base_url, admin_token)
}

fn liminal_root() -> PathBuf {
    if let Ok(root) = std::env::var("LIMINAL_ROOT") {
        return PathBuf::from(root);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".liminal")
}

/// spawn `node <runtime>/dist/cli.js serve` as the runtime sidecar. the node
/// binary and runtime path come from env in the poc (LIMINAL_NODE,
/// LIMINAL_RUNTIME_DIR); packaging a self-contained sidecar binary is mvp
/// scope.
fn spawn_runtime() -> std::io::Result<Child> {
    let node = std::env::var("LIMINAL_NODE").unwrap_or_else(|_| "node".into());
    let runtime_dir = std::env::var("LIMINAL_RUNTIME_DIR")
        .unwrap_or_else(|_| "../../packages/runtime".into());
    Command::new(node)
        .arg(format!("{runtime_dir}/dist/cli.js"))
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
}

fn read_endpoint() -> Option<(String, String)> {
    let root = liminal_root();
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
    let handle = RuntimeHandle {
        child: Mutex::new(spawn_runtime().ok()),
        endpoint: Mutex::new(None),
    };

    tauri::Builder::default()
        .manage(handle)
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
        .expect("error while running liminal manager");
}
