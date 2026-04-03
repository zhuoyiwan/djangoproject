import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";
import { BorderGlow } from "../components/BorderGlow";
import RotatingText from "../components/RotatingText";

export function AppLayout() {
  const { accessToken, authSummary, profile, signOut } = useAuth();
  const displayName = profile?.display_name || profile?.username || "访客";

  return (
    <div className="app-shell">
      <div aria-hidden="true" className="ambient-blur ambient-blur-one" />
      <div aria-hidden="true" className="ambient-blur ambient-blur-two" />
      <div aria-hidden="true" className="ambient-blur ambient-blur-three" />
      <header className="workspace-header">
        <div className="workspace-brand">
          <p className="eyebrow">Django 智能运维前端</p>
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
            <small>{profile?.email || (accessToken ? "已登录，可继续查看资源与任务。" : "登录后可进入完整工作台。")}</small>
          </BorderGlow>
          <BorderGlow className="hero-card">
            <span>工作区状态</span>
            <strong>{accessToken ? "已连接" : "等待登录"}</strong>
            <small>{authSummary}</small>
          </BorderGlow>
        </div>
      </header>

      <nav className="workspace-nav">
        <NavLink to="/overview" className={({ isActive }) => navClassName(isActive)}>
          总览
        </NavLink>
        <NavLink to="/servers" className={({ isActive }) => navClassName(isActive)}>
          服务器
        </NavLink>
        <NavLink to="/automation" className={({ isActive }) => navClassName(isActive)}>
          自动化
        </NavLink>
        <NavLink to="/audit" className={({ isActive }) => navClassName(isActive)}>
          记录
        </NavLink>
        {!accessToken ? (
          <NavLink to="/login" className={({ isActive }) => navClassName(isActive)}>
            登录
          </NavLink>
        ) : null}
        <div className="nav-spacer" />
        {accessToken ? (
          <button className="button-ghost" onClick={signOut} type="button">
            退出登录
          </button>
        ) : null}
      </nav>

      <Outlet />
    </div>
  );
}

function navClassName(isActive: boolean) {
  return isActive ? "nav-link active" : "nav-link";
}
