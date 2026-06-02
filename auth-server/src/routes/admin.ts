import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import * as db from "../db/index.js";
import { adminAuthMiddleware, type AdminJwtPayload } from "../middleware/admin-auth.js";
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  validatePasswordStrength,
} from "../utils/identity.js";
import { hashPassword } from "../utils/password.js";
import { toPublicUser } from "../utils/session-token.js";
import * as poolDb from "../db/subscription-pool.js";
import {
  formatExpireDateDisplay,
  parseExpireDateInput,
} from "../utils/expire-date.js";

const router: Router = Router();

function isValidSubscribeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function parsePoolBody(body: {
  name?: string;
  subscribe_url?: string;
  subscribe_url_backups?: unknown;
  expire_at?: string | number;
}): { name: string; subscribe_url: string; backups: string[]; expire_at: number } | null {
  const name = body.name?.trim();
  const subscribe_url = body.subscribe_url?.trim();
  if (!name) return null;
  if (!subscribe_url || !isValidSubscribeUrl(subscribe_url)) return null;
  const expire_at = parseExpireDateInput(body.expire_at);
  if (expire_at === null) return null;
  return {
    name,
    subscribe_url,
    backups: poolDb.normalizePoolBackupsInput(body.subscribe_url_backups),
    expire_at,
  };
}

router.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ code: "INVALID_INPUT", message: "用户名和密码不能为空" });
    return;
  }

  const admin = db.findAdminByUsername(username);
  if (!admin) {
    res.status(401).json({ code: "INVALID_CREDENTIALS", message: "用户名或密码错误" });
    return;
  }

  const isValid = await bcrypt.compare(password, admin.password_hash);
  if (!isValid) {
    res.status(401).json({ code: "INVALID_CREDENTIALS", message: "用户名或密码错误" });
    return;
  }

  const payload = {
    type: "admin",
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
  };

  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: "24h",
  });

  res.json({
    access_token: token,
    expires_in: 86400,
    admin: {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    },
  });
});

router.get("/me", adminAuthMiddleware, (req: Request, res: Response) => {
  const admin = (req as Request & { admin: AdminJwtPayload }).admin;
  res.json({
    admin: {
      id: admin.adminId,
      username: admin.username,
      role: admin.role,
    },
  });
});

router.get("/stats", adminAuthMiddleware, (_req: Request, res: Response) => {
  const now = Math.floor(Date.now() / 1000);
  res.json({
    total_users: db.getUserCount(),
    active_subscriptions: db.countActiveSubscriptions(now),
    subscription_pool_count: poolDb.countSubscriptionPool(),
  });
});

/** 订阅汇总列表 */
router.get("/subscription-pool", adminAuthMiddleware, (_req: Request, res: Response) => {
  const items = poolDb.listSubscriptionPool().map((item) => ({
    ...item,
    backup_count: item.subscribe_url_backups.filter(Boolean).length,
  }));
  res.json({ items, total: items.length });
});

router.post("/subscription-pool", adminAuthMiddleware, (req: Request, res: Response) => {
  try {
    const admin = (req as Request & { admin: AdminJwtPayload }).admin;
    const parsed = parsePoolBody(req.body as Parameters<typeof parsePoolBody>[0]);
    if (!parsed) {
      res.status(400).json({
        code: "INVALID_INPUT",
        message: "请填写备注名称、有效订阅链接（http/https）及到期日",
      });
      return;
    }

    const item = poolDb.createSubscriptionPoolItem({
      name: parsed.name,
      subscribe_url: parsed.subscribe_url,
      subscribe_url_backups: parsed.backups,
      expire_at: parsed.expire_at,
      created_by_admin_id: admin.adminId,
    });

    res.status(201).json({
      success: true,
      message: `已添加订阅「${item.name}」`,
      item,
    });
  } catch (err) {
    console.error("[admin] create subscription-pool failed:", err);
    res.status(500).json({
      code: "SERVER_ERROR",
      message: err instanceof Error ? err.message : "保存订阅失败",
    });
  }
});

router.patch("/subscription-pool/:id", adminAuthMiddleware, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ code: "INVALID_INPUT", message: "无效的订阅 ID" });
      return;
    }

    const parsed = parsePoolBody(req.body as Parameters<typeof parsePoolBody>[0]);
    if (!parsed) {
      res.status(400).json({
        code: "INVALID_INPUT",
        message: "请填写备注名称、有效订阅链接及到期日",
      });
      return;
    }

    const item = poolDb.updateSubscriptionPoolItem(id, {
      name: parsed.name,
      subscribe_url: parsed.subscribe_url,
      subscribe_url_backups: parsed.backups,
      expire_at: parsed.expire_at,
    });

    if (!item) {
      res.status(404).json({ code: "NOT_FOUND", message: "订阅不存在" });
      return;
    }

    res.json({ success: true, message: `已更新订阅「${item.name}」`, item });
  } catch (err) {
    console.error("[admin] update subscription-pool failed:", err);
    res.status(500).json({
      code: "SERVER_ERROR",
      message: err instanceof Error ? err.message : "更新订阅失败",
    });
  }
});

router.delete("/subscription-pool/:id", adminAuthMiddleware, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ code: "INVALID_INPUT", message: "无效的订阅 ID" });
    return;
  }

  const existing = poolDb.findSubscriptionPoolById(id);
  if (!existing) {
    res.status(404).json({ code: "NOT_FOUND", message: "订阅不存在" });
    return;
  }

  poolDb.deleteSubscriptionPoolItem(id);
  res.json({ success: true, message: `已删除订阅「${existing.name}」` });
});

/** 将汇总订阅分配给用户（写入链接 + 会员到期日设为套餐到期日） */
router.post("/subscription-pool/:id/assign", adminAuthMiddleware, (req: Request, res: Response) => {
  const admin = (req as Request & { admin: AdminJwtPayload }).admin;
  const poolId = parseInt(req.params.id, 10);
  const { user_id } = req.body as { user_id?: number };

  if (!Number.isFinite(poolId)) {
    res.status(400).json({ code: "INVALID_INPUT", message: "无效的订阅 ID" });
    return;
  }
  if (!user_id) {
    res.status(400).json({ code: "INVALID_INPUT", message: "请指定用户 ID" });
    return;
  }

  const pool = poolDb.findSubscriptionPoolById(poolId);
  if (!pool) {
    res.status(404).json({ code: "NOT_FOUND", message: "订阅不存在" });
    return;
  }

  const user = db.findUserById(user_id);
  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }

  db.setUserSubscribeUrls(user_id, pool.subscribe_url, pool.subscribe_url_backups);
  const subscription = db.setUserSubscriptionExpireAt(user_id, pool.expire_at);

  const now = Math.floor(Date.now() / 1000);
  const daysForLog = Math.max(
    0,
    Math.ceil((pool.expire_at - now) / (24 * 60 * 60)),
  );
  const expireLabel = formatExpireDateDisplay(pool.expire_at);
  db.createRechargeLog(
    user_id,
    admin.adminId,
    daysForLog,
    0,
    `订阅汇总分配：${pool.name}，到期 ${expireLabel}`,
  );

  const updated = db.findUserById(user_id)!;

  res.json({
    success: true,
    message: `已将「${pool.name}」分配给用户 ${user.phone || user.email || user.id}，会员到期日：${expireLabel}`,
    user: {
      id: updated.id,
      phone: updated.phone,
      email: updated.email,
      subscribe_url: updated.subscribe_url,
      subscribe_url_backups: updated.subscribe_url_backups,
    },
    subscription: {
      expire_at: subscription.expire_at,
      remaining_days: Math.max(0, Math.ceil((subscription.expire_at - now) / (24 * 60 * 60))),
    },
  });
});

/** 管理员添加用户：手机号/邮箱至少一项 + 登录密码 */
router.post("/users", adminAuthMiddleware, async (req: Request, res: Response) => {
  const { phone, email, password, password_confirm } = req.body as {
    phone?: string;
    email?: string;
    password?: string;
    password_confirm?: string;
  };

  const phoneRaw = (phone ?? "").trim();
  const emailRaw = (email ?? "").trim();
  const phoneNorm = phoneRaw ? normalizePhone(phoneRaw) : null;
  const emailNorm = emailRaw ? normalizeEmail(emailRaw) : null;

  if (!phoneNorm && !emailNorm) {
    res.status(400).json({ code: "INVALID_INPUT", message: "手机号和邮箱至少填写一项" });
    return;
  }
  if (!password) {
    res.status(400).json({ code: "INVALID_INPUT", message: "登录密码不能为空" });
    return;
  }
  if (phoneNorm && !isValidPhone(phoneNorm)) {
    res.status(400).json({ code: "INVALID_PHONE", message: "手机号格式不正确" });
    return;
  }
  if (emailNorm && !isValidEmail(emailNorm)) {
    res.status(400).json({ code: "INVALID_EMAIL", message: "邮箱格式不正确" });
    return;
  }
  const pwdErr = validatePasswordStrength(password);
  if (pwdErr) {
    res.status(400).json({ code: "WEAK_PASSWORD", message: pwdErr });
    return;
  }
  if (password !== password_confirm) {
    res.status(400).json({ code: "PASSWORD_MISMATCH", message: "两次输入的密码不一致" });
    return;
  }
  if (phoneNorm && db.findUserByPhone(phoneNorm)) {
    res.status(409).json({ code: "PHONE_EXISTS", message: "该手机号已注册" });
    return;
  }
  if (emailNorm && db.findUserByEmail(emailNorm)) {
    res.status(409).json({ code: "EMAIL_EXISTS", message: "该邮箱已被使用" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = db.createUserByAdmin({
    phone: phoneNorm,
    email: emailNorm,
    passwordHash,
  });

  const loginHint =
    phoneNorm && emailNorm
      ? "可使用手机号或邮箱 + 密码登录"
      : phoneNorm
        ? "可使用手机号 + 密码或验证码登录"
        : "可使用邮箱 + 密码登录";

  res.status(201).json({
    success: true,
    message: `用户创建成功（${phoneNorm ?? emailNorm}），${loginHint}`,
    user: toPublicUser(user),
  });
});

router.get("/users", adminAuthMiddleware, (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const search = (req.query.search as string) || "";

  const users = db.searchUsers(limit, offset, search);
  const total = db.getUserCount();

  const usersWithSubscription = users.map((user) => {
    const subscription = db.getSubscriptionByUserId(user.id);
    const now = Math.floor(Date.now() / 1000);
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      has_password: Boolean(user.password_hash),
      status: user.status,
      subscribe_url: user.subscribe_url,
      subscribe_url_backups: user.subscribe_url_backups,
      created_at: user.created_at,
      subscription: subscription
        ? {
            plan_type: subscription.plan_type,
            expire_at: subscription.expire_at,
            remaining_days: Math.max(
              0,
              Math.ceil((subscription.expire_at - now) / (24 * 60 * 60)),
            ),
            is_active: subscription.expire_at > now,
          }
        : null,
    };
  });

  res.json({
    users: usersWithSubscription,
    total,
    limit,
    offset,
  });
});

router.patch("/users/:id/status", adminAuthMiddleware, (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const status = (req.body as { status?: string }).status;
  if (status !== "active" && status !== "disabled") {
    res.status(400).json({ code: "INVALID_INPUT", message: "status 必须为 active 或 disabled" });
    return;
  }
  const user = db.findUserById(userId);
  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }
  db.setUserStatus(userId, status);
  if (status === "disabled") {
    db.deleteAllSessionsForUser(userId);
  }
  res.json({ success: true, status });
});

router.post("/users/:id/logout-all", adminAuthMiddleware, (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const user = db.findUserById(userId);
  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }
  db.deleteAllSessionsForUser(userId);
  res.json({ success: true, message: "已强制下线该用户所有设备" });
});

router.get("/users/:id", adminAuthMiddleware, (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const user = db.findUserById(userId);

  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }

  const subscription = db.getSubscriptionByUserId(userId);
  const rechargeLogs = db.getRechargeLogsByUserId(userId);
  const now = Math.floor(Date.now() / 1000);

  res.json({
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      has_password: Boolean(user.password_hash),
      status: user.status,
      subscribe_url: user.subscribe_url,
      subscribe_url_backups: user.subscribe_url_backups,
      created_at: user.created_at,
    },
    subscription: subscription
      ? {
          plan_type: subscription.plan_type,
          start_at: subscription.start_at,
          expire_at: subscription.expire_at,
          remaining_days: Math.max(0, Math.ceil((subscription.expire_at - now) / (24 * 60 * 60))),
          is_active: subscription.expire_at > now,
          status: subscription.status,
        }
      : null,
    recharge_logs: rechargeLogs.map((log) => ({
      id: log.id,
      days_added: log.days_added,
      amount: log.amount,
      remark: log.remark,
      created_at: log.created_at,
    })),
  });
});

router.post("/set-subscribe-url", adminAuthMiddleware, (req: Request, res: Response) => {
  const { user_id, subscribe_url, subscribe_url_backups } = req.body as {
    user_id?: number;
    subscribe_url?: string;
    subscribe_url_backups?: string[];
  };

  if (!user_id) {
    res.status(400).json({ code: "INVALID_INPUT", message: "用户ID不能为空" });
    return;
  }

  const user = db.findUserById(user_id);
  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }

  const primary = subscribe_url?.trim() || null;
  const backups = Array.isArray(subscribe_url_backups)
    ? subscribe_url_backups
        .slice(0, db.SUBSCRIBE_BACKUP_SLOTS)
        .map((item) => (typeof item === "string" ? item.trim() : ""))
    : [];

  db.setUserSubscribeUrls(user_id, primary, backups);

  const updated = db.findUserById(user_id)!;
  const backupCount = backups.filter(Boolean).length;
  const hasAny = Boolean(primary) || backupCount > 0;

  res.json({
    success: true,
    message: hasAny
      ? `已为用户 ${user.phone || user.email} 设置订阅链接（主链接 + ${backupCount} 个备用）`
      : `已清除用户 ${user.phone || user.email} 的订阅链接`,
    user: {
      id: updated.id,
      phone: updated.phone,
      subscribe_url: updated.subscribe_url,
      subscribe_url_backups: updated.subscribe_url_backups,
    },
  });
});

router.post("/recharge", adminAuthMiddleware, (req: Request, res: Response) => {
  const adminPayload = (req as Request & { admin: AdminJwtPayload }).admin;
  const { user_id, days, amount, remark } = req.body as {
    user_id?: number;
    days?: number;
    amount?: number;
    remark?: string;
  };

  if (!user_id || !days || days <= 0) {
    res.status(400).json({ code: "INVALID_INPUT", message: "用户ID和天数不能为空，天数必须大于0" });
    return;
  }

  const user = db.findUserById(user_id);
  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }

  const subscription = db.extendSubscription(user_id, days);
  db.createRechargeLog(user_id, adminPayload.adminId, days, amount || 0, remark || null);

  const now = Math.floor(Date.now() / 1000);
  res.json({
    success: true,
    message: `成功为用户 ${user.phone} 充值 ${days} 天`,
    subscription: {
      expire_at: subscription.expire_at,
      remaining_days: Math.ceil((subscription.expire_at - now) / (24 * 60 * 60)),
    },
  });
});

router.get("/recharge-logs", adminAuthMiddleware, (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;

  const logs = db.getRechargeLogs(limit, offset);

  const logsWithUserInfo = logs.map((log) => {
    const user = db.findUserById(log.user_id);
    const admin = db.findAdminById(log.admin_id);
    return {
      id: log.id,
      user_id: log.user_id,
      user_phone: user?.phone || "unknown",
      admin_id: log.admin_id,
      admin_username: admin?.username || "unknown",
      days_added: log.days_added,
      amount: log.amount,
      remark: log.remark,
      created_at: log.created_at,
    };
  });

  res.json({
    logs: logsWithUserInfo,
    limit,
    offset,
  });
});

router.post("/init", async (req: Request, res: Response) => {
  const { username, password, secret_key } = req.body as {
    username?: string;
    password?: string;
    secret_key?: string;
  };

  if (secret_key !== config.adminInitSecret) {
    res.status(403).json({ code: "FORBIDDEN", message: "初始化密钥错误" });
    return;
  }

  if (!username || !password) {
    res.status(400).json({ code: "INVALID_INPUT", message: "用户名和密码不能为空" });
    return;
  }

  const existing = db.findAdminByUsername(username);
  if (existing) {
    res.status(400).json({ code: "ADMIN_EXISTS", message: "管理员已存在" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = db.createAdmin(username, passwordHash, "superadmin");

  res.json({
    success: true,
    message: "管理员创建成功",
    admin: {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    },
  });
});

export default router;
