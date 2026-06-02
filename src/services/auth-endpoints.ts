/**
 * 认证 API 线路：主备地址、健康探测、失败自动切换。
 * 配置来源（优先级从高到低）：
 * 1. 任意可用线路上的 GET /public/endpoints.json（服务端下发）
 * 2. localStorage 缓存
 * 3. 构建时 VITE_AUTH_API_* 或内置默认值
 */
import { performAuthHttp } from "./auth-http";

export interface EndpointsConfig {
  primary: string;
  backups: string[];
  updated_at?: string;
}

const STORAGE_CONFIG_KEY = "clashwin_auth_endpoints_config_v1";
const STORAGE_LAST_OK_KEY = "clashwin_auth_last_ok_base_v1";

const PROBE_PATH = "/auth/captcha";
const REMOTE_CONFIG_PATH = "/public/endpoints.json";
const PROBE_TIMEOUT_MS = 6000;

function readBuiltinDefaults(): EndpointsConfig {
  let backups: string[] = [];
  const rawBackups = import.meta.env.VITE_AUTH_API_BACKUPS;
  if (typeof rawBackups === "string" && rawBackups.trim()) {
    try {
      const parsed = JSON.parse(rawBackups) as unknown;
      if (Array.isArray(parsed)) {
        backups = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      /* ignore */
    }
  }
  return {
    primary:
      (import.meta.env.VITE_AUTH_API_PRIMARY as string | undefined)?.trim() ||
      "http://127.0.0.1:3001",
    backups,
  };
}

export function normalizeAuthBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function canUseStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function loadStoredConfig(): EndpointsConfig | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EndpointsConfig;
    if (!parsed?.primary || typeof parsed.primary !== "string") return null;
    return {
      primary: normalizeAuthBase(parsed.primary),
      backups: (parsed.backups ?? []).map(normalizeAuthBase).filter(Boolean),
      updated_at: parsed.updated_at,
    };
  } catch {
    return null;
  }
}

function saveStoredConfig(cfg: EndpointsConfig): void {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(cfg));
}

function loadLastOkBase(): string | null {
  if (!canUseStorage()) return null;
  const v = localStorage.getItem(STORAGE_LAST_OK_KEY);
  return v ? normalizeAuthBase(v) : null;
}

function saveLastOkBase(base: string): void {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_LAST_OK_KEY, normalizeAuthBase(base));
}

function mergeConfig(...parts: (EndpointsConfig | null | undefined)[]): EndpointsConfig {
  const bases: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (p.primary) bases.push(normalizeAuthBase(p.primary));
    for (const b of p.backups ?? []) {
      bases.push(normalizeAuthBase(b));
    }
  }
  const unique = [...new Set(bases.filter(Boolean))];
  const sanitized = unique.filter((b) => !isInsecureApiBase(b));
  const ordered = preferHttpsBases(
    sanitized.length ? sanitized : unique.filter((b) => !isLocalDevBase(b)),
  );
  const defaults = readBuiltinDefaults();
  return {
    primary: ordered[0] ?? defaults.primary,
    backups: ordered.slice(1),
    updated_at: new Date().toISOString(),
  };
}

function isLocalDevBase(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** HTTP 直连 Node 端口会触发服务端 REQUIRE_HTTPS */
function isInsecureApiBase(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" && (u.port === "3001" || isLocalDevBase(url))) return true;
    return isLocalDevBase(url);
  } catch {
    return false;
  }
}

/** 公网客户端优先 HTTPS，避免 HTTP 直连 3001 触发服务端 REQUIRE_HTTPS */
function preferHttpsBases(bases: string[]): string[] {
  const https: string[] = [];
  const http: string[] = [];
  for (const b of bases) {
    try {
      if (new URL(b).protocol === "https:") https.push(b);
      else http.push(b);
    } catch {
      http.push(b);
    }
  }
  return [...https, ...http];
}

function upgradeToHttps(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:") return null;
    u.protocol = "https:";
    if (u.port === "3001") u.port = "";
    return normalizeAuthBase(u.toString());
  } catch {
    return null;
  }
}

let endpointsConfig: EndpointsConfig = readBuiltinDefaults();
let activeBaseUrl = normalizeAuthBase(endpointsConfig.primary);
let orderedBases: string[] = [];
let initDone = false;
let initPromise: Promise<void> | null = null;

export function getEndpointsConfig(): EndpointsConfig {
  return endpointsConfig;
}

export function getActiveAuthBaseUrl(): string {
  return activeBaseUrl;
}

export function getOrderedAuthBases(): string[] {
  if (orderedBases.length) return [...orderedBases];
  return buildOrderedBases(endpointsConfig);
}

function buildOrderedBases(cfg: EndpointsConfig): string[] {
  const lastOk = loadLastOkBase();
  const all = preferHttpsBases(
    [cfg.primary, ...(cfg.backups ?? [])].map(normalizeAuthBase).filter(Boolean),
  );
  const unique = [...new Set(all.filter((b) => !isInsecureApiBase(b)))];
  if (lastOk && !isInsecureApiBase(lastOk) && unique.includes(lastOk)) {
    return [lastOk, ...unique.filter((b) => b !== lastOk)];
  }
  return unique;
}

function isProbeOk(response: Response): boolean {
  return response.ok || response.status === 429;
}

async function probeBase(base: string, signal?: AbortSignal): Promise<boolean> {
  if (isInsecureApiBase(base)) return false;
  const url = `${base}${PROBE_PATH}`;
  try {
    const res = await performAuthHttp(url, { method: "GET", signal });
    return isProbeOk(res);
  } catch {
    return false;
  }
}

async function fetchRemoteConfig(base: string): Promise<EndpointsConfig | null> {
  const url = `${base}${REMOTE_CONFIG_PATH}`;
  try {
    const res = await performAuthHttp(url, { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as EndpointsConfig;
    if (!data?.primary) return null;
    let primary = normalizeAuthBase(data.primary);
    if (isLocalDevBase(primary)) {
      const upgraded = upgradeToHttps(base);
      if (upgraded) primary = upgraded;
      else return null;
    } else if (primary.startsWith("http://")) {
      const upgraded = upgradeToHttps(primary);
      if (upgraded) primary = upgraded;
    }
    const backups = (data.backups ?? [])
      .map(normalizeAuthBase)
      .filter(Boolean)
      .filter((b) => !isInsecureApiBase(b))
      .map((b) => upgradeToHttps(b) ?? b)
      .filter((b, i, arr) => arr.indexOf(b) === i);
    return {
      primary,
      backups,
      updated_at: data.updated_at,
    };
  } catch {
    return null;
  }
}

async function pickFirstHealthyBase(bases: string[]): Promise<string | null> {
  for (const base of bases) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      if (await probeBase(base, controller.signal)) {
        return base;
      }
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}

export function setActiveAuthBase(base: string): void {
  activeBaseUrl = normalizeAuthBase(base);
  saveLastOkBase(activeBaseUrl);
  orderedBases = buildOrderedBases(endpointsConfig);
  const rest = orderedBases.filter((b) => b !== activeBaseUrl);
  orderedBases = [activeBaseUrl, ...rest];
}

export function buildAuthUrl(base: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeAuthBase(base)}${p}`;
}

export function rewriteAuthUrl(url: string, newBase: string): string {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}`;
    return buildAuthUrl(newBase, path);
  } catch {
    return url;
  }
}

export function shouldFailoverResponse(response: Response): boolean {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return true;
  }
  return false;
}

export function isHttpsRequiredResponse(response: Response): boolean {
  return response.status === 403;
}

export function tryHttpsUpgradeUrl(url: string): string | null {
  return upgradeToHttps(url);
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    const m = error.message.toLowerCase();
    return (
      m.includes("network") ||
      m.includes("fetch") ||
      m.includes("timeout") ||
      m.includes("connect")
    );
  }
  return false;
}

/**
 * 应用启动时调用：探测可用线路，并从服务端拉取最新 endpoints 配置。
 */
export async function initAuthEndpoints(): Promise<void> {
  if (initDone) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const merged = mergeConfig(readBuiltinDefaults(), loadStoredConfig());
    endpointsConfig = merged;
    orderedBases = buildOrderedBases(merged);

    let picked = await pickFirstHealthyBase(orderedBases);
    if (picked) {
      const remote = await fetchRemoteConfig(picked);
      if (remote) {
        endpointsConfig = mergeConfig(readBuiltinDefaults(), remote);
        saveStoredConfig(endpointsConfig);
        orderedBases = buildOrderedBases(endpointsConfig);
        const repick = await pickFirstHealthyBase(orderedBases);
        if (repick) picked = repick;
      }
    }

    if (picked) {
      setActiveAuthBase(picked);
    } else {
      activeBaseUrl = orderedBases[0] ?? normalizeAuthBase(endpointsConfig.primary);
      console.warn(
        "[auth-endpoints] 所有线路探测失败，仍使用:",
        activeBaseUrl,
        "（请求时将自动重试其他线路）",
      );
    }

    initDone = true;
    console.info("[auth-endpoints] 当前 API:", activeBaseUrl, "候选:", orderedBases.join(", "));
  })();

  return initPromise;
}

export async function refreshAuthEndpointsFromServer(): Promise<boolean> {
  const remote = await fetchRemoteConfig(activeBaseUrl);
  if (!remote) return false;
  endpointsConfig = mergeConfig(readBuiltinDefaults(), remote);
  saveStoredConfig(endpointsConfig);
  orderedBases = buildOrderedBases(endpointsConfig);
  const picked = await pickFirstHealthyBase(orderedBases);
  if (picked) setActiveAuthBase(picked);
  return true;
}
