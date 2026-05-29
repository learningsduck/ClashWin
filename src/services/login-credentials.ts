const REMEMBER_KEY = "clash_verge_login_remember";
const ACCOUNT_KEY = "clash_verge_login_account";
const PASSWORD_KEY = "clash_verge_login_password";
const PHONE_KEY = "clash_verge_login_phone";
const LOGIN_MODE_KEY = "clash_verge_login_mode";

export type SavedLoginMode = "password" | "sms";

export interface SavedLoginInfo {
  remember: boolean;
  loginMode: SavedLoginMode;
  account: string;
  password: string;
  phone: string;
}

export function loadSavedLoginInfo(): SavedLoginInfo {
  const remember = localStorage.getItem(REMEMBER_KEY) === "1";
  return {
    remember,
    loginMode:
      localStorage.getItem(LOGIN_MODE_KEY) === "sms" ? "sms" : "password",
    account: localStorage.getItem(ACCOUNT_KEY) ?? "",
    password: localStorage.getItem(PASSWORD_KEY) ?? "",
    phone: localStorage.getItem(PHONE_KEY) ?? "",
  };
}

export function saveLoginInfo(params: {
  remember: boolean;
  loginMode: SavedLoginMode;
  account?: string;
  password?: string;
  phone?: string;
}): void {
  if (!params.remember) {
    clearSavedLoginInfo();
    return;
  }
  localStorage.setItem(REMEMBER_KEY, "1");
  localStorage.setItem(LOGIN_MODE_KEY, params.loginMode);
  if (params.loginMode === "password") {
    localStorage.setItem(ACCOUNT_KEY, params.account?.trim() ?? "");
    localStorage.setItem(PASSWORD_KEY, params.password ?? "");
    localStorage.removeItem(PHONE_KEY);
  } else {
    localStorage.setItem(PHONE_KEY, params.phone?.replace(/\s+/g, "").trim() ?? "");
    localStorage.removeItem(ACCOUNT_KEY);
    localStorage.removeItem(PASSWORD_KEY);
  }
}

export function clearSavedLoginInfo(): void {
  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(PASSWORD_KEY);
  localStorage.removeItem(PHONE_KEY);
  localStorage.removeItem(LOGIN_MODE_KEY);
}
