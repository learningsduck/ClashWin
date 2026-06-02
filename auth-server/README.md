# Clash Verge 认证后端

为 Clash Verge 提供：**手机号短信验证登录**、**单设备踢线**（换设备后旧设备自动断线）。

## 技术栈

- Node.js + Express + TypeScript
- SQLite（**sql.js**，纯 JS 实现，无需 C++ 编译，Windows 可直接运行）
- JWT（登录态）
- 短信：开发用 mock（验证码打控制台），生产可接阿里云/腾讯云

## 快速开始

### 1. 安装依赖

```bash
cd auth-server
pnpm install
# 或 npm install
```

### 2. 开发运行（mock 短信，验证码在终端里看）

```bash
pnpm dev
# 或 npm run dev
```

服务默认：`http://localhost:3001`。

### 3. 接口说明

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/sms/send` | 发送验证码，body: `{ "phone": "+8613800138000" }` |
| POST | `/auth/sms/login` | 登录，body: `{ "phone", "code", "device_id" }`，返回 `access_token` |
| GET  | `/auth/me`        | 校验 token，Header: `Authorization: Bearer <token>` |
| POST | `/auth/logout`    | 登出，需 token |

**单设备逻辑**：同一用户新设备登录时，会删除该用户其它会话；旧设备再请求 `/auth/me` 会得到 `401` 且 `code: "SESSION_REPLACED"`，前端据此提示「您的账号已在其他设备登录」并跳转登录。

## 配置

复制 `.env.example` 为 `.env`（可选，不复制则用默认值）：

- `PORT`：端口，默认 3001
- `JWT_SECRET`：JWT 密钥，**生产务必改成随机长字符串**
- `JWT_EXPIRES_IN`：token 有效期，如 `7d`、`24h`
- `SMS_CODE_EXPIRE_SECONDS`：验证码有效期（秒）
- `SMS_SEND_INTERVAL_SECONDS`：同一手机号发码间隔（秒）
- `SMS_PROVIDER`：`mock`（默认）| `aliyun` | `tencent`
- `DB_PATH`：SQLite 文件路径，默认 `./data/auth.db`

## 接入真实短信

### 阿里云

1. 开通阿里云短信服务，申请签名和「验证码」模板。
2. 安装 SDK：`pnpm add @alicloud/dysmsapi20170525`。
3. 在 `.env` 中配置：
   - `SMS_PROVIDER=aliyun`
   - `ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`
   - `ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE`
4. 在 `src/services/sms.ts` 中取消注释并实现阿里云调用逻辑（按阿里云 Node 文档传入 `PhoneNumbers`、`TemplateParam: { code }` 等）。

### 腾讯云

1. 开通腾讯云短信，创建应用、签名、验证码模板。
2. 安装：`pnpm add tencentcloud-sdk-nodejs`。
3. `.env` 配置 `SMS_PROVIDER=tencent` 及 `TENCENT_*` 相关变量。
4. 在 `src/services/sms.ts` 中实现腾讯云 `SendSms` 调用。

## 生产部署

1. 设置强随机 `JWT_SECRET`。
2. 使用 HTTPS（Nginx 反代或云厂商 LB）。
3. 配置真实短信（阿里云/腾讯云）。
4. 数据库：当前为单文件 SQLite，数据目录需可写、建议备份；高可用可后续迁到 PostgreSQL/MySQL，表结构保持一致即可。

## 与 Clash Verge 前端对接

前端 baseURL 指向本服务，例如：`http://localhost:3001`（开发）或 `https://your-domain.com`（生产）。

- 登录：`POST /auth/sms/send` → `POST /auth/sms/login`，拿到 `access_token` 后存本地（建议 Tauri 侧安全存储）。
- 自动登录：启动时带 `Authorization: Bearer <token>` 请求 `GET /auth/me`，200 则进主界面，401 且 `code === "SESSION_REPLACED"` 则清 token 并提示「您的账号已在其他设备登录」后跳转登录页。
