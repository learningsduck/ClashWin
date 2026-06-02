import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const { provider } = config.sms;

/** mock 模式下验证码写入此文件，便于在服务器上 cat 查看（无需 pm2 logs） */
const MOCK_CODE_FILE = path.join(path.dirname(config.db.path), "last-sms-code.txt");

/**
 * 发送短信验证码
 * - mock: 开发用，验证码打印到控制台并写入 data/last-sms-code.txt
 * - aliyun / tencent: 需配置对应环境变量，并在此处调用 SDK
 */
export async function sendSmsCode(phone: string, code: string): Promise<{ success: boolean; message?: string }> {
  if (provider === "mock") {
    const line = `${new Date().toISOString()} 手机号: ${phone}, 验证码: ${code} (${config.sms.codeExpireSeconds}秒有效)\n`;
    console.log(`[SMS Mock] ${line.trim()}`);
    try {
      const dir = path.dirname(MOCK_CODE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(MOCK_CODE_FILE, line, "utf8");
    } catch (e) {
      console.warn("[SMS Mock] 写入验证码文件失败:", e);
    }
    return { success: true };
  }

  if (provider === "aliyun") {
    // 阿里云短信 API 示例（需安装 @alicloud/dysmsapi20170525）
    // const client = new Dysmsapi20170525(defaultConfig);
    // await client.sendSms({ PhoneNumbers: phone, SignName: ..., TemplateCode: ..., TemplateParam: JSON.stringify({ code }) });
    console.warn("[SMS] 阿里云未配置 SDK，请安装 @alicloud/dysmsapi20170525 并在此处调用");
    return { success: false, message: "SMS provider aliyun not configured" };
  }

  if (provider === "tencent") {
    // 腾讯云短信 API 示例（需安装 tencentcloud-sdk-nodejs）
    // const client = new tencentcloud.sms.v20210111.Client({ ... });
    // await client.SendSms({ PhoneNumberSet: [phone], SmsSdkAppId: ..., SignName: ..., TemplateId: ..., TemplateParamSet: [code] });
    console.warn("[SMS] 腾讯云未配置 SDK，请安装 tencentcloud-sdk-nodejs 并在此处调用");
    return { success: false, message: "SMS provider tencent not configured" };
  }

  console.log(`[SMS Mock] 手机号: ${phone}, 验证码: ${code}`);
  return { success: true };
}
