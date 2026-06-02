import {
  Person,
  CardMembership,
  AccessTime,
  Warning,
  CheckCircle,
  Logout,
  Email,
  VpnKey,
} from "@mui/icons-material";
import {
  Box,
  Typography,
  Chip,
  LinearProgress,
  Button,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
} from "@mui/material";
import { useLockFn } from "ahooks";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/providers/auth-provider";
import {
  ADMIN_LOCAL_TOKEN,
  bindEmailWithPassword,
  changePassword,
  getAuthToken,
  sendEmailBindCode,
} from "@/services/auth-api";
import { showNotice } from "@/services/notice-service";

interface Props {
  onError: (err: unknown) => void;
}

const SettingAccount = ({ onError }: Props) => {
  const { t } = useTranslation();
  const { user, subscription, logout, isAuthenticated, checkAuth } = useAuth();

  const [bindOpen, setBindOpen] = useState(false);
  const [bindEmail, setBindEmail] = useState("");
  const [bindCode, setBindCode] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [bindPasswordConfirm, setBindPasswordConfirm] = useState("");
  const [bindSending, setBindSending] = useState(false);
  const [bindSubmitting, setBindSubmitting] = useState(false);
  const [bindCountdown, setBindCountdown] = useState(0);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const isAdminLocal = getAuthToken() === ADMIN_LOCAL_TOKEN;

  useEffect(() => {
    if (bindCountdown > 0) {
      const timer = setTimeout(() => setBindCountdown(bindCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [bindCountdown]);

  if (!isAuthenticated || !user) {
    return null;
  }

  const formatExpireDate = (timestamp: number | null) => {
    if (!timestamp) return t("settings.account.unlimited");
    return dayjs.unix(timestamp).format("YYYY-MM-DD HH:mm");
  };

  const getStatusColor = () => {
    if (!subscription?.has_subscription) return "default";
    if (!subscription.is_active) return "error";
    if (subscription.remaining_days <= 7) return "warning";
    return "success";
  };

  const getStatusText = () => {
    if (!subscription?.has_subscription) return t("settings.account.noSubscription");
    if (!subscription.is_active) return t("settings.account.expired");
    if (subscription.remaining_days <= 7) {
      return t("settings.account.expiringSoon", { days: subscription.remaining_days });
    }
    return t("settings.account.active");
  };

  const getRemainingProgress = () => {
    if (!subscription?.has_subscription || !subscription.is_active) return 0;
    const maxDays = 365;
    return Math.min(100, (subscription.remaining_days / maxDays) * 100);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      onError(err);
    }
  };

  const handleSendBindCode = useLockFn(async () => {
    const email = bindEmail.trim();
    if (!email) {
      showNotice.error("settings.account.bindEmailRequired");
      return;
    }
    setBindSending(true);
    const result = await sendEmailBindCode(email);
    setBindSending(false);
    if (result.success) {
      showNotice.success("settings.account.bindCodeSent");
      setBindCountdown(30);
    } else {
      showNotice.error(result.message || "settings.account.bindCodeSendFailed");
    }
  });

  const handleBindEmail = useLockFn(async () => {
    setBindSubmitting(true);
    const result = await bindEmailWithPassword(
      bindEmail.trim(),
      bindCode.trim(),
      bindPassword,
      bindPasswordConfirm,
    );
    setBindSubmitting(false);
    if (result.success) {
      showNotice.success("settings.account.bindSuccess");
      setBindOpen(false);
      setBindEmail("");
      setBindCode("");
      setBindPassword("");
      setBindPasswordConfirm("");
      await checkAuth();
    } else {
      showNotice.error(result.error || "settings.account.bindFailed");
    }
  });

  const handleChangePassword = useLockFn(async () => {
    setPwdSubmitting(true);
    const result = await changePassword(oldPassword, newPassword, newPasswordConfirm);
    setPwdSubmitting(false);
    if (result.success) {
      showNotice.success("settings.account.passwordChanged");
      setPwdOpen(false);
      setOldPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } else {
      showNotice.error(result.error || "settings.account.passwordChangeFailed");
    }
  });

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <Person fontSize="small" />
        {t("settings.account.title")}
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("settings.account.phone")}
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {user.phone || "-"}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("settings.account.email")}
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {user.email || t("settings.account.emailNotBound")}
          </Typography>
        </Box>

        {!isAdminLocal && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {!user.email_bound && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<Email />}
                onClick={() => setBindOpen(true)}
              >
                {t("settings.account.bindEmail")}
              </Button>
            )}
            {user.has_password && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<VpnKey />}
                onClick={() => setPwdOpen(true)}
              >
                {t("settings.account.changePassword")}
              </Button>
            )}
          </Box>
        )}

        <Divider />

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CardMembership fontSize="small" color="primary" />
            <Typography variant="body2" color="text.secondary">
              {t("settings.account.memberStatus")}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={getStatusText()}
            color={getStatusColor()}
            icon={
              subscription?.is_active ? (
                <CheckCircle fontSize="small" />
              ) : (
                <Warning fontSize="small" />
              )
            }
          />
        </Box>

        {subscription?.has_subscription && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <AccessTime fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {t("settings.account.expireAt")}
                </Typography>
              </Box>
              <Typography variant="body1">
                {formatExpireDate(subscription.expire_at)}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary">
                {t("settings.account.remainingDays")}
              </Typography>
              <Typography
                variant="body1"
                fontWeight="bold"
                color={subscription.remaining_days <= 7 ? "warning.main" : "success.main"}
              >
                {subscription.remaining_days} {t("settings.account.days")}
              </Typography>
            </Box>

            <Box sx={{ mt: 1 }}>
              <LinearProgress
                variant="determinate"
                value={getRemainingProgress()}
                color={subscription.remaining_days <= 7 ? "warning" : "success"}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          </>
        )}

        {!subscription?.has_subscription && (
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              backgroundColor: "warning.main",
              color: "warning.contrastText",
              textAlign: "center",
            }}
          >
            <Typography variant="body2">{t("settings.account.noSubscriptionHint")}</Typography>
          </Box>
        )}

        {subscription?.has_subscription && !subscription.is_active && (
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              backgroundColor: "error.main",
              color: "error.contrastText",
              textAlign: "center",
            }}
          >
            <Typography variant="body2">{t("settings.account.expiredHint")}</Typography>
          </Box>
        )}

        <Divider />

        <Button
          variant="outlined"
          color="error"
          startIcon={<Logout />}
          onClick={handleLogout}
          fullWidth
        >
          {t("settings.account.logout")}
        </Button>
      </Box>

      <Dialog open={bindOpen} onClose={() => setBindOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("settings.account.bindEmailTitle")}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label={t("settings.account.email")}
            value={bindEmail}
            onChange={(e) => setBindEmail(e.target.value)}
            fullWidth
            size="small"
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              label={t("settings.account.verificationCode")}
              value={bindCode}
              onChange={(e) => setBindCode(e.target.value)}
              fullWidth
              size="small"
            />
            <Button
              variant="outlined"
              onClick={handleSendBindCode}
              disabled={bindSending || bindCountdown > 0}
              sx={{ minWidth: 100, flexShrink: 0 }}
            >
              {bindSending ? (
                <CircularProgress size={18} />
              ) : bindCountdown > 0 ? (
                `${bindCountdown}s`
              ) : (
                t("settings.account.sendCode")
              )}
            </Button>
          </Box>
          <TextField
            type="password"
            label={t("settings.account.newPassword")}
            value={bindPassword}
            onChange={(e) => setBindPassword(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            type="password"
            label={t("settings.account.confirmPassword")}
            value={bindPasswordConfirm}
            onChange={(e) => setBindPasswordConfirm(e.target.value)}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBindOpen(false)}>{t("shared.actions.cancel")}</Button>
          <Button variant="contained" onClick={handleBindEmail} disabled={bindSubmitting}>
            {bindSubmitting ? <CircularProgress size={20} /> : t("settings.account.confirmBind")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("settings.account.changePasswordTitle")}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            type="password"
            label={t("settings.account.oldPassword")}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            type="password"
            label={t("settings.account.newPassword")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            type="password"
            label={t("settings.account.confirmPassword")}
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdOpen(false)}>{t("shared.actions.cancel")}</Button>
          <Button variant="contained" onClick={handleChangePassword} disabled={pwdSubmitting}>
            {pwdSubmitting ? <CircularProgress size={20} /> : t("settings.account.confirmChange")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettingAccount;
