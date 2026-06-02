import { mutate } from "swr";

import {
  ADMIN_LOCAL_TOKEN,
  fetchSubscribeUrlsFromServer,
  getAuthToken,
  type UserInfo,
} from "@/services/auth-api";
import {
  deleteProfile,
  enhanceProfiles,
  getProfiles,
  importProfile,
  updateProfile,
} from "@/services/cmds";
import { showNotice } from "@/services/notice-service";

import { setCachedSubscribeUrls } from "./subscribe-cache";

const IMPORT_SETTLE_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 本机是否已有远程订阅类配置（type=remote 且带 url） */
export async function hasLocalSubscriptionProfile(): Promise<boolean> {
  try {
    const profiles = await getProfiles();
    const items = profiles?.items ?? [];
    return items.some((item) => item.type === "remote" && Boolean(item.url?.trim()));
  } catch (error) {
    console.warn("[subscribe-sync] getProfiles failed:", error);
    return false;
  }
}

function normalizeSubscribeUrl(url: string): string {
  return url.trim();
}

function normalizeSubscribeUrlList(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    const url = normalizeSubscribeUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function findRemoteProfileByUrl(
  items: IProfileItem[],
  url: string,
): IProfileItem | undefined {
  const target = normalizeSubscribeUrl(url);
  return items.find(
    (p) => p.type === "remote" && normalizeSubscribeUrl(p.url ?? "") === target,
  );
}

/** 删除本机远程订阅中与服务器列表不一致的项 */
async function removeRemoteProfilesNotInServerUrls(
  serverUrls: string[],
): Promise<number> {
  const allowed = new Set(normalizeSubscribeUrlList(serverUrls));
  const profiles = await getProfiles();
  const items = profiles?.items ?? [];
  let removed = 0;

  for (const item of items) {
    if (item.type !== "remote" || !item.uid) continue;
    const url = normalizeSubscribeUrl(item.url ?? "");
    if (!url || allowed.has(url)) continue;
    try {
      await deleteProfile(item.uid);
      removed += 1;
    } catch (err) {
      console.warn("[subscribe-sync] delete stale remote profile failed", item.uid, err);
    }
  }

  if (removed > 0) {
    await mutate("getProfiles");
  }
  return removed;
}

/**
 * 与服务器订阅列表对齐：删除多余远程订阅，补齐缺失并刷新
 */
async function syncSubscribeUrlsWithServer(serverUrls: string[]): Promise<void> {
  const urls = normalizeSubscribeUrlList(serverUrls);
  if (urls.length === 0) return;

  await removeRemoteProfilesNotInServerUrls(urls);

  for (const url of urls) {
    const profiles = await getProfiles();
    const items = profiles?.items ?? [];
    if (findRemoteProfileByUrl(items, url)) {
      await refreshRemoteProfileAfterImport(url);
    } else {
      await importSubscribeUrl(url);
    }
  }

  try {
    await mutate("getProfiles");
    await enhanceProfiles();
  } catch (enhanceErr) {
    console.warn("[subscribe-sync] enhanceProfiles after sync failed", enhanceErr);
  }
}

/** 导入后刷新对应远程订阅，拉取节点并应用到内核 */
async function refreshRemoteProfileAfterImport(url: string): Promise<void> {
  await delay(IMPORT_SETTLE_MS);

  let profiles = await getProfiles();
  let items = profiles?.items ?? [];
  let item = findRemoteProfileByUrl(items, url);

  if (!item) {
    await delay(IMPORT_SETTLE_MS);
    profiles = await getProfiles();
    items = profiles?.items ?? [];
    item = findRemoteProfileByUrl(items, url);
  }

  if (!item) {
    const remotes = items
      .filter((p) => p.type === "remote" && p.url?.trim())
      .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
    item = remotes[0];
  }

  if (!item?.uid) {
    console.warn("[subscribe-sync] no remote profile found to refresh after import");
    return;
  }

  try {
    await updateProfile(item.uid, { with_proxy: true, self_proxy: false });
  } catch (firstErr) {
    console.warn("[subscribe-sync] refresh with_proxy failed, retry self_proxy", firstErr);
    try {
      await updateProfile(item.uid, { with_proxy: false, self_proxy: true });
    } catch (retryErr) {
      console.error("[subscribe-sync] refresh profile failed", retryErr);
      return;
    }
  }

  try {
    await mutate("getProfiles");
    await enhanceProfiles();
  } catch (enhanceErr) {
    console.warn("[subscribe-sync] enhanceProfiles after refresh failed", enhanceErr);
  }
}

async function importSubscribeUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) {
    showNotice.error("profiles.page.feedback.errors.invalidUrl");
    return;
  }
  try {
    await importProfile(url);
    await refreshRemoteProfileAfterImport(url);
  } catch (initialErr) {
    console.warn("[subscribe-sync] import retry with self_proxy", initialErr);
    await importProfile(url, { with_proxy: false, self_proxy: true });
    await refreshRemoteProfileAfterImport(url);
  }
}

/**
 * 登录后：从服务器拉取订阅并与本机远程订阅对齐（删除不匹配项）
 */
export async function ensureSubscribeFromServerIfNoCache(user: UserInfo): Promise<void> {
  if (!user?.id || getAuthToken() === ADMIN_LOCAL_TOKEN) return;

  const hadLocal = await hasLocalSubscriptionProfile();
  const result = await fetchSubscribeUrlsFromServer();
  if (!result.success || !result.subscribe_urls?.length) return;

  setCachedSubscribeUrls(user.id, result.subscribe_urls);
  try {
    await syncSubscribeUrlsWithServer(result.subscribe_urls);
    if (!hadLocal) {
      showNotice.success("shared.feedback.notifications.importSuccess");
    }
  } catch (e) {
    console.error("[subscribe-sync] auto import after login failed", e);
  }
}

/**
 * 「自动读取」：总是请求服务器，更新本地缓存并导入
 */
export async function pullSubscribeFromServerAndImport(user: UserInfo): Promise<void> {
  if (!user?.id) {
    showNotice.error("settings.sections.clash.developer.phoneRequired");
    return;
  }
  if (getAuthToken() === ADMIN_LOCAL_TOKEN) {
    showNotice.error("settings.sections.clash.developer.adminNoCloudSub");
    return;
  }
  const result = await fetchSubscribeUrlsFromServer();
  if (!result.success || !result.subscribe_urls?.length) {
    showNotice.error(result.error || "settings.sections.clash.developer.fetchSubFailed");
    return;
  }
  setCachedSubscribeUrls(user.id, result.subscribe_urls);
  try {
    await syncSubscribeUrlsWithServer(result.subscribe_urls);
    showNotice.success("profiles.page.feedback.notifications.importSuccess");
  } catch (e) {
    showNotice.error(String(e));
  }
}
