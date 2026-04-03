import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { getCurrentUser, login } from "../lib/api";
import type { RequestState, UserProfile } from "../types";

const TOKEN_STORAGE_KEY = "chatops-cmdb-access-token";
const BASE_URL_STORAGE_KEY = "chatops-cmdb-base-url";
const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

type AuthContextValue = {
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  accessToken: string;
  profile: UserProfile | null;
  authState: RequestState;
  authSummary: string;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  setTokenManually: (token: string) => void;
  refreshProfile: (tokenOverride?: string, silent?: boolean) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState(defaultBaseUrl);
  const [accessToken, setAccessToken] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authState, setAuthState] = useState<RequestState>("idle");
  const [authSummary, setAuthSummary] = useState("登录后可解锁完整工作台。");

  useEffect(() => {
    const savedBaseUrl = window.localStorage.getItem(BASE_URL_STORAGE_KEY);
    const savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (savedBaseUrl) {
      setBaseUrlState(savedBaseUrl);
    }
    if (savedToken) {
      setAccessToken(savedToken);
      setAuthSummary("已从本地存储恢复访问令牌。");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (accessToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
      void refreshProfile(accessToken, true);
      return;
    }
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setProfile(null);
  }, [accessToken, baseUrl]);

  async function refreshProfile(tokenOverride?: string, silent = false) {
    const activeToken = tokenOverride || accessToken;
    if (!activeToken) {
      setProfile(null);
      setAuthState("idle");
      setAuthSummary("登录后可解锁完整工作台。");
      return;
    }

    if (!silent) {
      setAuthState("loading");
      setAuthSummary("正在刷新当前用户信息...");
    }

    try {
      const response = await getCurrentUser(baseUrl, activeToken);
      setProfile(response);
      setAuthState("success");
      setAuthSummary(`当前已认证为 ${response.display_name || response.username}。`);
    } catch (error) {
      setProfile(null);
      setAuthState("error");
      setAuthSummary((error as Error).message);
    }
  }

  async function loginWithPassword(username: string, password: string) {
    setAuthState("loading");
    setAuthSummary("正在调用 /api/v1/auth/login/ 进行认证...");
    try {
      const tokens = await login(baseUrl, username, password);
      setAccessToken(tokens.access);
      setAuthState("success");
      setAuthSummary("登录成功，正在加载当前用户信息...");
      await refreshProfile(tokens.access, true);
    } catch (error) {
      setProfile(null);
      setAuthState("error");
      setAuthSummary((error as Error).message);
      throw error;
    }
  }

  function setTokenManually(token: string) {
    setAccessToken(token);
    if (!token) {
      setProfile(null);
      setAuthState("idle");
      setAuthSummary("访问令牌已清空。");
      return;
    }
    setAuthState("idle");
    setAuthSummary("访问令牌已写入本地，可刷新用户信息验证其有效性。");
  }

  function signOut() {
    setAccessToken("");
    setProfile(null);
    setAuthState("idle");
    setAuthSummary("已退出登录。");
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
        loginWithPassword,
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
