const CACHE_PREFIX = "clash_verge_subscribe_url_cache:";

export function subscribeUrlCacheKey(userId: number): string {
  return `${CACHE_PREFIX}${userId}`;
}

/** @deprecated 使用 subscribeUrlCacheKey(userId) */
export function subscribeUrlCacheKeyByPhone(phone: string): string {
  return `${CACHE_PREFIX}phone:${phone}`;
}

function parseCachedUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  } catch {
    // 旧版仅存单个 URL 字符串
  }
  const trimmed = raw.trim();
  return trimmed ? [trimmed] : [];
}

export function getCachedSubscribeUrls(
  userId: number,
  phone?: string | null,
): string[] {
  const byId = parseCachedUrls(localStorage.getItem(subscribeUrlCacheKey(userId)));
  if (byId.length > 0) return byId;
  if (phone) {
    const legacy = parseCachedUrls(
      localStorage.getItem(subscribeUrlCacheKeyByPhone(phone)),
    );
    if (legacy.length > 0) {
      setCachedSubscribeUrls(userId, legacy);
      return legacy;
    }
  }
  return [];
}

/** @deprecated 使用 getCachedSubscribeUrls */
export function getCachedSubscribeUrl(
  userId: number,
  phone?: string | null,
): string | null {
  const urls = getCachedSubscribeUrls(userId, phone);
  return urls[0] ?? null;
}

export function setCachedSubscribeUrls(userId: number, urls: string[]): void {
  const normalized = urls
    .map((url) => url.trim())
    .filter(Boolean)
    .filter((url, index, arr) => arr.indexOf(url) === index);
  if (normalized.length === 0) {
    localStorage.removeItem(subscribeUrlCacheKey(userId));
    return;
  }
  localStorage.setItem(subscribeUrlCacheKey(userId), JSON.stringify(normalized));
}

/** @deprecated 使用 setCachedSubscribeUrls */
export function setCachedSubscribeUrl(userId: number, url: string): void {
  setCachedSubscribeUrls(userId, [url]);
}
