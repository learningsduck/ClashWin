import { Router, type Request, type Response } from "express";
import * as db from "../db/index.js";
import { collectUserSubscribeUrls } from "../db/subscribe-urls.js";
import { authMiddleware, type JwtPayload } from "../middleware/auth.js";

const router: Router = Router();

router.get("/", authMiddleware, (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  const subscription = db.getSubscriptionByUserId(payload.userId);
  const now = Math.floor(Date.now() / 1000);

  if (!subscription) {
    res.json({
      has_subscription: false,
      is_active: false,
      plan_type: null,
      start_at: null,
      expire_at: null,
      remaining_days: 0,
      status: "none",
    });
    return;
  }

  const remainingSeconds = subscription.expire_at - now;
  const remainingDays = Math.max(0, Math.ceil(remainingSeconds / (24 * 60 * 60)));
  const isActive = subscription.expire_at > now && subscription.status === "active";

  res.json({
    has_subscription: true,
    is_active: isActive,
    plan_type: subscription.plan_type,
    start_at: subscription.start_at,
    expire_at: subscription.expire_at,
    remaining_days: remainingDays,
    status: isActive ? "active" : "expired",
  });
});

router.get("/check", authMiddleware, (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  const subscription = db.getSubscriptionByUserId(payload.userId);
  const now = Math.floor(Date.now() / 1000);

  if (!subscription || subscription.expire_at <= now) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      message: "会员已过期，请续费后使用",
      is_active: false,
    });
    return;
  }

  res.json({
    is_active: true,
    expire_at: subscription.expire_at,
  });
});

router.get("/history", authMiddleware, (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  const logs = db.getRechargeLogsByUserId(payload.userId);

  res.json({
    logs: logs.map((log) => ({
      id: log.id,
      days_added: log.days_added,
      amount: log.amount,
      remark: log.remark,
      created_at: log.created_at,
    })),
  });
});

router.get("/url", authMiddleware, (req: Request, res: Response) => {
  const payload = (req as Request & { user: JwtPayload }).user;
  const user = db.findUserById(payload.userId);

  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
    return;
  }

  // 检查会员是否有效
  const subscription = db.getSubscriptionByUserId(payload.userId);
  const now = Math.floor(Date.now() / 1000);
  const isActive = subscription && subscription.expire_at > now;

  if (!isActive) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      message: "会员已过期，请续费后使用",
      has_url: false,
    });
    return;
  }

  const subscribeUrls = collectUserSubscribeUrls(user);
  if (subscribeUrls.length === 0) {
    res.status(404).json({
      code: "NO_SUBSCRIBE_URL",
      message: "暂未分配订阅链接，请联系客服",
      has_url: false,
    });
    return;
  }

  res.json({
    has_url: true,
    subscribe_url: subscribeUrls[0],
    subscribe_urls: subscribeUrls,
  });
});

export default router;
