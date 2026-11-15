
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static WORKDIR: Mutex<Option<PathBuf>> = Mutex::new(None);

fn workdir() -> PathBuf {
    WORKDIR.lock().unwrap().clone().unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    })
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")] pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub tool_calls: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")] pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub name: Option<String>,
}

#[tauri::command]
pub async fn chat(
    app: AppHandle,
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    tools: Option<Value>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut body = serde_json::json!({
        "model": model, "messages": messages, "stream": true, "temperature": 0.2,
    });
    if let Some(t) = tools { body["tools"] = t; }
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
    let resp = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}: {}", resp.status(),
            resp.text().await.unwrap_or_default()));
    }

    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buf.find('\n') {
            let line: String = buf.drain(..=pos).collect();
            let line = line.trim();
            if !line.starts_with("data:") { continue; }
            let data = line[5..].trim();
            if data == "[DONE]" { let _ = app.emit("chat-done", ()); return Ok(()); }
            if let Ok(v) = serde_json::from_str::<Value>(data) {
                let _ = app.emit("chat-chunk", v);
            }
        }
    }
    let _ = app.emit("chat-done", ());
    Ok(())
}

fn safe(p: &str) -> Result<PathBuf, String> {
    let root = workdir().canonicalize().map_err(|e| e.to_string())?;
    let path = if Path::new(p).is_absolute() {
        PathBuf::from(p)
    } else {
        root.join(p)
    };
    let path = path.canonicalize().unwrap_or(path);
    if !path.starts_with(&root) {
        return Err(format!("path outside workdir: {}", p));
    }
    Ok(path)
}

#[tauri::command]
pub fn tool_read_file(path: String, offset: Option<usize>, limit: Option<usize>) -> Result<String, String> {
    let p = safe(&path)?;
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let (off, lim) = (offset.unwrap_or(0), limit.unwrap_or(2000));
    Ok(text.lines().skip(off).take(lim)
        .enumerate()
        .map(|(i, l)| format!("{:6}  {}", i + off + 1, l))
        .collect::<Vec<_>>()
        .join("\n"))
}

#[tauri::command]
pub fn tool_write_file(path: String, content: String) -> Result<String, String> {
    let p = safe(&path)?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, &content).map_err(|e| e.to_string())?;
    Ok(format!("Wrote {} bytes to {}", content.len(), path))
}

#[tauri::command]
pub fn tool_edit_file(path: String, old_string: String, new_string: String) -> Result<String, String> {
    let p = safe(&path)?;
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let n = text.matches(&old_string).count();
    if n == 0 { return Err("old_string not found".into()); }
    if n > 1 { return Err(format!("old_string matches {} times", n)); }
    std::fs::write(&p, text.replacen(&old_string, &new_string, 1))
        .map_err(|e| e.to_string())?;
    Ok(format!("Edited {}", path))
}

#[tauri::command]
pub fn tool_list_dir(path: Option<String>) -> Result<String, String> {
    let p = safe(&path.unwrap_or_else(|| ".".into()))?;
    let mut out = vec![];
    for e in std::fs::read_dir(&p).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }
        out.push(format!("{}  {}", if e.path().is_dir() { "d" } else { "f" }, name));
    }
    Ok(out.join("\n"))
}

#[tauri::command]
pub fn tool_bash(command: String) -> Result<String, String> {
    #[cfg(windows)]
    let mut c = { let mut c = std::process::Command::new("cmd");
                  c.args(["/C", command.as_str()]); c };
    #[cfg(not(windows))]
    let mut c = { let mut c = std::process::Command::new("sh");
                  c.args(["-c", command.as_str()]); c };
    let out = c.current_dir(workdir()).output().map_err(|e| e.to_string())?;
    let mut s = String::from_utf8_lossy(&out.stdout).to_string();
    s.push_str(&String::from_utf8_lossy(&out.stderr));
    Ok(if s.is_empty() { format!("(exit {})", out.status.code().unwrap_or(-1)) } else { s })
}

#[tauri::command]
pub fn set_workdir(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path).canonicalize().map_err(|e| e.to_string())?;
    *WORKDIR.lock().unwrap() = Some(p.clone());
    Ok(p.display().to_string())
}

#[tauri::command]
pub fn get_workdir() -> String { workdir().display().to_string() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            chat, tool_read_file, tool_write_file, tool_edit_file,
            tool_list_dir, tool_bash, set_workdir, get_workdir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
