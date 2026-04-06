import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { getUserFacingErrorMessage } from "../lib/errors";
import {
  getCurrentUser,
  login,
  register,
  probeAuditReadAccess,
  probeAutomationApproveAccess,
  probeAutomationExecuteAccess,
  probeAutomationWriteAccess,
  refreshAccessToken,
  probeServerWriteAccess,
  probeUserAdminAccess,
} from "../lib/api";
import type { FrontendCapabilities, RequestState, UserProfile } from "../types";
import type { RegisterInput } from "../types";

const TOKEN_STORAGE_KEY = "chatops-cmdb-access-token";
const REFRESH_TOKEN_STORAGE_KEY = "chatops-cmdb-refresh-token";
const BASE_URL_STORAGE_KEY = "chatops-cmdb-base-url";
const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ACCESS_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const MIN_REFRESH_DELAY_MS = 15 * 1000;

type AuthContextValue = {
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  accessToken: string;
  profile: UserProfile | null;
  authState: RequestState;
  authSummary: string;
  capabilityState: RequestState;
  capabilities: FrontendCapabilities;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  registerWithPassword: (payload: RegisterInput) => Promise<void>;
  setTokenManually: (token: string) => void;
  refreshProfile: (tokenOverride?: string, silent?: boolean) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const emptyCapabilities: FrontendCapabilities = {
  canReadAudit: false,
  canManageUsers: false,
  canWriteServers: false,
  canWriteAutomation: false,
  canApproveAutomation: false,
  canExecuteAutomation: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState(defaultBaseUrl);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authState, setAuthState] = useState<RequestState>("idle");
  const [authSummary, setAuthSummary] = useState("登录后可访问平台完整能力与业务视图。");
  const [capabilityState, setCapabilityState] = useState<RequestState>("idle");
  const [capabilities, setCapabilities] = useState<FrontendCapabilities>(emptyCapabilities);

  useEffect(() => {
    const savedBaseUrl = window.localStorage.getItem(BASE_URL_STORAGE_KEY);
    const savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const savedRefreshToken = window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (savedBaseUrl) {
      setBaseUrlState(savedBaseUrl);
    }
    if (savedToken) {
      setAccessToken(savedToken);
      setAuthSummary("已恢复上次认证状态，正在准备平台访问上下文。");
    }
    if (savedRefreshToken) {
      setRefreshToken(savedRefreshToken);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (refreshToken) {
      window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
      return;
    }
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }, [refreshToken]);

  useEffect(() => {
    if (accessToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
      void refreshProfile(accessToken, true);
      return;
    }
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setProfile(null);
    setCapabilities(emptyCapabilities);
    setCapabilityState("idle");
  }, [accessToken, baseUrl]);

  useEffect(() => {
    if (!accessToken || !refreshToken) {
      return;
    }

    const expiresAt = getJwtExpiry(accessToken);
    if (!expiresAt) {
      return;
    }

    const refreshDelay = Math.max(expiresAt - Date.now() - ACCESS_REFRESH_BUFFER_MS, MIN_REFRESH_DELAY_MS);
    const timerId = window.setTimeout(() => {
      void renewAccessToken();
    }, refreshDelay);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [accessToken, refreshToken, baseUrl]);

  async function refreshProfile(tokenOverride?: string, silent = false) {
    const activeToken = tokenOverride || accessToken;
    if (!activeToken) {
      setProfile(null);
      setAuthState("idle");
      setAuthSummary("登录后可访问平台完整能力与业务视图。");
      return;
    }

    if (!silent) {
      setAuthState("loading");
      setAuthSummary("正在同步当前账号信息与访问上下文...");
    }

    try {
      const response = await getCurrentUser(baseUrl, activeToken);
      setProfile(response);
      setAuthState("success");
      setAuthSummary(`当前身份：${response.display_name || response.username}。`);
      void syncCapabilities(activeToken);
    } catch (error) {
      setProfile(null);
      setAuthState("error");
      setAuthSummary(getUserFacingErrorMessage(error));
      setCapabilities(emptyCapabilities);
      setCapabilityState("error");
    }
  }

  async function syncCapabilities(tokenOverride?: string) {
    const activeToken = tokenOverride || accessToken;
    if (!activeToken) {
      setCapabilities(emptyCapabilities);
      setCapabilityState("idle");
      return;
    }

    setCapabilityState("loading");
    try {
      const [
        canReadAudit,
        canManageUsers,
        canWriteServers,
        canWriteAutomation,
        canApproveAutomation,
        canExecuteAutomation,
      ] = await Promise.all([
        probeAuditReadAccess(baseUrl, activeToken),
        probeUserAdminAccess(baseUrl, activeToken),
        probeServerWriteAccess(baseUrl, activeToken),
        probeAutomationWriteAccess(baseUrl, activeToken),
        probeAutomationApproveAccess(baseUrl, activeToken),
        probeAutomationExecuteAccess(baseUrl, activeToken),
      ]);

      setCapabilities({
        canReadAudit,
        canManageUsers,
        canWriteServers,
        canWriteAutomation,
        canApproveAutomation,
        canExecuteAutomation,
      });
      setCapabilityState("success");
    } catch {
      setCapabilities(emptyCapabilities);
      setCapabilityState("error");
    }
  }

  async function loginWithPassword(username: string, password: string) {
    setAuthState("loading");
    setAuthSummary("正在验证身份信息...");
    try {
      const tokens = await login(baseUrl, username, password);
      setAccessToken(tokens.access);
      setRefreshToken(tokens.refresh);
      setAuthState("success");
      setAuthSummary("认证成功，正在加载平台访问上下文...");
      await refreshProfile(tokens.access, true);
    } catch (error) {
      setProfile(null);
      setAuthState("error");
      setAuthSummary(getUserFacingErrorMessage(error));
      throw error;
    }
  }

  function setTokenManually(token: string) {
    setAccessToken(token);
    setRefreshToken("");
    if (!token) {
      setProfile(null);
      setAuthState("idle");
      setAuthSummary("访问令牌已清除。");
      setCapabilities(emptyCapabilities);
      setCapabilityState("idle");
      return;
    }
    setAuthState("idle");
    setAuthSummary("访问令牌已保存，可继续校验其有效性。");
  }

  async function registerWithPassword(payload: RegisterInput) {
    setAuthState("loading");
    setAuthSummary("正在创建账号并初始化访问上下文...");
    try {
      await register(baseUrl, payload);
      const tokens = await login(baseUrl, payload.username, payload.password);
      setAccessToken(tokens.access);
      setRefreshToken(tokens.refresh);
      setAuthState("success");
      setAuthSummary("账号创建成功，正在加载平台访问上下文...");
      await refreshProfile(tokens.access, true);
    } catch (error) {
      setProfile(null);
      setAuthState("error");
      setAuthSummary(getUserFacingErrorMessage(error));
      throw error;
    }
  }

  function signOut() {
    setAccessToken("");
    setRefreshToken("");
    setProfile(null);
    setAuthState("idle");
    setAuthSummary("当前身份已安全退出。");
    setCapabilities(emptyCapabilities);
    setCapabilityState("idle");
  }

  async function renewAccessToken() {
    if (!refreshToken) {
      return;
    }

    try {
      const tokens = await refreshAccessToken(baseUrl, refreshToken);
      setAccessToken(tokens.access);
      if (tokens.refresh) {
        setRefreshToken(tokens.refresh);
      }
    } catch {
      signOut();
    }
  }

  function setBaseUrl(value: string) {
    setBaseUrlState(value);
  }

  return (
    <AuthContext.Provider
      value={{
        baseUrl,
        setBaseUrl,
        accessToken,
        profile,
        authState,
        authSummary,
        capabilityState,
        capabilities,
        loginWithPassword,
        registerWithPassword,
        setTokenManually,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内使用。");
  }
  return context;
}

function getJwtExpiry(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(padded)) as { exp?: number };
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}
