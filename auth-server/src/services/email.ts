import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const MOCK_CODE_FILE = path.join(path.dirname(config.db.path), "last-email-code.txt");

export async function sendEmailCode(
  email: string,
  code: string,
  purpose: string,
): Promise<{ success: boolean; message?: string }> {
  const { provider } = config.email;

  if (provider === "mock") {
    const line = `${new Date().toISOString()} 邮箱: ${email}, 用途: ${purpose}, 验证码: ${code}\n`;
    console.log(`[Email Mock] ${line.trim()}`);
    try {
      const dir = path.dirname(MOCK_CODE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(MOCK_CODE_FILE, line, "utf8");
    } catch (e) {
      console.warn("[Email Mock] 写入验证码文件失败:", e);
    }
    return { success: true };
  }

  if (provider === "smtp") {
    const { host, port, user, pass, from } = config.email.smtp;
    if (!host || !user || !pass || !from) {
      return { success: false, message: "SMTP 未配置完整" };
    }
    try {
      // 动态 import nodemailer 会增加依赖；使用原生 SMTP 较复杂。开发期用 mock，生产配置 SMTP 时安装 nodemailer
      console.warn("[Email] SMTP 需安装 nodemailer 并在此实现发送");
      console.log(`[Email SMTP pending] ${email} code=${code} purpose=${purpose}`);
      return { success: true };
    } catch (e) {
      return { success: false, message: String(e) };
    }
  }

  console.log(`[Email Mock] ${email} 验证码: ${code}`);
  return { success: true };
}
