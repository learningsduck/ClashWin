/**
 * PM2 进程管理配置，用于在 Linux 上常驻运行 auth-server
 * 使用：在 auth-server 目录下执行  pm2 start deploy/ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "auth-server",
      cwd: __dirname + "/..",
      script: "dist/index.js",
      node_args: "--enable-source-maps",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/auth-server-err.log",
      out_file: "logs/auth-server-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
