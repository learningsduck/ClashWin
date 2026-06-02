/**
 * 认证后端配置（支持主备线路，由 auth-endpoints 管理当前 base URL）
 */
import {
  buildAuthUrl,
  getActiveAuthBaseUrl,
  type EndpointsConfig,
} from "./auth-endpoints";

export type AuthEndpointsMap = {
  sendSms: string;
  loginSms: string;
  login: string;
  loginPassword: string;
  emailSend: string;
  emailBind: string;
  passwordChange: string;
  me: string;
  logout: string;
  subscription: string;
  subscriptionUrl: string;
  subscriptionCheck: string;
  subscriptionHistory: string;
  endpointsConfig: string;
  health: string;
};

function buildEndpointsMap(base: string): AuthEndpointsMap {
  return {
    sendSms: buildAuthUrl(base, "/auth/sms/send"),
    loginSms: buildAuthUrl(base, "/auth/sms/login"),
    login: buildAuthUrl(base, "/auth/sms/login"),
    loginPassword: buildAuthUrl(base, "/auth/login"),
    emailSend: buildAuthUrl(base, "/auth/email/send"),
    emailBind: buildAuthUrl(base, "/auth/email/bind"),
    passwordChange: buildAuthUrl(base, "/auth/password/change"),
    me: buildAuthUrl(base, "/auth/me"),
    logout: buildAuthUrl(base, "/auth/logout"),
    subscription: buildAuthUrl(base, "/subscription"),
    subscriptionUrl: buildAuthUrl(base, "/subscription/url"),
    subscriptionCheck: buildAuthUrl(base, "/subscription/check"),
    subscriptionHistory: buildAuthUrl(base, "/subscription/history"),
    endpointsConfig: buildAuthUrl(base, "/public/endpoints.json"),
    health: buildAuthUrl(base, "/health"),
  };
}

/** @deprecated 请用 getAuthApiBaseUrl()，值随线路切换变化 */
export function getAuthApiBaseUrl(): string {
  return getActiveAuthBaseUrl();
}

export const AUTH_API_BASE_URL = new Proxy({} as { valueOf(): string; toString(): string }, {
  get() {
    return getActiveAuthBaseUrl();
  },
}) as unknown as string;

export const AUTH_ENDPOINTS = new Proxy({} as AuthEndpointsMap, {
  get(_target, prop: string) {
    const map = buildEndpointsMap(getActiveAuthBaseUrl());
    if (prop in map) {
      return map[prop as keyof AuthEndpointsMap];
    }
    return undefined;
  },
});

export type { EndpointsConfig };
