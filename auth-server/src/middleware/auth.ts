import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import * as db from "../db/index.js";
import type { JwtPayload } from "../utils/session-token.js";

export type { JwtPayload };

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "缺少或无效的 Authorization" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    const session = db.findSessionByTokenId(decoded.tokenId);
    if (!session) {
      res.status(401).json({ code: "SESSION_REPLACED", message: "您的账号已在其他设备登录" });
      return;
    }
    const user = db.findUserById(decoded.userId);
    if (!user) {
      res.status(401).json({ code: "USER_NOT_FOUND", message: "用户不存在" });
      return;
    }
    if (user.status === "disabled") {
      res.status(403).json({ code: "USER_DISABLED", message: "账户已禁用" });
      return;
    }
    (req as Request & { user: JwtPayload }).user = decoded;
    next();
  } catch {
    res.status(401).json({ code: "UNAUTHORIZED", message: "token 无效或已过期" });
  }
}
