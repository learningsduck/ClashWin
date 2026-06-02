/** 将后端错误码/文案统一为中文提示（登录页等无 Toast 区域使用） */
export function formatAuthErrorMessage(
  code?: string,
  serverMessage?: string,
  httpStatus?: number,
): string {
  const byCode: Record<string, string> = {
    CODE_EXPIRED: "验证码已过期，请点击「获取验证码」重新获取",
    CODE_INVALID: "验证码错误，请核对后重试",
    INVALID_PHONE: "手机号格式不正确，请输入 11 位大陆手机号",
    INVALID_INPUT: "请填写完整且正确的登录信息",
    INVALID_CREDENTIALS: "账号或密码错误",
    USER_DISABLED: "账户已被禁用，请联系管理员",
    SESSION_REPLACED: "您的账号已在其他设备登录，请重新登录",
    TOKEN_INVALID: "登录已失效，请重新登录",
    RATE_LIMIT_INTERVAL: "发送过于频繁，请 30 秒后再试",
    RATE_LIMIT_HOURLY: "本小时验证码发送次数已达上限，请稍后再试",
    RATE_LIMIT_DAILY: "今日验证码发送次数已达上限，请明天再试",
    SMS_FAILED: "短信发送失败，请稍后重试",
    SMS_PROVIDER_ERROR: "短信服务异常，请联系管理员",
    FORBIDDEN: "无权执行此操作",
    HTTPS_REQUIRED:
      "请使用 HTTPS 域名访问认证服务（勿使用 http:// 或 IP:3001）。可在登录页清除已保存信息后重试",
    NETWORK_ERROR:
      "无法连接认证服务器。请确认 auth-server 已启动（http://127.0.0.1:3001）；若已开启系统代理，请更新客户端后重试（已改为直连本机）",
    AUTH_VERIFY_FAILED: "登录成功但身份校验失败，请检查网络或重启认证服务",
  };

  if (code && byCode[code]) {
    return byCode[code];
  }

  if (serverMessage && /[\u4e00-\u9fa5]/.test(serverMessage)) {
    return serverMessage;
  }

  if (httpStatus === 429) {
    return serverMessage || "操作过于频繁，请稍后再试";
  }
  if (code === "HTTPS_REQUIRED" || serverMessage?.includes("HTTPS")) {
    return byCode.HTTPS_REQUIRED ?? serverMessage!;
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return serverMessage || "登录失败，请检查账号、密码或验证码";
  }
  if (httpStatus && httpStatus >= 500) {
    return "认证服务器异常，请稍后重试或联系管理员";
  }

  return serverMessage || "登录失败，请稍后重试";
}
