/**
 * 认证后端配置（直接连接后端 IP）
 */
/** 使用 127.0.0.1：Tauri 桌面端访问 localhost 在 Windows 上常失败 */
export const AUTH_API_BASE_URL = "http://127.0.0.1:3001";

export const AUTH_ENDPOINTS = {
  sendSms: `${AUTH_API_BASE_URL}/auth/sms/send`,
  loginSms: `${AUTH_API_BASE_URL}/auth/sms/login`,
  /** @deprecated 使用 loginSms */
  login: `${AUTH_API_BASE_URL}/auth/sms/login`,
  loginPassword: `${AUTH_API_BASE_URL}/auth/login`,
  emailSend: `${AUTH_API_BASE_URL}/auth/email/send`,
  emailBind: `${AUTH_API_BASE_URL}/auth/email/bind`,
  passwordChange: `${AUTH_API_BASE_URL}/auth/password/change`,
  me: `${AUTH_API_BASE_URL}/auth/me`,
  logout: `${AUTH_API_BASE_URL}/auth/logout`,
  subscription: `${AUTH_API_BASE_URL}/subscription`,
  subscriptionUrl: `${AUTH_API_BASE_URL}/subscription/url`,
  subscriptionCheck: `${AUTH_API_BASE_URL}/subscription/check`,
  subscriptionHistory: `${AUTH_API_BASE_URL}/subscription/history`,
} as const;
