import { config } from "../config.js";
import * as db from "../db/index.js";

export type RateLimitFail = {
  ok: false;
  code: "TOO_FREQUENT" | "HOURLY_LIMIT" | "DAILY_LIMIT";
  message: string;
  retryAfter?: number;
};

export type RateLimitOk = { ok: true };

export function checkVerificationRateLimit(
  channel: "sms" | "email",
  target: string,
  purpose: string,
  ip?: string,
): RateLimitOk | RateLimitFail {
  const now = Math.floor(Date.now() / 1000);
  const last = db.getLastVerificationSendTime(channel, target);
  if (last != null && now - last < config.verification.sendIntervalSeconds) {
    return {
      ok: false,
      code: "TOO_FREQUENT",
      message: `请 ${config.verification.sendIntervalSeconds - (now - last)} 秒后再试`,
      retryAfter: config.verification.sendIntervalSeconds - (now - last),
    };
  }
  const hourCount = db.countVerificationSends(channel, target, now - 3600);
  if (hourCount >= config.verification.hourlyLimit) {
    return { ok: false, code: "HOURLY_LIMIT", message: "发送过于频繁，请稍后再试" };
  }
  const dayCount = db.countVerificationSends(channel, target, now - 86400);
  if (dayCount >= config.verification.dailyLimit) {
    return { ok: false, code: "DAILY_LIMIT", message: "今日发送次数已达上限" };
  }
  db.logVerificationSend(channel, target, purpose, ip);
  return { ok: true };
}
