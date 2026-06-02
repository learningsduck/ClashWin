import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import {
  getOrderedAuthBases,
  isNetworkError,
  rewriteAuthUrl,
  setActiveAuthBase,
  shouldFailoverResponse,
} from "./auth-endpoints";
import { performAuthHttp } from "./auth-http";

/**
 * 认证 API 请求：当前线路失败时自动尝试 backups 中的其他 API 地址。
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const bases = getOrderedAuthBases();
  if (!bases.length) {
    return performAuthHttp(url, init);
  }

  let lastResponse: Response | null = null;
  let lastError: unknown;

  for (const base of bases) {
    const targetUrl = rewriteAuthUrl(url, base);
    try {
      const response = await performAuthHttp(targetUrl, init);
      if (shouldFailoverResponse(response)) {
        lastResponse = response;
        continue;
      }
      setActiveAuthBase(base);
      return response;
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error)) {
        throw error;
      }
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new TypeError("无法连接认证 API，请检查网络或稍后重试");
}

/** 非认证请求仍可用 Tauri fetch（保持原行为） */
export { tauriFetch };
