import { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import * as db from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import type { JwtPayload } from "../utils/session-token.js";
import { issueUserToken, toPublicUser } from "../utils/session-token.js";
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  parseAccount,
  validatePasswordStrength,
} from "../utils/identity.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { checkVerificationRateLimit } from "../utils/rate-limit.js";
import { sendSmsCode } from "../services/sms.js";
import { sendEmailCode } from "../services/email.js";

const router: Router = Router();
const { sms: smsConfig, email: emailConfig } = config;

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  return req.socket.remoteAddress;
}

/** 发送短信验证码 */
router.post("/sms/send", (req: Request, res: Response) => {
  const phone = normalizePhone((req.body?.phone as string) ?? "");
  if (!phone || !isValidPhone(phone)) {
    res.status(400).json({ code: "INVALID_PHONE", message: "手机号格式不正确" });
    return;
  }

  const rate = checkVerificationRateLimit("sms", phone, "login", clientIp(req));
  if (!rate.ok) {
    res.status(429).json({ code: rate.code, message: rate.message });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const now = Math.floor(Date.now() / 1000);
  db.saveSmsCode(phone, code, now + smsConfig.codeExpireSeconds);

  sendSmsCode(phone, code).then((result) => {
    if (!result.success) {
      res.status(500).json({ code: "SMS_FAILED", message: result.message ?? "发送失败" });
      return;
    }
    res.json({ success: true, message: "验证码已发送", expireIn: smsConfig.codeExpireSeconds });
  });
});

/** 手机号+验证码登录 */
router.post("/sms/login", (req: Request, res: Response) => {
  const phone = normalizePhone((req.body?.phone as string) ?? "");
  const code = (req.body?.code as string) ?? "";
  const deviceId = (req.body?.device_id as string) ?? "";

  if (!phone || !code) {
    res.status(400).json({ code: "INVALID_INPUT", message: "手机号和验证码不能为空" });
    return;
  }

  const record = db.getLatestSmsCode(phone);
  const now = Math.floor(Date.now() / 1000);
  if (!record || record.expires_at < now) {
    res.status(400).json({ code: "CODE_EXPIRED", message: "验证码已过期，请重新获取" });
    return;
  }
  if (record.code !== code) {
    res.status(400).json({ code: "CODE_INVALID", message: "验证码错误" });
    return;
  }

  const user = db.findOrCreateUser(phone);
  try {
    res.json(issueUserToken(user, deviceId, "sms"));
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    res.status(403).json({ code: err.code ?? "USER_DISABLED", message: err.message ?? "账户已禁用" });
  }
});

/** 手机或邮箱 + 密码登录 */
router.post("/login", async (req: Request, res: Response) => {
  const account = (req.body?.account as string) ?? "";
  const password = (req.body?.password as string) ?? "";
  const deviceId = (req.body?.device_id as string) ?? "";

  if (!account || !password) {
    res.status(400).json({ code: "INVALID_INPUT", message: "账号和密码不能为空" });
    return;
  }

  const parsed = parseAccount(account);
  if (!parsed) {
    res.status(400).json({ code: "INVALID_INPUT", message: "请输入正确的手机号或邮箱" });
    return;
  }

  const user =
    parsed.type === "phone" ? db.findUserByPhone(parsed.value) : db.findUserByEmail(parsed.value);

  if (!user || !user.password_hash) {
    res.status(401).json({ code: "INVALID_CREDENTIALS", message: "账号或密码错误" });
    return;
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    res.status(401).json({ code: "INVALID_CREDENTIALS", message: "账号或密码错误" });
    return;
  }

  try {
    res.json(issueUserToken(user, deviceId, "password"));
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    res.status(403).json({ code: err.code ?? "USER_DISABLED", message: err.message ?? "账户已禁用" });
  }
});

/** 发送邮箱验证码（绑定邮箱） */
router.post("/email/send", authMiddleware, (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  const user = db.findUserById(payload.userId);
  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }
  if (user.email) {
    res.status(409).json({ code: "EMAIL_ALREADY_BOUND", message: "已绑定邮箱" });
    return;
  }

  const email = normalizeEmail((req.body?.email as string) ?? "");
  if (!isValidEmail(email)) {
    res.status(400).json({ code: "INVALID_EMAIL", message: "邮箱格式不正确" });
    return;
  }

  const existing = db.findUserByEmail(email);
  if (existing && existing.id !== user.id) {
    res.status(409).json({ code: "EMAIL_ALREADY_BOUND", message: "该邮箱已被其他账号使用" });
    return;
  }

  const rate = checkVerificationRateLimit("email", email, "bind_email", clientIp(req));
  if (!rate.ok) {
    res.status(429).json({ code: rate.code, message: rate.message });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const now = Math.floor(Date.now() / 1000);
  db.saveEmailCode(email, code, now + emailConfig.codeExpireSeconds, "bind_email");

  sendEmailCode(email, code, "bind_email").then((result) => {
    if (!result.success) {
      res.status(500).json({ code: "EMAIL_FAILED", message: result.message ?? "发送失败" });
      return;
    }
    res.json({ success: true, message: "验证码已发送", expireIn: emailConfig.codeExpireSeconds });
  });
});

/** 绑定邮箱并设置密码 */
router.post("/email/bind", authMiddleware, async (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  const user = db.findUserById(payload.userId);
  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }
  if (user.email) {
    res.status(409).json({ code: "EMAIL_ALREADY_BOUND", message: "已绑定邮箱" });
    return;
  }

  const email = normalizeEmail((req.body?.email as string) ?? "");
  const code = (req.body?.code as string) ?? "";
  const password = (req.body?.password as string) ?? "";
  const passwordConfirm = (req.body?.password_confirm as string) ?? "";

  if (!email || !code || !password) {
    res.status(400).json({ code: "INVALID_INPUT", message: "邮箱、验证码和密码不能为空" });
    return;
  }
  if (password !== passwordConfirm) {
    res.status(400).json({ code: "INVALID_INPUT", message: "两次密码不一致" });
    return;
  }
  const pwdErr = validatePasswordStrength(password);
  if (pwdErr) {
    res.status(400).json({ code: "INVALID_INPUT", message: pwdErr });
    return;
  }

  const record = db.getLatestEmailCode(email, "bind_email");
  const now = Math.floor(Date.now() / 1000);
  if (!record || record.expires_at < now) {
    res.status(400).json({ code: "CODE_EXPIRED", message: "验证码已过期" });
    return;
  }
  if (record.code !== code) {
    res.status(400).json({ code: "CODE_INVALID", message: "验证码错误" });
    return;
  }

  const existing = db.findUserByEmail(email);
  if (existing && existing.id !== user.id) {
    res.status(409).json({ code: "EMAIL_ALREADY_BOUND", message: "该邮箱已被占用" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const updated = db.bindEmailAndPassword(user.id, email, passwordHash);
  if (!updated) {
    res.status(500).json({ code: "INTERNAL", message: "绑定失败" });
    return;
  }

  res.json({ success: true, user: toPublicUser(updated) });
});

/** 修改密码 */
router.post("/password/change", authMiddleware, async (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  const user = db.findUserById(payload.userId);
  if (!user || !user.password_hash) {
    res.status(403).json({ code: "PASSWORD_NOT_SET", message: "尚未设置密码" });
    return;
  }

  const oldPassword = (req.body?.old_password as string) ?? "";
  const newPassword = (req.body?.new_password as string) ?? "";
  const newPasswordConfirm = (req.body?.new_password_confirm as string) ?? "";

  if (!oldPassword || !newPassword) {
    res.status(400).json({ code: "INVALID_INPUT", message: "请填写完整" });
    return;
  }
  if (newPassword !== newPasswordConfirm) {
    res.status(400).json({ code: "INVALID_INPUT", message: "两次新密码不一致" });
    return;
  }
  const pwdErr = validatePasswordStrength(newPassword);
  if (pwdErr) {
    res.status(400).json({ code: "INVALID_INPUT", message: pwdErr });
    return;
  }

  const ok = await verifyPassword(oldPassword, user.password_hash);
  if (!ok) {
    res.status(401).json({ code: "INVALID_CREDENTIALS", message: "原密码错误" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  db.updateUserPassword(user.id, passwordHash);
  res.json({ success: true, message: "密码已更新" });
});

router.get("/me", authMiddleware, (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  const user = db.findUserById(payload.userId);
  if (!user) {
    res.status(401).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }
  res.json({ user: toPublicUser(user) });
});

router.post("/logout", authMiddleware, (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  db.deleteSession(payload.tokenId);
  res.json({ success: true });
});

export default router;
