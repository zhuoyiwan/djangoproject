import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";

export function LoginPage() {
  const { accessToken, authState, authSummary, loginWithPassword, refreshProfile, setTokenManually } = useAuth();
  const [username, setUsername] = useState("frontenddemo");
  const [password, setPassword] = useState("FrontendDemo123!");
  const [tokenDraft, setTokenDraft] = useState(accessToken);
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = typeof location.state?.from === "string" ? location.state.from : "/overview";

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await loginWithPassword(username, password);
      navigate(nextPath, { replace: true });
    } catch {
      return;
    }
  }

  async function handleTokenValidation() {
    setTokenManually(tokenDraft);
    try {
      await refreshProfile(tokenDraft);
      navigate("/overview", { replace: true });
    } catch {
      return;
    }
  }

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-7">
        <div className="panel-heading">
          <h2>登录工作区</h2>
          <p>可以直接用后端账号登录，也可以粘贴已有访问令牌。默认演示账号与当前仓库的本地联调种子保持一致。</p>
        </div>

        <form className="form-grid" onSubmit={handleLogin}>
          <label className="field">
            <span>用户名</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit">登录</button>
        </form>

        <label className="field stacked-field">
          <span>访问令牌</span>
          <textarea rows={5} value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} />
        </label>

        <div className="actions">
          <button type="button" onClick={() => void handleTokenValidation()}>
            验证令牌
          </button>
          <button type="button" className="button-ghost" onClick={() => setTokenDraft("")}>
            清空草稿
          </button>
        </div>

        <p className={`status ${authState}`}>{authSummary}</p>
      </section>

      <section className="panel panel-span-5">
        <div className="panel-heading">
          <h2>本地演示入口</h2>
          <p>当前仓库已经提供一组可直接联调的演示账号，适合快速验证前端路由与接口连通性。</p>
        </div>

        <dl className="profile-card">
          <div>
            <dt>用户名</dt>
            <dd>frontenddemo</dd>
          </div>
          <div>
            <dt>密码</dt>
            <dd>FrontendDemo123!</dd>
          </div>
          <div>
            <dt>登录后跳转</dt>
            <dd>{nextPath}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
