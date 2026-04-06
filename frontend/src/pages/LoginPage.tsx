import { FormEvent, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Network, Sparkles, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { AnimatedCharactersLoginArt } from "../components/AnimatedCharactersLoginArt";
import { confirmPasswordReset, requestPasswordReset } from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";

export function LoginPage() {
  const {
    accessToken,
    authState,
    authSummary,
    baseUrl,
    loginWithPassword,
    registerWithPassword,
    refreshProfile,
    setBaseUrl,
    setTokenManually,
  } = useAuth();

  const [username, setUsername] = useState("frontenddemo");
  const [password, setPassword] = useState("FrontendDemo123!");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(accessToken);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerDisplayName, setRegisterDisplayName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [registerSummary, setRegisterSummary] = useState("");
  const [registerState, setRegisterState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [passwordAssistOpen, setPasswordAssistOpen] = useState(false);
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetAccount, setResetAccount] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [resetConfirmPasswordVisible, setResetConfirmPasswordVisible] = useState(false);
  const [resetSummary, setResetSummary] = useState("");
  const [resetState, setResetState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [focusPulse, setFocusPulse] = useState(0);
  const [fieldFocused, setFieldFocused] = useState(false);

  const navigate = useNavigate();
  const nextPath = "/overview";

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

  function resetRegisterForm() {
    setRegisterUsername("");
    setRegisterDisplayName("");
    setRegisterEmail("");
    setRegisterPassword("");
    setRegisterPasswordConfirm("");
    setRegisterPasswordVisible(false);
    setRegisterState("idle");
    setRegisterSummary("");
  }

  function resetPasswordAssistForm() {
    setResetStep("request");
    setResetAccount("");
    setResetToken("");
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetPasswordVisible(false);
    setResetConfirmPasswordVisible(false);
    setResetState("idle");
    setResetSummary("");
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (registerPassword !== registerPasswordConfirm) {
      setRegisterState("error");
      setRegisterSummary("两次输入的密码不一致，请重新确认");
      return;
    }

    setRegisterState("loading");
    setRegisterSummary("正在创建账号并初始化登录上下文");

    try {
      await registerWithPassword({
        username: registerUsername,
        display_name: registerDisplayName.trim() || undefined,
        email: registerEmail.trim() || undefined,
        password: registerPassword,
      });
      setRegisterState("success");
      setRegisterSummary("账号创建成功，正在进入工作台");
      setRegisterOpen(false);
      resetRegisterForm();
      navigate(nextPath, { replace: true });
    } catch (error) {
      setRegisterState("error");
      setRegisterSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handlePasswordResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetState("loading");
    setResetSummary("正在提交重置申请");

    try {
      const response = await requestPasswordReset(baseUrl, { account: resetAccount.trim() });
      setResetState("success");
      setResetStep("confirm");
      if (response.reset_token) {
        setResetToken(response.reset_token);
        setResetSummary("已生成重置令牌，请继续设置新密码");
      } else {
        setResetSummary("重置指引已发送，请录入令牌后继续");
      }
    } catch (error) {
      setResetState("error");
      setResetSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handlePasswordResetConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (resetPassword !== resetPasswordConfirm) {
      setResetState("error");
      setResetSummary("两次输入的新密码不一致，请重新确认");
      return;
    }

    setResetState("loading");
    setResetSummary("正在重置登录密码");

    try {
      await confirmPasswordReset(baseUrl, {
        token: resetToken.trim(),
        new_password: resetPassword,
      });
      setResetState("success");
      setResetSummary("密码已更新，请返回登录页使用新密码登录");
      setResetPassword("");
      setResetPasswordConfirm("");
    } catch (error) {
      setResetState("error");
      setResetSummary(getUserFacingErrorMessage(error));
    }
  }

  function handleCredentialFocus() {
    setFieldFocused(true);
    setFocusPulse((value) => value + 1);
  }

  function handleCredentialBlur() {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement) || !activeElement.closest("[data-login-form='true']")) {
        setFieldFocused(false);
      }
    });
  }

  return (
    <>
      <main className="login-shell">
        <section className="login-split-panel">
          <BorderGlow as="section" className="login-art-panel">
            <AnimatedCharactersLoginArt
              focusPulse={focusPulse}
              hasPassword={password.length > 0}
              isFieldFocused={fieldFocused}
              isPasswordVisible={passwordVisible}
            />
          </BorderGlow>

          <div className="login-auth-column">
            <BorderGlow as="section" className="panel login-auth-card">
              <div className="login-auth-header">
                <span className="login-auth-eyebrow">
                  <Sparkles size={14} strokeWidth={2.2} />
                  统一认证入口
                </span>
                <h2>登录平台</h2>
                <p>通过统一认证入口进入智能运维平台，完成资产查看、任务处理与审计留痕访问。</p>
              </div>

              <form className="stack-grid login-modern-form" data-login-form="true" onSubmit={handleLogin}>
                <label className="field login-field">
                  <span>
                    <UserRound size={16} strokeWidth={2.15} />
                    用户名
                  </span>
                  <input
                    placeholder="请输入平台账号"
                    value={username}
                    onBlur={handleCredentialBlur}
                    onChange={(event) => setUsername(event.target.value)}
                    onFocus={handleCredentialFocus}
                  />
                  <small className="field-hint">演示账号：frontenddemo</small>
                </label>

                <label className="field login-field">
                  <span>
                    <LockKeyhole size={16} strokeWidth={2.15} />
                    密码
                  </span>
                  <span className="password-field login-password-field">
                    <input
                      autoComplete="current-password"
                      className="password-input"
                      placeholder="请输入登录密码"
                      type={passwordVisible ? "text" : "password"}
                      value={password}
                      onBlur={handleCredentialBlur}
                      onChange={(event) => setPassword(event.target.value)}
                      onFocus={handleCredentialFocus}
                    />
                    <button
                      aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                      className="password-toggle-icon"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setPasswordVisible((current) => !current)}
                      type="button"
                    >
                      {passwordVisible ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                    </button>
                  </span>
                  <div className="login-password-meta">
                    <small className="field-hint">演示密码：FrontendDemo123!</small>
                    <button
                      className="button-link login-text-action"
                      type="button"
                      onClick={() => setPasswordAssistOpen(true)}
                    >
                      忘记密码
                    </button>
                  </div>
                </label>

                <div className="actions login-modern-actions">
                  <button className="login-primary-action" type="submit">
                    登录
                  </button>
                  <button className="button-ghost login-secondary-action" type="button" onClick={() => setRegisterOpen(true)}>
                    注册
                  </button>
                </div>
              </form>

              {authState !== "idle" ? <p className={`status ${authState}`}>{authSummary}</p> : null}

              <details className="advanced-settings login-advanced-settings">
                <summary className="advanced-settings-toggle">
                  <span className="advanced-settings-title">高级连接设置</span>
                  <span className="advanced-settings-button" aria-hidden="true">
                    <span className="advanced-settings-button-label advanced-settings-button-label-open">展开</span>
                    <span className="advanced-settings-button-label advanced-settings-button-label-close">收起</span>
                    <span className="advanced-settings-chevron" />
                  </span>
                </summary>

                <div className="stack-grid login-advanced-grid">
                  <label className="field login-field">
                    <span>
                      <Network size={16} strokeWidth={2.15} />
                      服务地址
                    </span>
                    <input
                      placeholder="例如：http://127.0.0.1:8000"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                    />
                    <small className="field-hint">本地开发环境可使用 `http://127.0.0.1:8000`</small>
                  </label>

                  <label className="field login-field">
                    <span>访问令牌</span>
                    <textarea
                      placeholder="请输入访问令牌，用于临时接入或调试验证"
                      rows={4}
                      value={tokenDraft}
                      onChange={(event) => setTokenDraft(event.target.value)}
                    />
                    <small className="field-hint">适用于切换测试身份、验证接口权限或临时接入指定环境</small>
                  </label>

                  <div className="actions login-advanced-actions">
                    <button type="button" onClick={() => void handleTokenValidation()}>
                      使用令牌登录
                    </button>
                    <button className="button-ghost" type="button" onClick={() => setTokenDraft("")}>
                      清空令牌
                    </button>
                  </div>
                </div>
              </details>
            </BorderGlow>

            <BorderGlow as="section" className="panel login-access-card">
              <div className="login-access-heading">
                <h3>访问说明</h3>
                <p>
                  提供本地演示环境账号，
                  <br />
                  用于快速验证登录流程与界面交互。
                </p>
              </div>

              <dl className="profile-card login-access-grid">
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
          </div>
        </section>
      </main>

      {registerOpen ? (
        <div
          className="auth-modal-backdrop"
          role="presentation"
          onClick={() => {
            setRegisterOpen(false);
            resetRegisterForm();
          }}
        >
          <BorderGlow
            as="section"
            className="panel auth-modal-card login-register-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-heading login-register-heading">
              <h2>注册账号</h2>
              <p>创建平台账号后，系统将自动完成认证并进入当前工作区。</p>
            </div>

            <form className="stack-grid login-register-form" onSubmit={handleRegister}>
              <label className="field">
                <span>用户名</span>
                <input
                  placeholder="例如：ops_user_01"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                />
              </label>

              <label className="field">
                <span>显示名称</span>
                <input
                  placeholder="例如：张三"
                  value={registerDisplayName}
                  onChange={(event) => setRegisterDisplayName(event.target.value)}
                />
              </label>

              <label className="field">
                <span>邮箱</span>
                <input
                  placeholder="例如：ops@example.com"
                  value={registerEmail}
                  onChange={(event) => setRegisterEmail(event.target.value)}
                />
              </label>

              <label className="field">
                <span>登录密码</span>
                <span className="password-field">
                  <input
                    autoComplete="new-password"
                    className="password-input"
                    placeholder="至少 8 位"
                    type={registerPasswordVisible ? "text" : "password"}
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                  />
                  <button
                    aria-label={registerPasswordVisible ? "隐藏密码" : "显示密码"}
                    className="password-toggle-icon"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setRegisterPasswordVisible((current) => !current)}
                    type="button"
                  >
                    {registerPasswordVisible ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                  </button>
                </span>
              </label>

              <label className="field">
                <span>确认密码</span>
                <input
                  autoComplete="new-password"
                  placeholder="再次输入登录密码"
                  type={registerPasswordVisible ? "text" : "password"}
                  value={registerPasswordConfirm}
                  onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                />
              </label>

              <div className="actions login-register-actions">
                <button type="submit">创建并登录</button>
                <button
                  className="button-ghost"
                  type="button"
                  onClick={() => {
                    setRegisterOpen(false);
                    resetRegisterForm();
                  }}
                >
                  取消
                </button>
              </div>
            </form>

            {registerState !== "idle" ? <p className={`status ${registerState}`}>{registerSummary}</p> : null}
          </BorderGlow>
        </div>
      ) : null}

      {passwordAssistOpen ? (
        <div
          className="auth-modal-backdrop"
          role="presentation"
          onClick={() => {
            setPasswordAssistOpen(false);
            resetPasswordAssistForm();
          }}
        >
          <BorderGlow
            as="section"
            className="panel auth-modal-card login-password-assist-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-heading login-register-heading">
              <h2>{resetStep === "request" ? "重置密码" : "设置新密码"}</h2>
              <p>
                {resetStep === "request"
                  ? "提交账号标识后继续完成密码重置"
                  : "录入重置令牌并设置新的平台登录密码"}
              </p>
            </div>

            {resetStep === "request" ? (
              <form className="stack-grid login-register-form" onSubmit={handlePasswordResetRequest}>
                <label className="field">
                  <span>账号或邮箱</span>
                  <input
                    placeholder="请输入平台账号或邮箱"
                    value={resetAccount}
                    onChange={(event) => setResetAccount(event.target.value)}
                  />
                </label>

                <div className="actions login-register-actions">
                  <button type="submit">发送重置指引</button>
                  <button
                    className="button-ghost"
                    type="button"
                    onClick={() => {
                      setPasswordAssistOpen(false);
                      resetPasswordAssistForm();
                    }}
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : (
              <form className="stack-grid login-register-form" onSubmit={handlePasswordResetConfirm}>
                <label className="field">
                  <span>重置令牌</span>
                  <textarea
                    className="login-token-field"
                    placeholder="请输入重置令牌"
                    rows={4}
                    value={resetToken}
                    onChange={(event) => setResetToken(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>新密码</span>
                  <span className="password-field">
                    <input
                      autoComplete="new-password"
                      className="password-input"
                      placeholder="请输入新的登录密码"
                      type={resetPasswordVisible ? "text" : "password"}
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                    />
                    <button
                      aria-label={resetPasswordVisible ? "隐藏密码" : "显示密码"}
                      className="password-toggle-icon"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setResetPasswordVisible((current) => !current)}
                      type="button"
                    >
                      {resetPasswordVisible ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                    </button>
                  </span>
                </label>

                <label className="field">
                  <span>确认新密码</span>
                  <span className="password-field">
                    <input
                      autoComplete="new-password"
                      className="password-input"
                      placeholder="请再次输入新的登录密码"
                      type={resetConfirmPasswordVisible ? "text" : "password"}
                      value={resetPasswordConfirm}
                      onChange={(event) => setResetPasswordConfirm(event.target.value)}
                    />
                    <button
                      aria-label={resetConfirmPasswordVisible ? "隐藏密码" : "显示密码"}
                      className="password-toggle-icon"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setResetConfirmPasswordVisible((current) => !current)}
                      type="button"
                    >
                      {resetConfirmPasswordVisible ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                    </button>
                  </span>
                </label>

                <div className="actions login-register-actions">
                  <button type="submit">更新密码</button>
                  <button className="button-ghost" type="button" onClick={() => setResetStep("request")}>
                    返回上一步
                  </button>
                </div>
              </form>
            )}

            {resetState !== "idle" ? <p className={`status ${resetState}`}>{resetSummary}</p> : null}
          </BorderGlow>
        </div>
      ) : null}

    </>
  );
}
