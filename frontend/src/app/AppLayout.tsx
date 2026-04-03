import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";

export function AppLayout() {
  const { accessToken, authSummary, baseUrl, profile, refreshProfile, setBaseUrl, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="workspace-header">
        <div className="workspace-brand">
          <p className="eyebrow">Django 智能运维前端</p>
          <h1>契约驱动工作台</h1>
          <p className="hero-copy">
            面向 CMDB、自动化执行与审计联调的前端外壳。保留健康探测、只读查询面和角色敏感路径，持续对齐当前 Django 后端文档。
          </p>
        </div>

        <div className="workspace-status">
          <div className="hero-card">
            <span>后端目标</span>
            <label className="inline-field">
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </label>
            <small>{authSummary}</small>
          </div>
          <div className="hero-card">
            <span>当前身份</span>
            <strong>{profile?.display_name || profile?.username || "访客模式"}</strong>
            <small>{profile?.email || (accessToken ? "访问令牌已加载" : "尚未登录")}</small>
          </div>
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
          审计
        </NavLink>
        <NavLink to="/contract" className={({ isActive }) => navClassName(isActive)}>
          契约
        </NavLink>
        {!accessToken ? (
          <NavLink to="/login" className={({ isActive }) => navClassName(isActive)}>
            登录
          </NavLink>
        ) : null}
        <div className="nav-spacer" />
        {accessToken ? (
          <>
            <button className="button-ghost" onClick={() => void refreshProfile()} type="button">
              刷新身份
            </button>
            <button className="button-ghost" onClick={signOut} type="button">
              退出登录
            </button>
          </>
        ) : null}
      </nav>

      <Outlet />
    </div>
  );
}

function navClassName(isActive: boolean) {
  return isActive ? "nav-link active" : "nav-link";
}
