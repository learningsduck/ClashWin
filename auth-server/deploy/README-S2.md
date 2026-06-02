# 在远程 Linux 服务器 S2 上部署 auth-server

在 Cursor 已连接远程 S2 的前提下，按下面步骤在 S2 上部署，实现关机后服务仍可用。

---

## 一、确认代码已在 S2 上

**方式 A：用 Cursor 远程打开 S2 上的项目**

1. Cursor 左下角已连接 S2（SSH: 你的 S2 地址）。
2. 在 S2 上已有项目目录（若没有，见方式 B）。
3. 用 Cursor 在远程打开该目录：**文件 → 打开文件夹**，选 S2 上的项目路径（例如 `/home/你的用户名/clash-verge-rev-dev` 或你放代码的路径）。

**方式 B：在 S2 上还没有代码**

在 **本机 Windows** 终端执行（把 `你的用户@S2的IP或域名` 和 `/home/xxx` 换成实际值）：

```bash
# 示例：把本机 auth-server 所在项目整体同步到 S2
scp -r "C:\Users\Administrator\Desktop\Clash Verge源码\clash-verge-rev-dev" 你的用户@S2的IP或域名:/home/你的用户名/
```

或在 S2 上用 git 拉取（若项目在 git 仓库里）：

```bash
git clone <你的仓库地址>
cd clash-verge-rev-dev
```

---

## 二、在 S2 上安装 Node.js（若未安装）

在 **Cursor 里打开 S2 的终端**（终端会落在 S2 上），执行：

```bash
# 检查是否已有 Node
node -v
```

若没有或版本太旧，可用 NodeSource 安装 LTS：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

---

## 三、在 S2 上安装依赖并构建

在终端里进入 **auth-server** 目录（路径按你在 S2 上的实际位置改）：

```bash
cd /home/你的用户名/clash-verge-rev-dev/auth-server
# 或： cd ~/clash-verge-rev-dev/auth-server
```

安装依赖并构建：

```bash
npm install
# 或： pnpm install
npm run build
```

---

## 四、配置环境变量（生产务必改 JWT_SECRET）

在 **auth-server** 目录下创建 `.env`：

```bash
cp .env.example .env
nano .env
```

至少修改：

- `PORT=3001`（或你想要的端口，如 80 需配合 Nginx 反代）
- `JWT_SECRET=请改成随机长字符串`

保存后退出（nano：Ctrl+O 回车，Ctrl+X）。

---

## 五、用 PM2 常驻运行（推荐）

安装 PM2（全局，一次即可）：

```bash
sudo npm install -g pm2
```

在 **auth-server** 目录下用 PM2 启动：

```bash
cd /home/你的用户名/clash-verge-rev-dev/auth-server
mkdir -p logs
pm2 start deploy/ecosystem.config.cjs
```

常用命令：

```bash
pm2 status              # 查看状态
pm2 logs auth-server    # 看日志
pm2 restart auth-server # 重启
pm2 stop auth-server    # 停止
```

设置开机自启（S2 重启后也会自动拉起）：

```bash
pm2 startup
# 按提示执行它输出的那条 sudo 命令
pm2 save
```

---

## 六、放行端口与访问方式

- **防火墙**：若 S2 开了 ufw，放行你用的端口，例如：
  ```bash
  sudo ufw allow 3001
  sudo ufw reload
  ```
- **访问地址**：  
  - 本机/内网：`http://S2的IP:3001`  
  - 若用 Nginx 反代到 80/443，则用 `http(s)://你的域名`。

---

## 七、简要检查

在 S2 上或本机执行：

```bash
curl http://localhost:3001/health
# 或： curl http://S2的IP:3001/health
```

返回 `{"ok":true}` 即表示后端在 S2 上已部署并运行；关机本机 Windows 后，只要 S2 在线，服务就仍然可用。
