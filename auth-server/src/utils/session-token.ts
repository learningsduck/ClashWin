import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import * as db from "../db/index.js";
import type { User } from "../db/index.js";

export type JwtPayload = { tokenId: string; userId: number; phone?: string };

export type PublicUser = {
  id: number;
  phone: string | null;
  email: string | null;
  has_password: boolean;
  email_bound: boolean;
  status: string;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    has_password: Boolean(user.password_hash),
    email_bound: Boolean(user.email),
    status: user.status,
  };
}

export function issueUserToken(
  user: User,
  deviceId: string,
  loginMethod: "sms" | "password",
): { access_token: string; expires_in: number; user: PublicUser } {
  if (user.status === "disabled") {
    throw Object.assign(new Error("账户已禁用"), { code: "USER_DISABLED" });
  }
  const tokenId = nanoid(32);
  db.createSession(user.id, tokenId, deviceId || "unknown", loginMethod);
  db.invalidateOtherSessions(user.id, tokenId);
  const payload: JwtPayload = {
    tokenId,
    userId: user.id,
    phone: user.phone ?? undefined,
  };
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });
  return {
    access_token: accessToken,
    expires_in: 604800,
    user: toPublicUser(user),
  };
}
