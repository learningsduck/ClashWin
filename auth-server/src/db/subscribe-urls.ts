import type { User } from "./index.js";

export const SUBSCRIBE_BACKUP_SLOTS = 5;

export function parseSubscribeBackups(raw: string | null | undefined): string[] {
  const emptySlots = () => Array.from({ length: SUBSCRIBE_BACKUP_SLOTS }, () => "");
  if (!raw) return emptySlots();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return emptySlots();
    const slots = emptySlots();
    for (let i = 0; i < SUBSCRIBE_BACKUP_SLOTS; i++) {
      const item = parsed[i];
      slots[i] = typeof item === "string" ? item.trim() : "";
    }
    return slots;
  } catch {
    return emptySlots();
  }
}

export function serializeSubscribeBackups(backups: string[]): string {
  const slots = Array.from({ length: SUBSCRIBE_BACKUP_SLOTS }, (_, index) =>
    (backups[index] ?? "").trim(),
  );
  return JSON.stringify(slots);
}

/** 主链接 + 备用链接，去重且保持顺序 */
export function collectUserSubscribeUrls(user: Pick<User, "subscribe_url" | "subscribe_url_backups">): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    urls.push(trimmed);
  };
  add(user.subscribe_url);
  for (const backup of user.subscribe_url_backups) {
    add(backup);
  }
  return urls;
}
