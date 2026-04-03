import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";
import { BorderGlow } from "../components/BorderGlow";

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
          <h1 className="brand-title-lockup" aria-label="智能运维控制台">
            <span className="brand-title-row brand-title-row-top" aria-hidden="true">
              <span>智</span>
              <span>能</span>
              <span>运</span>
              <span>维</span>
            </span>
            <span className="brand-title-row brand-title-row-bottom" aria-hidden="true">
              <span>控</span>
              <span>制</span>
              <span>台</span>
            </span>
          </h1>
          <p className="hero-copy">
            面向日常资产查看、任务提报与处理进度追踪的企业工作台。界面只保留普通使用者真正需要的路径，让信息更聚焦。
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
