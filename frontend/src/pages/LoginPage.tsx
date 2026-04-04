import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";

export function LoginPage() {
  const { accessToken, authState, authSummary, baseUrl, loginWithPassword, refreshProfile, setBaseUrl, setTokenManually } =
    useAuth();
  const [username, setUsername] = useState("frontenddemo");
  const [password, setPassword] = useState("FrontendDemo123!");
  const [passwordVisible, setPasswordVisible] = useState(false);
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
          <h2>登录平台</h2>
          <p>通过统一认证入口访问平台能力。默认使用账号密码完成身份校验；如需切换接入地址或使用访问令牌，可在高级连接设置中进行配置。</p>
        </div>

        <form className="form-grid" onSubmit={handleLogin}>
          <label className="field">
            <span>用户名</span>
            <input placeholder="例如：ops_admin" value={username} onChange={(event) => setUsername(event.target.value)} />
            <small className="field-hint">示例账号：frontenddemo</small>
          </label>
          <label className="field">
            <span>密码</span>
            <span className="password-field">
              <input
                autoComplete="current-password"
                className="password-input"
                placeholder="请输入登录密码"
                type={passwordVisible ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                className="password-toggle-icon"
                onClick={() => setPasswordVisible((current) => !current)}
                type="button"
              >
                {passwordVisible ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
                    <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4.91c5.09 0 8.94 3.22 10 7.09a11.83 11.83 0 0 1-4.25 5.94" />
                    <path d="M6.61 6.61A11.79 11.79 0 0 0 2 12c.9 3.31 3.82 6.12 7.62 6.92" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M2 12s3.64-7 10-7 10 7 10 7-3.64 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </span>
            <small className="field-hint">示例密码：FrontendDemo123!</small>
          </label>
          <button className="login-submit-button" type="submit">
            登录
          </button>
        </form>

        <p className={`status ${authState}`}>{authSummary}</p>

        <details className="advanced-settings">
          <summary className="advanced-settings-toggle">
            <span className="advanced-settings-title">高级连接设置</span>
            <span className="advanced-settings-button" aria-hidden="true">
              <span className="advanced-settings-button-label advanced-settings-button-label-open">展开</span>
              <span className="advanced-settings-button-label advanced-settings-button-label-close">收起</span>
              <span className="advanced-settings-chevron" />
            </span>
          </summary>
          <div className="stack-grid">
            <label className="field">
              <span>服务地址</span>
              <input
                placeholder="例如：http://127.0.0.1:8000"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
              <small className="field-hint">示例：本地开发环境可使用 `http://127.0.0.1:8000`</small>
            </label>
            <label className="field">
              <span>访问令牌</span>
              <textarea
                placeholder="例如：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                rows={5}
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
              />
              <small className="field-hint">适用于临时验证、调试接入或切换测试身份。</small>
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
          <h2>访问说明</h2>
          <p>当前页面提供本地演示环境的标准测试账号，可用于验证登录流程与前端交互。认证完成后，系统将自动返回上一次访问页面或进入平台总览。</p>
        </div>

        <dl className="profile-card">
          <div>
            <dt>测试账号</dt>
            <dd>frontenddemo</dd>
          </div>
          <div>
            <dt>测试密码</dt>
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
