/** 规范化大陆手机号 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

/** 规范化邮箱 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 判断 account 是手机还是邮箱 */
export function parseAccount(account: string): { type: "phone" | "email"; value: string } | null {
  const trimmed = account.trim();
  if (!trimmed) return null;
  const phone = normalizePhone(trimmed);
  if (isValidPhone(phone)) return { type: "phone", value: phone };
  const email = normalizeEmail(trimmed);
  if (isValidEmail(email)) return { type: "email", value: email };
  return null;
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8 || password.length > 64) {
    return "密码长度需为 8–64 位";
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "密码需同时包含字母和数字";
  }
  return null;
}
