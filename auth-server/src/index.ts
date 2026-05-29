import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { initDb } from "./db/index.js";
import authRoutes from "./routes/auth.js";
import subscriptionRoutes from "./routes/subscription.js";
import adminRoutes from "./routes/admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 找到 public 目录 - tsx 运行时 __dirname 是 src/，所以需要返回一层到 auth-server/
const publicDir = path.resolve(__dirname, "..", "public");
console.log("[Debug] __dirname:", __dirname);
console.log("[Debug] publicDir:", publicDir);

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// 测试路由
app.get("/test", (_req, res) => {
  res.send("<h1>Test OK!</h1>");
});

// 根路径返回 index.html
app.get("/", (_req, res) => {
  try {
    const indexPath = path.join(publicDir, "index.html");
    console.log("[Debug] Reading:", indexPath);
    console.log("[Debug] File exists:", fs.existsSync(indexPath));
    const html = fs.readFileSync(indexPath, "utf-8");
    console.log("[Debug] HTML length:", html.length);
    res.type("html").send(html);
  } catch (err: any) {
    console.error("[Debug] Error:", err);
    res.status(500).send("Error loading admin panel: " + err.message);
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// API 路由
app.use("/auth", authRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/admin", adminRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Auth Server] Unhandled error:", err);
  if (!res.headersSent) {
    res.status(500).json({
      code: "SERVER_ERROR",
      message: err instanceof Error ? err.message : "服务器内部错误",
    });
  }
});

// 静态文件服务 - 管理后台的其他资源
app.use(express.static(publicDir));

async function start() {
  await initDb();
  app.listen(config.port, () => {
    console.log(`[Auth Server] http://localhost:${config.port}`);
    console.log(`\n  管理后台: http://localhost:${config.port}/`);
    console.log(`\n  用户端 API:`);
    console.log(`  - POST /auth/sms/send        发送短信验证码`);
    console.log(`  - POST /auth/sms/login       手机号+验证码登录`);
    console.log(`  - POST /auth/login           手机/邮箱+密码登录`);
    console.log(`  - POST /auth/email/send      发送邮箱验证码(绑定)`);
    console.log(`  - POST /auth/email/bind      绑定邮箱并设密码`);
    console.log(`  - POST /auth/password/change 修改密码`);
    console.log(`  - GET  /auth/me              校验 token / 当前用户`);
    console.log(`  - POST /auth/logout          登出`);
    console.log(`  - GET  /subscription         获取会员订阅状态`);
    console.log(`  - GET  /subscription/check   检查会员是否有效`);
    console.log(`  - GET  /subscription/history 充值记录`);
    console.log(`  - GET  /subscription/url    获取订阅链接`);
    console.log(`\n  管理后台 API:`);
    console.log(`  - POST /admin/init           初始化管理员（需 secret_key）`);
    console.log(`  - POST /admin/login          管理员登录`);
    console.log(`  - GET  /admin/me             当前管理员信息`);
    console.log(`  - GET  /admin/stats          统计`);
    console.log(`  - POST /admin/users          添加用户（手机/邮箱至少一项+密码）`);
    console.log(`  - GET  /admin/users          用户列表`);
    console.log(`  - PATCH /admin/users/:id/status  禁用/启用`);
    console.log(`  - POST /admin/users/:id/logout-all 强制下线`);
    console.log(`  - GET  /admin/users/:id      用户详情`);
    console.log(`  - POST /admin/recharge       为用户充值`);
    console.log(`  - GET  /admin/recharge-logs  充值记录`);
    console.log(`  - POST /admin/set-subscribe-url 设置用户订阅链接`);
    console.log(`  - GET  /admin/subscription-pool     订阅汇总列表`);
    console.log(`  - POST /admin/subscription-pool     添加汇总订阅`);
    console.log(`  - POST /admin/subscription-pool/:id/assign  分配订阅给用户`);
  });
}

start().catch((err) => {
  console.error("[Auth Server] 启动失败:", err);
  process.exit(1);
});
