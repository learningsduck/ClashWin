# Rocky Linux 9 服务器部署指南

本文档介绍如何在 Rocky Linux 9 上部署 auth-server（含管理后台）。

## 1. 服务器准备

### 1.1 更新系统

```bash
sudo dnf update -y
```

### 1.2 安装必要工具

```bash
sudo dnf install -y git curl wget vim
```

### 1.3 安装 Node.js 18+

```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs
node -v  # 确认版本 >= 18
```

### 1.4 安装 pnpm

```bash
npm install -g pnpm
```

### 1.5 安装 PM2

```bash
npm install -g pm2
```

## 2. 部署 auth-server

### 2.1 上传代码

将 `auth-server` 目录上传到服务器，例如 `/opt/clash-verge-auth/`：

```bash
# 在服务器上创建目录
sudo mkdir -p /opt/clash-verge-auth
sudo chown $USER:$USER /opt/clash-verge-auth

# 本地打包并上传（在 Windows 上用 scp 或其他工具）
# 或者用 git clone 你的仓库
```

### 2.2 安装依赖

```bash
cd /opt/clash-verge-auth
pnpm install
```

### 2.3 创建环境配置

```bash
cp .env.example .env
vim .env
```

编辑 `.env` 文件：

```env
PORT=3001
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d
SMS_PROVIDER=aliyun
SMS_CODE_EXPIRE_SECONDS=300
SMS_SEND_INTERVAL_SECONDS=60
DB_PATH=./data/auth.db
ADMIN_INIT_SECRET=your-admin-init-secret-change-this
```

### 2.4 构建项目

```bash
pnpm build
```

### 2.5 使用 PM2 启动

```bash
pm2 start dist/index.js --name auth-server
pm2 save
pm2 startup  # 按提示执行命令以开机自启
```

### 2.6 查看日志

```bash
pm2 logs auth-server
```

## 3. 配置 Nginx 反向代理

### 3.1 安装 Nginx

```bash
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 3.2 配置 Nginx

创建配置文件 `/etc/nginx/conf.d/auth-server.conf`：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3.3 测试并重载 Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. 配置 HTTPS (Let's Encrypt)

### 4.1 安装 Certbot

```bash
sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx
```

### 4.2 申请证书

```bash
sudo certbot --nginx -d your-domain.com
```

按提示操作，Certbot 会自动配置 Nginx 的 HTTPS。

### 4.3 设置自动续期

```bash
sudo systemctl enable certbot-renew.timer
sudo systemctl start certbot-renew.timer
```

## 5. 防火墙配置

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 6. 初始化管理员

访问 `https://your-domain.com/`，在登录页面展开"首次使用？初始化管理员账户"：

1. 填写管理员用户名和密码
2. 填写初始化密钥（与 `.env` 中的 `ADMIN_INIT_SECRET` 一致）
3. 点击"创建管理员"

## 7. 更新客户端配置

修改 Clash Verge 客户端的 `src/services/auth-config.ts`：

```typescript
export const AUTH_API_BASE_URL = "https://your-domain.com";
```

然后重新构建客户端。

## 8. 常用命令

```bash
# 查看服务状态
pm2 status

# 重启服务
pm2 restart auth-server

# 查看日志
pm2 logs auth-server

# 停止服务
pm2 stop auth-server

# 更新代码后重新部署
cd /opt/clash-verge-auth
git pull  # 或重新上传代码
pnpm install
pnpm build
pm2 restart auth-server
```

## 9. 数据备份

### 定期备份数据库文件

```bash
# 创建备份脚本
cat > /opt/clash-verge-auth/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/clash-verge-auth/backups"
mkdir -p $BACKUP_DIR
cp /opt/clash-verge-auth/data/auth.db "$BACKUP_DIR/auth_$(date +%Y%m%d_%H%M%S).db"
# 保留最近 7 天的备份
find $BACKUP_DIR -name "auth_*.db" -mtime +7 -delete
EOF

chmod +x /opt/clash-verge-auth/backup.sh

# 添加定时任务（每天凌晨 3 点备份）
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/clash-verge-auth/backup.sh") | crontab -
```

## 10. 安全建议

1. **修改默认密钥**：务必修改 `.env` 中的 `JWT_SECRET` 和 `ADMIN_INIT_SECRET`
2. **限制管理后台访问**：可在 Nginx 中添加 IP 白名单
3. **定期备份**：设置自动备份脚本
4. **监控日志**：定期检查 `pm2 logs` 和 Nginx 访问日志
5. **系统更新**：定期执行 `dnf update`
