import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { BorderGlow } from "../components/BorderGlow";
import RotatingText from "../components/RotatingText";
import ShapeBlur from "../components/ShapeBlur";
import { scrollToHashSection } from "../hooks/useHashSectionScroll";
import { changePassword } from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";

const logoStarPath =
  "M 100 -56 L 113 -28 L 146 -14 L 113 0 L 100 28 L 87 0 L 54 -14 L 87 -28 Z";
const logoInfinityPath =
  "M 32 60 C 40 39, 72 29, 100 60 C 128 91, 160 81, 168 60 C 160 39, 128 29, 100 60 C 72 91, 40 81, 32 60";

const NAV_HOVER_DELAY_MS = 400;

type NavMenuItem = {
  key: string;
  label: string;
  to: string;
  submenu?: {
    label: string;
    hash: string;
  }[];
};

export function AppLayout() {
  const { accessToken, authSummary, baseUrl, capabilities, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const displayName = profile?.display_name || profile?.username || "访客";
  const showNav = !(location.pathname === "/login" && !accessToken);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securitySummary, setSecuritySummary] = useState("");
  const [securityState, setSecurityState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const hoverTimerRef = useRef<number | null>(null);

  const navItems = useMemo<NavMenuItem[]>(() => {
    if (!accessToken) {
      return [{ key: "login", label: "登录", to: "/login" }];
    }

    const items: NavMenuItem[] = [
      { key: "overview", label: "总览", to: "/overview" },
      {
        key: "servers",
        label: "服务器",
        to: "/servers",
        submenu: [
          { label: "服务器资产", hash: "servers-assets" },
          { label: "机器上报监控", hash: "servers-agent-monitor" },
          { label: "高级资产查询", hash: "servers-advanced-query" },
        ],
      },
      {
        key: "idcs",
        label: "机房",
        to: "/idcs",
        submenu: [
          { label: "机房主数据", hash: "idcs-assets" },
          { label: "高级机房查询", hash: "idcs-advanced-query" },
        ],
      },
    ];

    if (capabilities.canManageUsers) {
      items.push({ key: "users", label: "用户", to: "/users" });
      items.push({ key: "contract", label: "契约", to: "/contract" });
    }

    items.push({
      key: "automation",
      label: "自动化",
      to: "/automation",
      submenu: [
        { label: "自动化任务", hash: "automation-tasks" },
        { label: "高级任务查询", hash: "automation-advanced-query" },
        { label: "执行交接视图", hash: "automation-handoff" },
        { label: "执行器认领监控", hash: "automation-agent-claim" },
        { label: "执行器上报监控", hash: "automation-agent-report" },
      ],
    });

    if (capabilities.canReadAudit) {
      items.push({
        key: "audit",
        label: "记录",
        to: "/audit",
        submenu: [
          { label: "操作记录", hash: "audit-records" },
          { label: "高级记录查询", hash: "audit-advanced-query" },
        ],
      });
    }

    return items;
  }, [accessToken, capabilities.canManageUsers, capabilities.canReadAudit]);

  function clearHoverTimer() {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function scheduleMenuOpen(menuKey: string) {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      setOpenMenuKey(menuKey);
      hoverTimerRef.current = null;
    }, NAV_HOVER_DELAY_MS);
  }

  function handleNavGroupEnter(item: NavMenuItem) {
    if (!item.submenu?.length) {
      clearHoverTimer();
      setOpenMenuKey(null);
      return;
    }

    if (openMenuKey === item.key) {
      return;
    }

    scheduleMenuOpen(item.key);
  }

  function handleNavGroupLeave() {
    clearHoverTimer();
    setOpenMenuKey(null);
  }

  function handleSubmenuNavigate(to: string, hash: string) {
    clearHoverTimer();
    setOpenMenuKey(null);

    const nextHash = `#${hash}`;
    if (location.pathname === to && location.hash === nextHash) {
      scrollToHashSection(hash);
      return;
    }

    navigate({ pathname: to, hash: nextHash });
  }

  useEffect(() => {
    setOpenMenuKey(null);
  }, [location.pathname, location.hash]);

  useEffect(() => () => clearHoverTimer(), []);

  function resetSecurityForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSecuritySummary("");
    setSecurityState("idle");
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityState("error");
      setSecuritySummary("两次输入的新密码不一致，请重新确认");
      return;
    }

    setSecurityState("loading");
    setSecuritySummary("正在更新当前账号密码");
    try {
      await changePassword(baseUrl, accessToken, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSecurityState("success");
      setSecuritySummary("当前账号密码已更新");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setSecurityState("error");
      setSecuritySummary(getUserFacingErrorMessage(error));
    }
  }

  return (
    <div className="app-shell">
      <div aria-hidden="true" className="ambient-blur ambient-blur-one" />
      <div aria-hidden="true" className="ambient-blur ambient-blur-two" />
      <div aria-hidden="true" className="ambient-blur ambient-blur-three" />
      <header className="workspace-header">
        <div className="workspace-brand">
          <div className="server-logo-frame" aria-hidden="true">
            <ShapeBlur
              className="server-logo-shape-blur server-logo-shape-blur-frame server-logo-shape-blur-frame-blue"
              variation={0}
              pixelRatioProp={typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1}
              shapeSize={1.005}
              roundness={0.4}
              borderSize={0.022}
              circleSize={0.22}
              circleEdge={0.82}
            />
            <ShapeBlur
              className="server-logo-shape-blur server-logo-shape-blur-frame server-logo-shape-blur-frame-magenta"
              variation={0}
              pixelRatioProp={typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1}
              shapeSize={1.005}
              roundness={0.4}
              borderSize={0.02}
              circleSize={0.18}
              circleEdge={0.78}
            />
            <div className="server-logo">
              <svg className="server-logo-svg" viewBox="0 0 200 120" aria-hidden="true">
                <defs>
                  <linearGradient id="asset-loop-gradient" x1="24" y1="60" x2="110" y2="60" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#5bb3ff" stopOpacity="0.3" />
                    <stop offset="45%" stopColor="#7dd3ff" stopOpacity="0.98" />
                    <stop offset="100%" stopColor="#dff4ff" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="ai-loop-gradient" x1="90" y1="60" x2="176" y2="60" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#ffd6f3" stopOpacity="0.9" />
                    <stop offset="48%" stopColor="#ef7cc7" stopOpacity="0.98" />
                    <stop offset="100%" stopColor="#9d7cff" stopOpacity="0.42" />
                  </linearGradient>
                  <linearGradient id="star-core-gradient" x1="54" y1="-14" x2="146" y2="-14" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#79c6ff" stopOpacity="0.92" />
                    <stop offset="48%" stopColor="#f1dcff" stopOpacity="0.98" />
                    <stop offset="100%" stopColor="#cf7df1" stopOpacity="0.92" />
                  </linearGradient>
                  <filter id="loop-soft-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4.2" />
                  </filter>
                </defs>

                <path className="server-logo-star-glow" d={logoStarPath} fill="url(#star-core-gradient)" />
                <path className="server-logo-star" d={logoStarPath} fill="url(#star-core-gradient)" />
                <ellipse className="server-logo-aura" cx="100" cy="60" rx="70" ry="28" />
                <path className="server-logo-base-path" d={logoInfinityPath} />
                <path className="server-logo-glow-path server-logo-glow-path-blue" d={logoInfinityPath} />
                <path className="server-logo-glow-path server-logo-glow-path-magenta" d={logoInfinityPath} />
                <path className="server-logo-stream server-logo-stream-blue" d={logoInfinityPath} />
                <path className="server-logo-stream server-logo-stream-magenta" d={logoInfinityPath} />
              </svg>
            </div>
          </div>
          <p className="eyebrow">Django 智能运维平台</p>
          <h1 className="brand-title-inline" aria-label="智能运维">
            <span className="brand-title-static">智能运维</span>
            <RotatingText
              animate={{ y: 0 }}
              auto
              exit={{ y: "-120%" }}
              initial={{ y: "100%" }}
              mainClassName="brand-title-rotating"
              rotationInterval={3000}
              splitLevelClassName="brand-title-rotating-segment"
              staggerDuration={0.025}
              staggerFrom="last"
              texts={["可观测", "自动化", "高可用", "可审计"]}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
            />
          </h1>
          <p className="hero-copy">
            统一承载资产巡检、任务协同与运行状态追踪，
            <br />
            帮助团队在同一工作台内完成日常运维操作与过程闭环。
          </p>
        </div>

        <div className="workspace-status">
          <BorderGlow className="hero-card">
            <span>当前用户</span>
            <strong>{displayName}</strong>
            <small>
              {profile?.email || (accessToken ? "身份已验证，可继续访问平台资源与任务。" : "登录后可访问平台完整能力与业务视图。")}
            </small>
            {accessToken ? (
              <div className="hero-card-actions">
                <button
                  className="button-ghost hero-card-button"
                  onClick={() => setSecurityModalOpen(true)}
                  type="button"
                >
                  修改密码
                </button>
              </div>
            ) : null}
          </BorderGlow>
          <BorderGlow className="hero-card">
            <span>工作区状态</span>
            <strong>{accessToken ? "已连接" : "等待登录"}</strong>
            <small>{authSummary}</small>
          </BorderGlow>
        </div>
      </header>

      {showNav ? (
        <nav className="workspace-nav">
          {navItems.map((item) =>
            item.submenu?.length ? (
              <div
                className={`nav-group${openMenuKey === item.key ? " is-open" : ""}`}
                key={item.key}
                onMouseEnter={() => handleNavGroupEnter(item)}
                onMouseLeave={handleNavGroupLeave}
              >
                <NavLink to={item.to} className={({ isActive }) => navClassName(isActive, true)}>
                  {item.label}
                </NavLink>
                <div className="nav-submenu" role="menu" aria-label={`${item.label}导航`}>
                  {item.submenu.map((entry) => (
                    <button
                      className="nav-submenu-link"
                      key={entry.hash}
                      onClick={() => handleSubmenuNavigate(item.to, entry.hash)}
                      type="button"
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <NavLink key={item.key} to={item.to} className={({ isActive }) => navClassName(isActive)}>
                {item.label}
              </NavLink>
            ),
          )}
          <div className="nav-spacer" />
          {accessToken ? (
            <button className="button-ghost" onClick={() => void signOut()} type="button">
              退出登录
            </button>
          ) : null}
        </nav>
      ) : null}

      <Outlet />

      {securityModalOpen ? (
        <div
          className="auth-modal-backdrop"
          role="presentation"
          onClick={() => {
            setSecurityModalOpen(false);
            resetSecurityForm();
          }}
        >
          <BorderGlow
            as="section"
            className="panel auth-modal-card account-security-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-heading login-register-heading">
              <h2>修改密码</h2>
              <p>更新当前账号的登录密码</p>
            </div>

            <form className="stack-grid login-register-form" onSubmit={handleChangePassword}>
              <label className="field">
                <span>当前密码</span>
                <input
                  autoComplete="current-password"
                  placeholder="请输入当前登录密码"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>

              <label className="field">
                <span>新密码</span>
                <input
                  autoComplete="new-password"
                  placeholder="请输入新的登录密码"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>

              <label className="field">
                <span>确认新密码</span>
                <input
                  autoComplete="new-password"
                  placeholder="请再次输入新的登录密码"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>

              <div className="actions login-register-actions">
                <button type="submit">保存新密码</button>
                <button
                  className="button-ghost"
                  type="button"
                  onClick={() => {
                    setSecurityModalOpen(false);
                    resetSecurityForm();
                  }}
                >
                  取消
                </button>
              </div>
            </form>

            {securityState !== "idle" ? <p className={`status ${securityState}`}>{securitySummary}</p> : null}
          </BorderGlow>
        </div>
      ) : null}
    </div>
  );
}

function navClassName(isActive: boolean, hasMenu = false) {
  return `${isActive ? "nav-link active" : "nav-link"}${hasMenu ? " nav-link-with-menu" : ""}`;
}
