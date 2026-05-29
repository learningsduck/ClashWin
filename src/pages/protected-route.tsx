import { Box, CircularProgress, Alert, Button, Typography } from "@mui/material";
import { Warning } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers/auth-provider";

const ALLOWED_ROUTES_WHEN_EXPIRED = ["/settings"];

export function ProtectedRoute() {
  const { t } = useTranslation();
  const { isAuthenticated, loading, subscription, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showExpiredWarning, setShowExpiredWarning] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (isAuthenticated && subscription) {
      const isExpired = !subscription.is_active && subscription.has_subscription;
      const noSub = !subscription.has_subscription;
      const isAllowedRoute = ALLOWED_ROUTES_WHEN_EXPIRED.some((r) =>
        location.pathname.startsWith(r)
      );

      if ((isExpired || noSub) && !isAllowedRoute) {
        setShowExpiredWarning(true);
      } else {
        setShowExpiredWarning(false);
      }
    }
  }, [isAuthenticated, subscription, location.pathname]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (showExpiredWarning) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          padding: 4,
          textAlign: "center",
        }}
      >
        <Warning sx={{ fontSize: 80, color: "warning.main", mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          {subscription?.has_subscription
            ? t("settings.subscription.expired.title")
            : t("settings.subscription.noSubscription.title")}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 400 }}>
          {subscription?.has_subscription
            ? t("settings.subscription.expired.description")
            : t("settings.subscription.noSubscription.description")}
        </Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="contained"
            onClick={() => navigate("/settings")}
          >
            {t("settings.subscription.goToSettings")}
          </Button>
          <Button
            variant="outlined"
            onClick={() => refreshSubscription()}
          >
            {t("settings.subscription.refresh")}
          </Button>
        </Box>
      </Box>
    );
  }

  return <Outlet />;
}
