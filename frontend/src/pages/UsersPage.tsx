import { useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { PaginationControls } from "../components/PaginationControls";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { useResourceDetail } from "../hooks/useResourceDetail";
import { getUser, getUsers } from "../lib/api";
import type { UserListQuery, UserProfile } from "../types";

const initialQuery: UserListQuery = {
  page: "1",
  page_size: "20",
};

export function UsersPage() {
  const { accessToken, baseUrl, capabilities } = useAuth();
  const [query, setQuery] = useState<UserListQuery>(initialQuery);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
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
  } = useResourceDetail<UserProfile>({
    accessToken: userAccessToken,
    resourceId: selectedUserId,
    initialSummary: "请从左侧选择目标账号，以查看详细身份信息。",
    missingTokenSummary: accessToken ? "当前账号未开通用户管理权限。" : "请先登录后再查看用户详情。",
    loadingSummary: (id) => `正在加载账号 ${id} 的详细信息...`,
    successSummary: (response) => `已加载账号 ${response.username} 的详细信息。`,
    fetcher: (token, id) => getUser(baseUrl, token, id),
  });

  function updateQuery<K extends keyof UserListQuery>(key: K, value: UserListQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  const currentPage = Number(query.page || "1");
  const pageSize = Number(query.page_size || "20");

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8">
        <div className="panel-heading">
          <h2>用户管理</h2>
          <p>提供平台账号只读视图，便于管理员核对当前账号标识、显示名称与联系方式。</p>
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
                    <th>邮箱</th>
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
                        <td>{item.email || "未设置"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>当前暂无可展示的平台账号。</td>
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
          <p>展示账号的基础身份信息，便于快速核对平台内的用户标识与联系信息。</p>
        </div>

        <p className={`status ${userDetailState}`}>{userDetailSummary}</p>

        {!capabilities.canManageUsers && accessToken ? (
          <p className="status idle">当前账号未开通用户管理权限，无法查看账号详情。</p>
        ) : selectedUser ? (
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
              <dt>显示名</dt>
              <dd>{selectedUser.display_name || "未设置"}</dd>
            </div>
            <div>
              <dt>邮箱</dt>
              <dd>{selectedUser.email || "未设置"}</dd>
            </div>
            <div>
              <dt>名</dt>
              <dd>{selectedUser.first_name || "未设置"}</dd>
            </div>
            <div>
              <dt>姓</dt>
              <dd>{selectedUser.last_name || "未设置"}</dd>
            </div>
          </dl>
        ) : null}
      </BorderGlow>
    </main>
  );
}
