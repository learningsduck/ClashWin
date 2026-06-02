import { authFetch } from "./auth-fetch.js";
import { AUTH_ENDPOINTS } from "./auth-config.js";
import { formatAuthErrorMessage } from "./auth-errors.js";

export interface PublicUserPayload {
  id: number;
  phone: string | null;
  email: string | null;
  has_password: boolean;
  email_bound: boolean;
  status: string;
}

export interface LoginResponse {
  access_token: string;
  expires_in: number;
  user: PublicUserPayload;
}

export interface UserInfo {
  id: number;
  phone: string | null;
  email?: string | null;
  has_password?: boolean;
  email_bound?: boolean;
  status?: string;
}

export interface SubscriptionInfo {
  has_subscription: boolean;
  is_active: boolean;
  plan_type: string | null;
  start_at: number | null;
  expire_at: number | null;
  remaining_days: number;
  status: string;
}

export interface AuthError {
  code: string;
  message: string;
}

async function readAuthJson<T>(response: Response): Promise<
  | { ok: true; data: T }
  | { ok: false; code?: string; message: string; status: number }
> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      status: response.status,
      message: formatAuthErrorMessage(undefined, `服务器响应异常 (${response.status})`, response.status),
    };
  }
  if (!response.ok) {
    const err = data as AuthError;
    return {
      ok: false,
      status: response.status,
      code: err?.code,
      message: formatAuthErrorMessage(err?.code, err?.message, response.status),
    };
  }
  return { ok: true, data: data as T };
}

/**
 * 发送短信验证码
 */
export async function sendSmsCode(phone: string): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await authFetch(AUTH_ENDPOINTS.sendSms, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const parsed = await readAuthJson<{ message?: string }>(response);
    if (!parsed.ok) {
      return { success: false, message: parsed.message };
    }
    return { success: true, message: parsed.data.message ?? "验证码已发送" };
  } catch (error: unknown) {
    console.error("[auth-api] sendSmsCode failed:", error);
    return {
      success: false,
      message: formatAuthErrorMessage("NETWORK_ERROR"),
    };
  }
}

/**
 * 手机号 + 验证码登录
 */
export async function loginWithPassword(
  account: string,
  password: string,
  deviceId: string,
): Promise<{ success: boolean; data?: LoginResponse; error?: string; code?: string }> {
  try {
    const response = await authFetch(AUTH_ENDPOINTS.loginPassword, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password, device_id: deviceId }),
    });
    const parsed = await readAuthJson<LoginResponse>(response);
    if (!parsed.ok) {
      return { success: false, error: parsed.message, code: parsed.code };
    }
    return { success: true, data: parsed.data };
  } catch (error: unknown) {
    console.error("[auth-api] loginWithPassword failed:", error);
    return { success: false, error: formatAuthErrorMessage("NETWORK_ERROR") };
  }
}

export async function loginWithSms(
  phone: string,
  code: string,
  deviceId: string,
): Promise<{ success: boolean; data?: LoginResponse; error?: string; code?: string }> {
  try {
    const response = await authFetch(AUTH_ENDPOINTS.loginSms, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, device_id: deviceId }),
    });
    const parsed = await readAuthJson<LoginResponse>(response);
    if (!parsed.ok) {
      return { success: false, error: parsed.message, code: parsed.code };
    }
    return { success: true, data: parsed.data };
  } catch (error: unknown) {
    console.error("[auth-api] loginWithSms failed:", error);
    return { success: false, error: formatAuthErrorMessage("NETWORK_ERROR") };
  }
}

/** 管理员本地登录使用的 token，不请求后端 */
export const ADMIN_LOCAL_TOKEN = "clash_verge_admin_local";

const ADMIN_USER: UserInfo = {
  id: 0,
  phone: "admin",
  email: null,
  has_password: true,
  email_bound: false,
};

export async function sendEmailBindCode(email: string): Promise<{
  success: boolean;
  message?: string;
}> {
  const token = getAuthToken();
  if (!token || token === ADMIN_LOCAL_TOKEN) {
    return { success: false, message: "请先登录" };
  }
  try {
    const response = await authFetch(AUTH_ENDPOINTS.emailSend, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email, purpose: "bind_email" }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: (data as AuthError).message || "发送失败" };
    }
    return { success: true, message: (data as { message?: string }).message };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: msg };
  }
}

export async function bindEmailWithPassword(
  email: string,
  code: string,
  password: string,
  passwordConfirm: string,
): Promise<{ success: boolean; user?: UserInfo; error?: string }> {
  const token = getAuthToken();
  if (!token || token === ADMIN_LOCAL_TOKEN) {
    return { success: false, error: "请先登录" };
  }
  try {
    const response = await authFetch(AUTH_ENDPOINTS.emailBind, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email,
        code,
        password,
        password_confirm: passwordConfirm,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: (data as AuthError).message || "绑定失败" };
    }
    return { success: true, user: (data as { user: UserInfo }).user };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
  newPasswordConfirm: string,
): Promise<{ success: boolean; error?: string }> {
  const token = getAuthToken();
  if (!token || token === ADMIN_LOCAL_TOKEN) {
    return { success: false, error: "请先登录" };
  }
  try {
    const response = await authFetch(AUTH_ENDPOINTS.passwordChange, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: (data as AuthError).message || "修改失败" };
    }
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

/**
 * 校验 token / 获取当前用户（用于自动登录和踢线检测）
 */
export async function getCurrentUser(): Promise<{ success: boolean; user?: UserInfo; error?: string; code?: string }> {
  const token = getAuthToken();
  if (!token) {
    return { success: false, error: "未登录" };
  }
  if (token === ADMIN_LOCAL_TOKEN) {
    return { success: true, user: ADMIN_USER };
  }
  try {
    const response = await authFetch(AUTH_ENDPOINTS.me, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = await readAuthJson<{ user: UserInfo }>(response);
    if (!parsed.ok) {
      if (parsed.code === "SESSION_REPLACED") {
        clearAuthToken();
      } else if (response.status === 401) {
        clearAuthToken();
      }
      return { success: false, error: parsed.message, code: parsed.code };
    }
    return { success: true, user: parsed.data.user };
  } catch (error: unknown) {
    console.error("[auth-api] getCurrentUser failed:", error);
    return { success: false, error: formatAuthErrorMessage("NETWORK_ERROR"), code: "NETWORK_ERROR" };
  }
}

/**
 * 登出
 */
export async function logout(): Promise<void> {
  const token = getAuthToken();
  if (token && token !== ADMIN_LOCAL_TOKEN) {
    try {
      await authFetch(AUTH_ENDPOINTS.logout, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // 忽略登出失败
    }
  }
  clearAuthToken();
}

/**
 * 从 auth-api 导出 logout，供 AuthProvider 使用
 */
export { logout as logoutApi };

/**
 * Token 存储（使用 localStorage，后续可改为 Tauri 安全存储）
 */
const TOKEN_KEY = "clash_verge_auth_token";
const USER_KEY = "clash_verge_auth_user";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string, user?: UserInfo): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): UserInfo | null {
  const stored = localStorage.getItem(USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

/**
 * 获取当前用户的订阅状态
 */
export async function getSubscription(): Promise<{
  success: boolean;
  subscription?: SubscriptionInfo;
  error?: string;
}> {
  const token = getAuthToken();
  if (!token) {
    return { success: false, error: "未登录" };
  }
  if (token === ADMIN_LOCAL_TOKEN) {
    return {
      success: true,
      subscription: {
        has_subscription: true,
        is_active: true,
        plan_type: "unlimited",
        start_at: null,
        expire_at: null,
        remaining_days: 99999,
        status: "active",
      },
    };
  }
  try {
    const response = await authFetch(AUTH_ENDPOINTS.subscription, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      const err = data as AuthError;
      return { success: false, error: err.message || "获取订阅信息失败" };
    }
    return { success: true, subscription: data as SubscriptionInfo };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg || "网络错误" };
  }
}

/**
 * 检查订阅是否有效（用于代理功能拦截）
 */
export interface SubscribeUrlResponse {
  has_url: boolean;
  subscribe_url?: string;
  subscribe_urls?: string[];
}

function normalizeSubscribeUrls(data: SubscribeUrlResponse): string[] {
  if (Array.isArray(data.subscribe_urls) && data.subscribe_urls.length > 0) {
    const seen = new Set<string>();
    return data.subscribe_urls
      .map((url) => url.trim())
      .filter((url) => {
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      });
  }
  const primary = data.subscribe_url?.trim();
  return primary ? [primary] : [];
}

/**
 * 从服务器获取当前账号的全部订阅链接（主链接 + 备用，需有效会员）
 */
export async function fetchSubscribeUrlsFromServer(): Promise<{
  success: boolean;
  subscribe_urls?: string[];
  subscribe_url?: string;
  error?: string;
  code?: string;
}> {
  const token = getAuthToken();
  if (!token) {
    return { success: false, error: "未登录" };
  }
  if (token === ADMIN_LOCAL_TOKEN) {
    return { success: false, error: "管理员账号无云端订阅" };
  }
  try {
    const response = await authFetch(AUTH_ENDPOINTS.subscriptionUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json()) as SubscribeUrlResponse & AuthError;
    if (!response.ok) {
      return {
        success: false,
        error: data.message || "获取订阅链接失败",
        code: data.code,
      };
    }
    const subscribe_urls = normalizeSubscribeUrls(data);
    if (!data.has_url || subscribe_urls.length === 0) {
      return { success: false, error: "暂无订阅链接" };
    }
    return {
      success: true,
      subscribe_urls,
      subscribe_url: subscribe_urls[0],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg || "网络错误" };
  }
}

/** @deprecated 使用 fetchSubscribeUrlsFromServer */
export async function fetchSubscribeUrlFromServer(): Promise<{
  success: boolean;
  subscribe_url?: string;
  error?: string;
  code?: string;
}> {
  const result = await fetchSubscribeUrlsFromServer();
  if (!result.success) {
    return { success: false, error: result.error, code: result.code };
  }
  return {
    success: true,
    subscribe_url: result.subscribe_url,
  };
}

export async function checkSubscriptionValid(): Promise<{
  is_active: boolean;
  expire_at?: number;
  error?: string;
}> {
  const token = getAuthToken();
  if (!token) {
    return { is_active: false, error: "未登录" };
  }
  if (token === ADMIN_LOCAL_TOKEN) {
    return { is_active: true };
  }
  try {
    const response = await authFetch(AUTH_ENDPOINTS.subscriptionCheck, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      return { is_active: false, error: (data as AuthError).message };
    }
    return {
      is_active: (data as { is_active: boolean }).is_active,
      expire_at: (data as { expire_at?: number }).expire_at,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { is_active: false, error: msg || "网络错误" };
  }
}
