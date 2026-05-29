#!/usr/bin/env bash
# 在 S2 上执行此脚本完成部署。用法：在 auth-server 目录下执行  bash deploy/setup-s2.sh
# 或从项目根目录：cd auth-server && bash deploy/setup-s2.sh

set -e
cd "$(dirname "$0")/.."
echo "[1/6] 当前目录: $(pwd)"
echo "[2/6] 安装依赖..."
npm install
echo "[3/6] 构建..."
npm run build
echo "[4/6] 创建 .env（若不存在）..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    已复制 .env.example -> .env，请编辑 .env 至少修改 JWT_SECRET"
else
  echo "    .env 已存在，跳过"
fi
echo "[5/6] 创建日志目录..."
mkdir -p logs
echo "[6/6] 启动 PM2..."
if command -v pm2 &>/dev/null; then
  pm2 delete auth-server 2>/dev/null || true
  pm2 start deploy/ecosystem.config.cjs
  echo ""
  echo "部署完成。常用命令："
  echo "  pm2 status"
  echo "  pm2 logs auth-server"
  echo "  pm2 restart auth-server"
  echo "设置开机自启: pm2 startup && pm2 save"
else
  echo "未检测到 pm2，请先执行: npm install -g pm2"
  echo "然后执行: pm2 start deploy/ecosystem.config.cjs"
fi
