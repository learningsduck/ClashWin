import { Email, Person, PhoneAndroid, VpnKey } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Link,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useLockFn } from "ahooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { BasePage } from "@/components/base";
import { useAuth } from "@/providers/auth-provider";
import {
  sendSmsCode,
  loginWithSms,
  loginWithPassword,
  setAuthToken,
  getCurrentUser,
  clearAuthToken,
  ADMIN_LOCAL_TOKEN,
  type UserInfo,
} from "@/services/auth-api";
import { formatAuthErrorMessage } from "@/services/auth-errors";
import {
  clearSavedLoginInfo,
  loadSavedLoginInfo,
  saveLoginInfo,
} from "@/services/login-credentials";
import { useThemeMode } from "@/services/states";
import getSystem from "@/utils/get-system";

type LoginMode = "password" | "sms";

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { establishSession } = useAuth();
  const mode = useThemeMode();
  const isDark = mode !== "light";

  const [loginMode, setLoginMode] = useState<LoginMode>("password");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendCodeError, setSendCodeError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(false);

  const ADMIN_ACCOUNT = "zhuifengbaba";
  const ADMIN_PASSWORD = "zjy688";

  const getDeviceId = () => {
    const stored = localStorage.getItem("clash_verge_device_id");
    if (stored) return stored;
    const deviceId = `${getSystem()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("clash_verge_device_id", deviceId);
    return deviceId;
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    const saved = loadSavedLoginInfo();
    setRememberCredentials(saved.remember);
    if (!saved.remember) return;
    setLoginMode(saved.loginMode);
    if (saved.loginMode === "password") {
      setAccount(saved.account);
      setPassword(saved.password);
    } else {
      setPhone(saved.phone);
    }
  }, []);

  const persistLoginFormIfNeeded = () => {
    if (!rememberCredentials) {
      clearSavedLoginInfo();
      return;
    }
    if (loginMode === "password") {
      saveLoginInfo({
        remember: true,
        loginMode: "password",
        account,
        password,
      });
    } else {
      saveLoginInfo({
        remember: true,
        loginMode: "sms",
        phone,
      });
    }
  };

  const handleClearSavedLogin = () => {
    clearSavedLoginInfo();
    setRememberCredentials(false);
    setAccount("");
    setPassword("");
    setPhone("");
    setCode("");
    setLoginError("");
    setSendCodeError("");
  };

  const handleSendCode = useLockFn(async () => {
    setSendCodeError("");
    setLoginError("");
    setSending(true);
    const trimmedPhone = phone.replace(/\s+/g, "").trim();
    if (!trimmedPhone) {
      setSending(false);
      setSendCodeError("请输入手机号");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(trimmedPhone)) {
      setSending(false);
      setSendCodeError("手机号格式不正确，请输入 11 位大陆手机号");
      return;
    }
    try {
      const result = await sendSmsCode(trimmedPhone);
      if (result.success) {
        setSendCodeError("");
        setCountdown(30);
      } else {
        const msg = result.message ?? "验证码发送失败，请稍后重试";
        setSendCodeError(msg);
        setCountdown(10);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "验证码发送失败，请稍后重试";
      setSendCodeError(msg);
      setCountdown(10);
    } finally {
      setSending(false);
    }
  });

  const handleAdminLogin = useLockFn(async () => {
    setAdminError("");
    if (!adminUsername.trim() || !adminPassword) {
      setAdminError(t("auth.login.messages.adminCredentialsRequired"));
      return;
    }
    setAdminLoading(true);
    if (adminUsername.trim() === ADMIN_ACCOUNT && adminPassword === ADMIN_PASSWORD) {
      setAuthToken(ADMIN_LOCAL_TOKEN, {
        id: 0,
        phone: "admin",
        email: null,
        has_password: true,
        email_bound: false,
      });
      await establishSession({
        id: 0,
        phone: "admin",
        email: null,
        has_password: true,
        email_bound: false,
      });
      navigate("/");
    } else {
      setAdminError(t("auth.login.messages.adminLoginFailed"));
    }
    setAdminLoading(false);
  });

  const finishLogin = async (token: string, fallbackUser: UserInfo) => {
    setLoginError("");
    setAuthToken(token, fallbackUser);
    const verified = await getCurrentUser();
    if (verified.success && verified.user) {
      persistLoginFormIfNeeded();
      await establishSession(verified.user);
      navigate("/");
      return;
    }
    clearAuthToken();
    setLoginError(verified.error ?? formatAuthErrorMessage(verified.code ?? "AUTH_VERIFY_FAILED"));
  };

  const handlePasswordLogin = useLockFn(async () => {
    setLoginError("");
    setSendCodeError("");
    const trimmedAccount = account.replace(/\s+/g, "").trim();
    if (!trimmedAccount || !password) {
      setLoginError("请输入账号和密码");
      return;
    }
    setLoading(true);
    try {
      const result = await loginWithPassword(trimmedAccount, password, getDeviceId());
      if (result.success && result.data) {
        await finishLogin(result.data.access_token, result.data.user);
      } else {
        setLoginError(result.error ?? "登录失败，请稍后重试");
      }
    } catch {
      setLoginError(formatAuthErrorMessage("NETWORK_ERROR"));
    } finally {
      setLoading(false);
    }
  });

  const handleSmsLogin = useLockFn(async () => {
    setLoginError("");
    setSendCodeError("");
    const trimmedPhone = phone.replace(/\s+/g, "").trim();
    const trimmedCode = code.trim();
    if (!trimmedPhone || !trimmedCode) {
      setLoginError("请填写手机号和验证码");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(trimmedPhone)) {
      setLoginError("手机号格式不正确，请输入 11 位大陆手机号");
      return;
    }
    setLoading(true);
    try {
      const result = await loginWithSms(trimmedPhone, trimmedCode, getDeviceId());
      if (result.success && result.data) {
        await finishLogin(result.data.access_token, result.data.user);
      } else {
        setLoginError(result.error ?? "登录失败，请稍后重试");
      }
    } catch {
      setLoginError(formatAuthErrorMessage("NETWORK_ERROR"));
    } finally {
      setLoading(false);
    }
  });

  return (
    <BasePage title={t("auth.login.page.title")}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "calc(100vh - 100px)",
        }}
      >
        <Card
          sx={{
            width: "100%",
            maxWidth: 400,
            p: 4,
            borderRadius: 2,
            backgroundColor: isDark ? "#282a36" : "#ffffff",
          }}
        >
          <Typography variant="h5" sx={{ mb: 2, textAlign: "center", fontWeight: 600 }}>
            {t("auth.login.page.title")}
          </Typography>

          <Tabs
            value={loginMode}
            onChange={(_, v) => {
              setLoginMode(v as LoginMode);
              setLoginError("");
            }}
            variant="fullWidth"
            sx={{ mb: 2 }}
          >
            <Tab label={t("auth.login.tabs.password")} value="password" />
            <Tab label={t("auth.login.tabs.sms")} value="sms" />
          </Tabs>

          {loginMode === "password" ? (
            <>
              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  label={t("auth.login.fields.account")}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder={t("auth.login.placeholders.account")}
                  InputProps={{
                    startAdornment: <Email sx={{ mr: 1, color: "text.secondary" }} />,
                  }}
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
                />
              </Box>
              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  type="password"
                  label={t("auth.login.fields.password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.login.placeholders.password")}
                  InputProps={{
                    startAdornment: <VpnKey sx={{ mr: 1, color: "text.secondary" }} />,
                  }}
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
                />
              </Box>
              {loginError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {loginError}
                </Alert>
              ) : null}
              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handlePasswordLogin}
                disabled={loading}
                sx={{ mb: 2 }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  t("auth.login.actions.login")
                )}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center" }}>
                {t("auth.login.hintPassword")}
              </Typography>
            </>
          ) : (
            <>
              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  label={t("auth.login.fields.phone")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("auth.login.placeholders.phone")}
                  InputProps={{
                    startAdornment: <PhoneAndroid sx={{ mr: 1, color: "text.secondary" }} />,
                  }}
                  disabled={loading}
                />
              </Box>
              <Box sx={{ mb: 3, display: "flex", gap: 1 }}>
                <TextField
                  fullWidth
                  label={t("auth.login.fields.code")}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("auth.login.placeholders.code")}
                  InputProps={{
                    startAdornment: <VpnKey sx={{ mr: 1, color: "text.secondary" }} />,
                  }}
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && handleSmsLogin()}
                />
                <Button
                  variant="outlined"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || sending || loading}
                  sx={{ minWidth: 120 }}
                >
                  {sending ? (
                    <CircularProgress size={20} />
                  ) : countdown > 0 ? (
                    t("auth.login.actions.resendInSeconds", { count: countdown })
                  ) : (
                    t("auth.login.actions.sendCode")
                  )}
                </Button>
              </Box>
              {sendCodeError ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {sendCodeError}
                </Alert>
              ) : null}
              {loginError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {loginError}
                </Alert>
              ) : null}
              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleSmsLogin}
                disabled={loading}
                sx={{ mb: 2 }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  t("auth.login.actions.login")
                )}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center" }}>
                {t("auth.login.hintSms")}
              </Typography>
            </>
          )}

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 0.5,
              mt: 1,
            }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={rememberCredentials}
                  onChange={(e) => setRememberCredentials(e.target.checked)}
                  disabled={loading}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  {t("auth.login.rememberCredentials")}
                </Typography>
              }
            />
            <Button
              size="small"
              color="inherit"
              onClick={handleClearSavedLogin}
              disabled={loading}
              sx={{ textTransform: "none", color: "text.secondary" }}
            >
              {t("auth.login.actions.clearSavedLogin")}
            </Button>
          </Box>

          <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: "text.secondary", mt: 2 }}>
            {t("auth.login.hint")}
          </Typography>

          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
            {!showAdminForm ? (
              <Link
                component="button"
                variant="caption"
                onClick={() => setShowAdminForm(true)}
                sx={{ cursor: "pointer", color: "text.secondary" }}
              >
                {t("auth.login.actions.adminLogin")}
              </Link>
            ) : (
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", mb: 1, display: "block" }}>
                  {t("auth.login.adminHint")}
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label={t("auth.login.fields.adminUser")}
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  InputProps={{
                    startAdornment: <Person sx={{ mr: 1, color: "text.secondary", fontSize: 20 }} />,
                  }}
                  disabled={adminLoading || loading}
                  sx={{ mb: 1.5 }}
                />
                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  label={t("auth.login.fields.password")}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  InputProps={{
                    startAdornment: <VpnKey sx={{ mr: 1, color: "text.secondary", fontSize: 20 }} />,
                  }}
                  disabled={adminLoading || loading}
                  onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                  sx={{ mb: 1 }}
                />
                {adminError ? (
                  <Typography variant="caption" sx={{ color: "error.main", display: "block", mb: 1 }}>
                    {adminError}
                  </Typography>
                ) : null}
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleAdminLogin}
                    disabled={adminLoading || loading}
                  >
                    {adminLoading ? <CircularProgress size={18} /> : t("auth.login.actions.adminLogin")}
                  </Button>
                  <Link
                    component="button"
                    variant="caption"
                    onClick={() => {
                      setShowAdminForm(false);
                      setAdminError("");
                      setAdminUsername("");
                      setAdminPassword("");
                    }}
                    sx={{ cursor: "pointer", color: "text.secondary" }}
                  >
                    {t("auth.login.actions.backToUserLogin")}
                  </Link>
                </Box>
              </Box>
            )}
          </Box>
        </Card>
      </Box>
    </BasePage>
  );
};

export default LoginPage;
