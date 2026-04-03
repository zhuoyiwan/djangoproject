import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";

export function LoginPage() {
  const { accessToken, authState, authSummary, baseUrl, loginWithPassword, refreshProfile, setBaseUrl, setTokenManually } =
    useAuth();
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
      <BorderGlow as="section" className="panel panel-span-7">
        <div className="panel-heading">
          <h2>登录工作区</h2>
          <p>优先使用账号密码进入工作台。令牌和连接地址仍可保留在高级设置里，但不会占用主界面注意力。</p>
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
          <button className="login-submit-button" type="submit">
            登录
          </button>
        </form>

        <p className={`status ${authState}`}>{authSummary}</p>

        <details className="advanced-settings">
          <summary>高级连接设置</summary>
          <div className="stack-grid">
            <label className="field">
              <span>服务地址</span>
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </label>
            <label className="field">
              <span>访问令牌</span>
              <textarea rows={5} value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} />
            </label>
            <div className="actions">
              <button type="button" onClick={() => void handleTokenValidation()}>
                使用令牌登录
              </button>
              <button type="button" className="button-ghost" onClick={() => setTokenDraft("")}>
                清空令牌
              </button>
            </div>
          </div>
        </details>
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-5">
        <div className="panel-heading">
          <h2>使用说明</h2>
          <p>如果你正在使用当前仓库的本地演示环境，可以直接用下面这组账号快速进入。登录后会自动跳转到上一页或总览页。</p>
        </div>

        <dl className="profile-card">
          <div>
            <dt>演示账号</dt>
            <dd>frontenddemo</dd>
          </div>
          <div>
            <dt>演示密码</dt>
            <dd>FrontendDemo123!</dd>
          </div>
          <div>
            <dt>登录后前往</dt>
            <dd>{nextPath}</dd>
          </div>
        </dl>
      </BorderGlow>
    </main>
  );
}
