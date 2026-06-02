import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getCurrentUser,
  getAuthToken,
  clearAuthToken,
  logoutApi,
  getSubscription,
  type UserInfo,
  type SubscriptionInfo,
} from "@/services/auth-api";
import { showNotice } from "@/services/notice-service";
import { ensureSubscribeFromServerIfNoCache } from "@/services/subscribe-sync";

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserInfo | null;
  subscription: SubscriptionInfo | null;
  loading: boolean;
  checkAuth: () => Promise<boolean>;
  /** 登录接口成功后建立会话（避免仅 checkAuth 失败导致无反馈） */
  establishSession: (user: UserInfo) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const subscribeSyncPhoneRef = useRef<string | null>(null);

  const refreshSubscription = async () => {
    const token = getAuthToken();
    if (!token) {
      setSubscription(null);
      return;
    }
    try {
      const result = await getSubscription();
      if (result.success && result.subscription) {
        setSubscription(result.subscription);
      }
    } catch {
      // ignore
    }
  };

  const establishSession = async (sessionUser: UserInfo) => {
    setIsAuthenticated(true);
    setUser(sessionUser);
    setLoading(false);
    await refreshSubscription();
  };

  const checkAuth = async (): Promise<boolean> => {
    const token = getAuthToken();
    if (!token) {
      setIsAuthenticated(false);
      setUser(null);
      setSubscription(null);
      setLoading(false);
      return false;
    }
    const AUTH_CHECK_TIMEOUT_MS = 5000;
    try {
      const result = await Promise.race([
        getCurrentUser(),
        new Promise<{ success: false; error?: string; code?: string }>((resolve) =>
          setTimeout(
            () => resolve({ success: false, error: "连接认证服务器超时（5 秒）", code: "NETWORK_ERROR" }),
            AUTH_CHECK_TIMEOUT_MS,
          ),
        ),
      ]);
      if (result.success && result.user) {
        await establishSession(result.user);
        return true;
      }
      setIsAuthenticated(false);
      setUser(null);
      setSubscription(null);
      if ("code" in result && result.code === "SESSION_REPLACED") {
        showNotice.error("auth.login.messages.sessionReplaced");
      }
      return false;
    } catch {
      setIsAuthenticated(false);
      setUser(null);
      setSubscription(null);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await logoutApi();
    setIsAuthenticated(false);
    setUser(null);
    setSubscription(null);
  };

  useEffect(() => {
    checkAuth();
    // 定期检查（每 5 分钟），用于检测是否被踢线
    const interval = setInterval(() => {
      if (isAuthenticated) {
        checkAuth();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      subscribeSyncPhoneRef.current = null;
      return;
    }
    if (!user?.id || loading) return;
    const syncKey = String(user.id);
    if (subscribeSyncPhoneRef.current === syncKey) return;
    subscribeSyncPhoneRef.current = syncKey;
    // 登录后检测本机是否有订阅配置，无则从服务器拉取
    void ensureSubscribeFromServerIfNoCache(user);
  }, [isAuthenticated, user?.id, loading]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        subscription,
        loading,
        checkAuth,
        establishSession,
        refreshSubscription,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
