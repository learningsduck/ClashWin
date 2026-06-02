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
  return {
    primary: unique[0] ?? readBuiltinDefaults().primary,
    backups: unique.slice(1),
    updated_at: new Date().toISOString(),
  };
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
  const all = [cfg.primary, ...(cfg.backups ?? [])].map(normalizeAuthBase).filter(Boolean);
  const unique = [...new Set(all)];
  if (lastOk && unique.includes(lastOk)) {
    return [lastOk, ...unique.filter((b) => b !== lastOk)];
  }
  return unique;
}

function isProbeOk(response: Response): boolean {
  return response.ok || response.status === 429;
}

async function probeBase(base: string, signal?: AbortSignal): Promise<boolean> {
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
    return {
      primary: normalizeAuthBase(data.primary),
      backups: (data.backups ?? []).map(normalizeAuthBase).filter(Boolean),
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
