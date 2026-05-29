/**
 * 从环境变量读取配置，开发时可用 .env 文件（需自行安装 dotenv 或手动加载）
 */
function env(key: string, defaultValue?: string): string {
  const v = process.env[key] ?? defaultValue;
  if (v === undefined) throw new Error(`Missing env: ${key}`);
  return v;
}

function envOptional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  port: parseInt(envOptional("PORT", "3001"), 10),
  jwt: {
    secret: envOptional("JWT_SECRET", "dev-secret-change-in-production"),
    expiresIn: envOptional("JWT_EXPIRES_IN", "7d"),
  },
  sms: {
    codeExpireSeconds: parseInt(envOptional("SMS_CODE_EXPIRE_SECONDS", "300"), 10),
    sendIntervalSeconds: parseInt(envOptional("SMS_SEND_INTERVAL_SECONDS", "30"), 10),
    provider: envOptional("SMS_PROVIDER", "mock"), // mock | aliyun | tencent
  },
  email: {
    codeExpireSeconds: parseInt(envOptional("EMAIL_CODE_EXPIRE_SECONDS", "900"), 10),
    provider: envOptional("EMAIL_PROVIDER", "mock"), // mock | smtp
    smtp: {
      host: envOptional("SMTP_HOST", ""),
      port: parseInt(envOptional("SMTP_PORT", "465"), 10),
      user: envOptional("SMTP_USER", ""),
      pass: envOptional("SMTP_PASS", ""),
      from: envOptional("SMTP_FROM", ""),
    },
  },
  verification: {
    sendIntervalSeconds: parseInt(envOptional("VERIFICATION_SEND_INTERVAL_SECONDS", "30"), 10),
    hourlyLimit: parseInt(envOptional("VERIFICATION_HOURLY_LIMIT", "10"), 10),
    dailyLimit: parseInt(envOptional("VERIFICATION_DAILY_LIMIT", "20"), 10),
  },
  db: {
    path: envOptional("DB_PATH", "./data/auth.db"),
  },
  adminInitSecret: envOptional("ADMIN_INIT_SECRET", "clash-verge-admin-init-2024"),
} as const;
