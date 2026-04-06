import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { GlassSelect } from "../components/GlassSelect";
import { PaginationControls } from "../components/PaginationControls";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { useResourceDetail } from "../hooks/useResourceDetail";
import { getUser, getUserRoles, getUsers, resetUserPassword, setUserRoles, updateUser } from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import type { RequestState, UserListQuery, UserProfile, UserRole } from "../types";

const initialQuery: UserListQuery = {
  page: "1",
  page_size: "20",
};

const activeStatusOptions = [
  { value: "true", label: "启用中" },
  { value: "false", label: "已停用" },
];

type UserEditForm = {
  display_name: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: string;
};

const emptyEditForm: UserEditForm = {
  display_name: "",
  email: "",
  first_name: "",
  last_name: "",
  is_active: "true",
};

export function UsersPage() {
  const { accessToken, baseUrl, capabilities } = useAuth();
  const [query, setQuery] = useState<UserListQuery>(initialQuery);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<UserEditForm>(emptyEditForm);
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [roleState, setRoleState] = useState<RequestState>("idle");
  const [roleSummary, setRoleSummary] = useState("选择账号后可分配平台角色。");
  const [editState, setEditState] = useState<RequestState>("idle");
  const [editSummary, setEditSummary] = useState("选择账号后可维护显示名称、联系方式与启用状态。");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordState, setPasswordState] = useState<RequestState>("idle");
  const [passwordSummary, setPasswordSummary] = useState("如需重置账号密码，可在此输入新的平台登录密码。");
  const userAccessToken = capabilities.canManageUsers ? accessToken : "";

  const {
    page: userPage,
    state: userListState,
    summary: userListSummary,
    refresh: refreshUsers,
  } = usePaginatedResource<UserProfile, UserListQuery>({
    accessToken: userAccessToken,
    query,
    initialSummary: "读取平台账号列表，查看当前可管理的用户信息。",
    missingTokenSummary: accessToken ? "当前账号未开通用户管理权限。" : "请先登录后再访问用户管理。",
    loadingSummary: "正在同步平台账号列表...",
    successSummary: (response) => `已加载 ${response.results.length} 个账号，共 ${response.count} 个。`,
    fetcher: (token, activeQuery) => getUsers(baseUrl, token, activeQuery),
  });

  const {
    item: selectedUser,
    state: userDetailState,
    summary: userDetailSummary,
    refresh: refreshUserDetail,
  } = useResourceDetail<UserProfile>({
    accessToken: userAccessToken,
    resourceId: selectedUserId,
    initialSummary: "请从左侧选择目标账号，以查看详细身份信息。",
    missingTokenSummary: accessToken ? "当前账号未开通用户管理权限。" : "请先登录后再查看用户详情。",
    loadingSummary: (id) => `正在加载账号 ${id} 的详细信息...`,
    successSummary: (response) => `已加载账号 ${response.username} 的详细信息。`,
    fetcher: (token, id) => getUser(baseUrl, token, id),
  });

  useEffect(() => {
    if (!userAccessToken) {
      setAvailableRoles([]);
      return;
    }

    let active = true;

    async function syncRoles() {
      try {
        const response = await getUserRoles(baseUrl, userAccessToken);
        if (!active) {
          return;
        }
        setAvailableRoles(response.items);
      } catch {
        if (!active) {
          return;
        }
        setAvailableRoles([]);
      }
    }

    void syncRoles();

    return () => {
      active = false;
    };
  }, [baseUrl, userAccessToken]);

  useEffect(() => {
    if (!selectedUser && userPage?.results.length && selectedUserId === null) {
      setSelectedUserId(userPage.results[0].id);
    }
  }, [selectedUser, selectedUserId, userPage]);

  useEffect(() => {
    if (!selectedUser) {
      setEditForm(emptyEditForm);
      setSelectedRoles([]);
      setPasswordDraft("");
      return;
    }

    setEditForm({
      display_name: selectedUser.display_name || "",
      email: selectedUser.email || "",
      first_name: selectedUser.first_name || "",
      last_name: selectedUser.last_name || "",
      is_active: selectedUser.is_active ? "true" : "false",
    });
    setSelectedRoles(selectedUser.roles || []);
    setEditState("idle");
    setEditSummary(`账号 ${selectedUser.username} 已就绪，可继续维护基础信息。`);
    setRoleState("idle");
    setRoleSummary("角色配置已同步，可继续调整权限分配。");
    setPasswordState("idle");
    setPasswordSummary("可在此重置账号登录密码。");
    setPasswordDraft("");
  }, [selectedUser]);

  const roleOptions = useMemo(
    () => availableRoles.map((role) => role.name),
    [availableRoles],
  );

  function updateQuery<K extends keyof UserListQuery>(key: K, value: UserListQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  function updateEditForm<K extends keyof UserEditForm>(key: K, value: UserEditForm[K]) {
    setEditForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleRole(roleName: string) {
    setSelectedRoles((current) =>
      current.includes(roleName) ? current.filter((item) => item !== roleName) : [...current, roleName],
    );
  }

  async function syncUserAfterMutation(userId: number) {
    const [detailResponse] = await Promise.all([
      refreshUserDetail(userId),
      refreshUsers(),
    ]);
    return detailResponse;
  }

  async function handleSaveProfile() {
    if (!userAccessToken || !selectedUser) {
      return;
    }
    setEditState("loading");
    setEditSummary(`正在保存账号 ${selectedUser.username} 的基础信息...`);
    try {
      await updateUser(baseUrl, userAccessToken, selectedUser.id, {
        display_name: editForm.display_name.trim(),
        email: editForm.email.trim(),
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        is_active: editForm.is_active === "true",
      });
      const refreshed = await syncUserAfterMutation(selectedUser.id);
      setEditState("success");
      setEditSummary(`账号 ${refreshed?.username || selectedUser.username} 的基础信息已更新。`);
    } catch (error) {
      setEditState("error");
      setEditSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleSaveRoles() {
    if (!userAccessToken || !selectedUser) {
      return;
    }
    setRoleState("loading");
    setRoleSummary(`正在更新账号 ${selectedUser.username} 的角色配置...`);
    try {
      await setUserRoles(baseUrl, userAccessToken, selectedUser.id, { roles: selectedRoles });
      const refreshed = await syncUserAfterMutation(selectedUser.id);
      setRoleState("success");
      setRoleSummary(`账号 ${refreshed?.username || selectedUser.username} 的角色配置已更新。`);
    } catch (error) {
      setRoleState("error");
      setRoleSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleResetPassword() {
    if (!userAccessToken || !selectedUser) {
      return;
    }
    if (!passwordDraft.trim()) {
      setPasswordState("error");
      setPasswordSummary("请先输入新的平台登录密码。");
      return;
    }
    setPasswordState("loading");
    setPasswordSummary(`正在重置账号 ${selectedUser.username} 的登录密码...`);
    try {
      await resetUserPassword(baseUrl, userAccessToken, selectedUser.id, { password: passwordDraft });
      setPasswordDraft("");
      setPasswordState("success");
      setPasswordSummary(`账号 ${selectedUser.username} 的登录密码已重置。`);
    } catch (error) {
      setPasswordState("error");
      setPasswordSummary(getUserFacingErrorMessage(error));
    }
  }

  const currentPage = Number(query.page || "1");
  const pageSize = Number(query.page_size || "20");

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8 panel-fit-content">
        <div className="panel-heading">
          <h2>用户管理</h2>
          <p>集中查看平台账号，并维护基础信息、启用状态与角色配置，便于管理员统一控制访问边界。</p>
        </div>

        <div className="actions">
          <button
            onClick={async () => {
              const response = await refreshUsers();
              setSelectedUserId(response?.results[0]?.id ?? null);
            }}
            type="button"
          >
            刷新账号
          </button>
        </div>

        <p className={`status ${userListState}`}>{userListSummary}</p>

        {!capabilities.canManageUsers && accessToken ? (
          <BorderGlow as="article" className="highlight-card compact-card">
            <h3>用户管理未开通</h3>
            <p>当前账号尚未配置平台管理权限，无法查看平台账号列表。如需访问该模块，请联系平台管理员开通相应权限。</p>
          </BorderGlow>
        ) : (
          <>
            <div className="table-shell">
              <table className="audit-log-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>用户名</th>
                    <th>显示名</th>
                    <th>角色</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {userPage?.results.length ? (
                    userPage.results.map((item) => (
                      <tr
                        className={item.id === selectedUser?.id ? "row-selected" : undefined}
                        key={item.id}
                        onClick={() => setSelectedUserId(item.id)}
                      >
                        <td>{item.id}</td>
                        <td>{item.username}</td>
                        <td>{item.display_name || "未设置"}</td>
                        <td>{item.roles.length ? item.roles.join(" / ") : "未分配"}</td>
                        <td>{item.is_active ? "启用中" : "已停用"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>当前暂无可展示的平台账号。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={currentPage}
              onPageChange={(page) => updateQuery("page", String(page))}
              onPageSizeChange={(size) => updateQuery("page_size", String(size))}
              page={userPage}
              pageSize={pageSize}
            />
          </>
        )}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4 panel-fit-content">
        <div className="panel-heading">
          <h2>账号详情</h2>
          <p>集中维护账号资料、角色权限与密码配置。</p>
        </div>

        <p className={`status ${userDetailState}`}>{userDetailSummary}</p>

        {!capabilities.canManageUsers && accessToken ? (
          <p className="status idle">当前账号未开通用户管理权限，无法查看账号详情。</p>
        ) : selectedUser ? (
          <div className="detail-shell">
            <dl className="profile-card detail-card">
              <div>
                <dt>ID</dt>
                <dd>{selectedUser.id}</dd>
              </div>
              <div>
                <dt>用户名</dt>
                <dd>{selectedUser.username}</dd>
              </div>
              <div>
                <dt>当前角色</dt>
                <dd>{selectedUser.roles.length ? selectedUser.roles.join(" / ") : "未分配"}</dd>
              </div>
              <div>
                <dt>账号状态</dt>
                <dd>{selectedUser.is_active ? "启用中" : "已停用"}</dd>
              </div>
            </dl>

            <BorderGlow as="article" className="compact-card stacked-detail-card">
              <h3>基础信息</h3>
              <div className="stack-grid user-management-stack">
                <label className="field">
                  <span>显示名称</span>
                  <input value={editForm.display_name} onChange={(event) => updateEditForm("display_name", event.target.value)} />
                </label>
                <label className="field">
                  <span>邮箱</span>
                  <input value={editForm.email} onChange={(event) => updateEditForm("email", event.target.value)} />
                </label>
                <label className="field">
                  <span>名</span>
                  <input value={editForm.first_name} onChange={(event) => updateEditForm("first_name", event.target.value)} />
                </label>
                <label className="field">
                  <span>姓</span>
                  <input value={editForm.last_name} onChange={(event) => updateEditForm("last_name", event.target.value)} />
                </label>
                <label className="field">
                  <span>账号状态</span>
                  <GlassSelect
                    value={editForm.is_active}
                    options={activeStatusOptions}
                    onChange={(value) => updateEditForm("is_active", value)}
                  />
                </label>
                <div className="actions">
                  <button onClick={() => void handleSaveProfile()} type="button">
                    保存基础信息
                  </button>
                </div>
              </div>
              <p className={`status ${editState}`}>{editSummary}</p>
            </BorderGlow>

            <BorderGlow as="article" className="compact-card stacked-detail-card">
              <h3>角色配置</h3>
              <div className="user-role-chip-row">
                {roleOptions.map((roleName) => {
                  const active = selectedRoles.includes(roleName);
                  return (
                    <button
                      className={`user-role-chip${active ? " is-active" : ""}`}
                      key={roleName}
                      onClick={() => toggleRole(roleName)}
                      type="button"
                    >
                      {roleName}
                    </button>
                  );
                })}
              </div>
              <div className="actions">
                <button onClick={() => void handleSaveRoles()} type="button">
                  保存角色配置
                </button>
              </div>
              <p className={`status ${roleState}`}>{roleSummary}</p>
            </BorderGlow>

            <BorderGlow as="article" className="compact-card stacked-detail-card">
              <h3>密码重置</h3>
              <div className="stack-grid">
                <label className="field">
                  <span>新密码</span>
                  <input
                    autoComplete="new-password"
                    placeholder="请输入新的平台登录密码"
                    type="password"
                    value={passwordDraft}
                    onChange={(event) => setPasswordDraft(event.target.value)}
                  />
                </label>
                <div className="actions">
                  <button onClick={() => void handleResetPassword()} type="button">
                    重置密码
                  </button>
                </div>
              </div>
              <p className={`status ${passwordState}`}>{passwordSummary}</p>
            </BorderGlow>
          </div>
        ) : null}
      </BorderGlow>
    </main>
  );
}
