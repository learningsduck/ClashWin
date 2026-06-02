import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import * as db from "../db/index.js";

export interface AdminJwtPayload {
  adminId: number;
  username: string;
  role: string;
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "需要管理员登录" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AdminJwtPayload & { type?: string };

    if (payload.type !== "admin") {
      res.status(403).json({ code: "FORBIDDEN", message: "需要管理员权限" });
      return;
    }

    const admin = db.findAdminById(payload.adminId);
    if (!admin) {
      res.status(401).json({ code: "ADMIN_NOT_FOUND", message: "管理员不存在" });
      return;
    }

    (req as Request & { admin: AdminJwtPayload }).admin = payload;
    next();
  } catch {
    res.status(401).json({ code: "INVALID_TOKEN", message: "无效的管理员令牌" });
  }
}
