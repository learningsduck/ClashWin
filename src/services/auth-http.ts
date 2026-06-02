import { invoke } from "@tauri-apps/api/core";

export interface AuthHttpResponse {
  status: number;
  body: string;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      out[key] = value;
    }
    return out;
  }
  return { ...headers };
}

/**
 * 单次 HTTP 请求（无线路切换）。桌面端走 Rust 直连，绕过系统/Clash 代理。
 */
export async function performAuthHttp(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!isTauriRuntime()) {
    return globalThis.fetch(url, init);
  }

  const method = (init?.method ?? "GET").toUpperCase();
  let body: string | undefined;
  if (typeof init?.body === "string") {
    body = init.body;
  } else if (init?.body != null) {
    body = JSON.stringify(init.body);
  }

  const result = await invoke<AuthHttpResponse>("auth_http_fetch", {
    method,
    url,
    headers: headersToRecord(init?.headers),
    body: body ?? null,
  });

  return new Response(result.body, {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
