import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { BorderGlow } from "../components/BorderGlow";
import RotatingText from "../components/RotatingText";
import ShapeBlur from "../components/ShapeBlur";

const logoStarPath =
  "M 100 -56 L 113 -28 L 146 -14 L 113 0 L 100 28 L 87 0 L 54 -14 L 87 -28 Z";
const logoInfinityPath =
  "M 32 60 C 40 39, 72 29, 100 60 C 128 91, 160 81, 168 60 C 160 39, 128 29, 100 60 C 72 91, 40 81, 32 60";

export function AppLayout() {
  const { accessToken, authSummary, capabilities, profile, signOut } = useAuth();
  const location = useLocation();
  const displayName = profile?.display_name || profile?.username || "访客";
  const showNav = !(location.pathname === "/login" && !accessToken);

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
          {accessToken ? (
            <>
              <NavLink to="/overview" className={({ isActive }) => navClassName(isActive)}>
                总览
              </NavLink>
              <NavLink to="/servers" className={({ isActive }) => navClassName(isActive)}>
                服务器
              </NavLink>
              <NavLink to="/idcs" className={({ isActive }) => navClassName(isActive)}>
                机房
              </NavLink>
              {capabilities.canManageUsers ? (
                <NavLink to="/users" className={({ isActive }) => navClassName(isActive)}>
                  用户
                </NavLink>
              ) : null}
              {capabilities.canManageUsers ? (
                <NavLink to="/contract" className={({ isActive }) => navClassName(isActive)}>
                  契约
                </NavLink>
              ) : null}
              <NavLink to="/automation" className={({ isActive }) => navClassName(isActive)}>
                自动化
              </NavLink>
              {capabilities.canReadAudit ? (
                <NavLink to="/audit" className={({ isActive }) => navClassName(isActive)}>
                  记录
                </NavLink>
              ) : null}
            </>
          ) : (
            <NavLink to="/login" className={({ isActive }) => navClassName(isActive)}>
              登录
            </NavLink>
          )}
          <div className="nav-spacer" />
          {accessToken ? (
            <button className="button-ghost" onClick={signOut} type="button">
              退出登录
            </button>
          ) : null}
        </nav>
      ) : null}

      <Outlet />
    </div>
  );
}

function navClassName(isActive: boolean) {
  return isActive ? "nav-link active" : "nav-link";
}
