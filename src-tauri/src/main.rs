// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct BundlePayload {
    version: String,
    #[serde(rename = "profileId")]
    profile_id: String,
    name: String,
    #[serde(rename = "startUrl")]
    start_url: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    #[serde(rename = "cookieCount")]
    cookie_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct ActivityLogRequest {
    #[serde(rename = "postUrl")]
    post_url: String,
    action: String,
    note: String,
    #[serde(rename = "accountName")]
    account_name: String,
    #[serde(rename = "profileId")]
    profile_id: String,
}

// Command: Fetch profiles from DashBrowser Central Server
#[tauri::command]
async fn fetch_server_profiles(server_url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/profiles", server_url.trim_end_matches('/'));
    
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Gagal menghubungi server: {}", e))?;
        
    let data: serde_json::Value = res.json()
        .await
        .map_err(|e| format!("Format respons tidak valid: {}", e))?;
        
    Ok(data)
}

// Command: Fetch 3-Hour Bundle for local execution
#[tauri::command]
async fn fetch_bundle(server_url: String, profile_id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/profiles/{}/bundle", server_url.trim_end_matches('/'), profile_id);
    
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Gagal mengambil bundle: {}", e))?;
        
    let data: serde_json::Value = res.json()
        .await
        .map_err(|e| format!("Format bundle tidak valid: {}", e))?;
        
    Ok(data)
}

// Command: Submit completed task log back to Central Server
#[tauri::command]
async fn submit_activity_log(server_url: String, log: ActivityLogRequest) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/logs", server_url.trim_end_matches('/'));
    
    let res = client.post(&url)
        .json(&log)
        .send()
        .await
        .map_err(|e| format!("Gagal mengirim laporan ke server: {}", e))?;
        
    let data: serde_json::Value = res.json()
        .await
        .map_err(|e| format!("Format respons laporan tidak valid: {}", e))?;
        
    Ok(data)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fetch_server_profiles,
            fetch_bundle,
            submit_activity_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
