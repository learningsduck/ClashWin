use std::collections::HashMap;

use reqwest::Method;
use serde::Serialize;

use super::CmdResult;
use crate::cmd::StringifyErr as _;
use crate::utils::network::{NetworkManager, ProxyType};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthHttpResponse {
    pub status: u16,
    pub body: String,
}

/// 认证 API 请求：强制直连，不走系统/Clash 代理
#[tauri::command]
pub async fn auth_http_fetch(
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> CmdResult<AuthHttpResponse> {
    let client = NetworkManager::new()
        .create_request(ProxyType::None, Some(15), None, false)
        .await
        .stringify_err()?;

    let method = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut request = client.request(method, &url);

    if let Some(map) = headers {
        for (key, value) in map {
            request = request.header(key, value);
        }
    }

    if let Some(payload) = body {
        request = request.body(payload);
    }

    let response = request.send().await.stringify_err()?;
    let status = response.status().as_u16();
    let body = response.text().await.stringify_err()?;

    Ok(AuthHttpResponse { status, body })
}
