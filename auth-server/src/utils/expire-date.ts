/** 将 YYYY-MM-DD 或 Unix 秒/毫秒解析为当日 23:59:59（本地时区）的 Unix 秒 */
export function parseExpireDateInput(input: string | number | undefined): number | null {
  if (input === undefined || input === null || input === "") return null;

  if (typeof input === "number" && Number.isFinite(input)) {
    const sec = input > 1e12 ? Math.floor(input / 1000) : Math.floor(input);
    return sec > 0 ? sec : null;
  }

  const str = String(input).trim();
  if (!str) return null;

  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    const sec = n > 1e12 ? Math.floor(n / 1000) : n;
    return sec > 0 ? sec : null;
  }

  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  const endOfDay = new Date(year, month, day, 23, 59, 59, 999);
  if (Number.isNaN(endOfDay.getTime())) return null;
  return Math.floor(endOfDay.getTime() / 1000);
}

export function formatExpireDateInputValue(expireAt: number): string {
  const d = new Date(expireAt * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatExpireDateDisplay(expireAt: number): string {
  return new Date(expireAt * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
