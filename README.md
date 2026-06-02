<h1 align="center">
  <img src="./src-tauri/icons/icon.png" alt="ClashWin" width="128" />
  <br>
  ClashWin
  <br>
</h1>

<h3 align="center">
  基于 <a href="https://github.com/clash-verge-rev/clash-verge-rev">Clash Verge Rev</a> 二次开发的桌面客户端<br>
  集成 <a href="https://github.com/learningsduck/ClashFeng-auth">ClashFeng 认证与订阅</a>，面向自建/私有部署场景
</h3>

<p align="center">
  <a href="https://github.com/learningsduck/ClashWin/releases">下载 Release</a> ·
  <a href="https://github.com/learningsduck/ClashFeng-management-install">服务端安装</a> ·
  <a href="https://github.com/learningsduck/ClashFeng-auth">认证 API</a>
</p>

---

## 关于本项目

本仓库 **Fork 自** [clash-verge-rev/clash-verge-rev](https://github.com/clash-verge-rev/clash-verge-rev)，在保留原版的 **Clash.Meta (mihomo) 代理内核、规则、TUN、订阅管理** 等能力的基础上，增加了与 **ClashFeng** 自建认证后端的深度集成。

| 项目 | 说明 |
|------|------|
| **ClashWin**（本仓库） | Windows / macOS / Linux 桌面客户端 |
| [ClashFeng-auth](https://github.com/learningsduck/ClashFeng-auth) | 认证、订阅、管理 API（Node.js） |
| [ClashFeng-management-install](https://github.com/learningsduck/ClashFeng-management-install) | 服务端一键安装、HTTPS、容灾 |

原版 Clash Verge Rev 的通用代理功能说明见上游文档：[clash-verge-rev 文档](https://clash-verge-rev.github.io/)。**安装包请在本仓库 Release 下载，不要使用上游 Release。**

---

## 相对原版的增强功能

### 账户与订阅

- 手机号 / 密码登录，对接自建 [ClashFeng-auth](https://github.com/learningsduck/ClashFeng-auth)
- 登录态本地保存，启动自动校验；单设备踢线（新设备登录后旧设备下线）
- 从服务端拉取订阅配置，与账户绑定

### API 主备线路（容灾）

- 启动时探测可用 API（`/auth/captcha`）
- 从服务端拉取 **`/public/endpoints.json`**，获取 `primary` 与 `backups` 列表
- 当前线路不可用时 **自动切换备用 API**，无需用户逐个修改服务器地址
- 适用于域名/IP 被封后切换新 VPS、新域名的场景

### 其他

- 桌面端认证请求走 Tauri 原生 HTTP，减少本机代理干扰导致的连不上 API
- 未登录时进入登录页，不暴露主界面

---

## 下载与安装

### 正式版（推荐）

在 **本仓库** [Releases](https://github.com/learningsduck/ClashWin/releases) 页面下载对应平台的安装包：

| 平台 | 说明 |
|------|------|
| Windows | x64 / x86（含安装版与便携版，以 Release 资产为准） |
| macOS | 10.15+，Intel / Apple Silicon |
| Linux | x64 / arm64（deb、AppImage 等以 Release 为准） |

若 Release 中暂无文件，需自行 [从源码构建](#从源码构建) 或由维护者执行 CI 发布。

### 安装前准备

1. 已部署 **ClashFeng 认证 API**（HTTPS 域名），参见 [ClashFeng-management-install](https://github.com/learningsduck/ClashFeng-management-install) 安装说明。
2. 服务端已配置客户端线路文件（运维在 API 服务器上维护）：
   - 文件：`/opt/clashfeng/app/public/endpoints.json`
   - 或安装脚本：**`[9] 容灾与主库连接` → `[4] 导出 endpoints.json`**
   - 公网地址：`https://你的API域名/public/endpoints.json`

### 首次使用

1. 安装并打开 ClashWin。
2. 在登录页使用已开通的手机号登录（需服务端已创建用户或开放注册流程）。
3. 登录成功后导入/同步订阅，按需开启系统代理或 TUN（与原版操作相同）。

---

## 配置 API 地址（构建或高级）

客户端按以下优先级获取 API 线路：

1. 任意可用线路上的 **`GET /public/endpoints.json`**（运维维护，推荐）
2. 本地缓存的上次成功线路
3. 构建时内置环境变量（`.env` / `.env.production`）：

```env
VITE_AUTH_API_PRIMARY=https://你的API域名
VITE_AUTH_API_BACKUPS=["https://备用API域名"]
```

开发环境可复制 [.env.example](./.env.example) 为 `.env` 后修改。

本地对接开发中的 API 时，可将 `VITE_AUTH_API_PRIMARY` 设为 `http://127.0.0.1:3001`（需与 [ClashFeng-auth](https://github.com/learningsduck/ClashFeng-auth) 本地运行一致）。

---

## 从源码构建

环境要求：**Node.js 18+**、**pnpm**、**Rust**、各平台 [Tauri 依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/learningsduck/ClashWin.git
cd ClashWin
cp .env.example .env
# 编辑 .env，填写 VITE_AUTH_API_PRIMARY 等

pnpm install
pnpm run prebuild
pnpm build
```

- Windows：`src-tauri/target/release/` 下生成安装包或便携版（见 `pnpm run portable` 等脚本）。
- 开发调试：`pnpm dev`

更完整的贡献与构建说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 代理功能（继承自上游）

以下能力来自 Clash Verge Rev / mihomo，**使用方式与原版一致**：

- Clash.Meta 内核、规则与策略组、配置文件 Merge / Script
- 系统代理、TUN 模式、连接与日志查看
- WebDAV 配置备份等

遇到问题可先查阅 [上游 FAQ](https://clash-verge-rev.github.io/faq/windows.html)；**登录、订阅、API 线路类问题**请检查 ClashFeng 服务端与 `endpoints.json`。

---

## 相关文档（本仓库）

| 文档 | 内容 |
|------|------|
| [docs/用户登录功能实现方案.md](./docs/用户登录功能实现方案.md) | 登录与后端接口设计 |
| [docs/登录功能测试结果.md](./docs/登录功能测试结果.md) | 登录联调说明 |
| [auth-server/deploy/DEPLOY-ROCKY9.md](./auth-server/deploy/DEPLOY-ROCKY9.md) | 旧版独立部署说明（现推荐 management-install） |

服务端容灾（主库 + 备用 API 节点、域名被封迁移）见 [ClashFeng-management-install / DISASTER.md](https://github.com/learningsduck/ClashFeng-management-install/blob/main/DISASTER.md)。

---

## 致谢

- [zzzgydi/clash-verge](https://github.com/zzzgydi/clash-verge) / [clash-verge-rev](https://github.com/clash-verge-rev/clash-verge-rev) — 原版 GUI 与 mihomo 集成
- [tauri-apps/tauri](https://github.com/tauri-apps/tauri)、[MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) 等开源项目

## 许可证

本项目继承上游 **GPL-3.0**，详见 [LICENSE](./LICENSE)。
