import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { GlassSelect, type GlassSelectOption } from "../components/GlassSelect";
import { useHashSectionScroll } from "../hooks/useHashSectionScroll";
import { PaginationControls } from "../components/PaginationControls";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { useResourceDetail } from "../hooks/useResourceDetail";
import {
  createIDC,
  deleteIDC,
  getIDC,
  getIDCs,
  getIDCToolQuery,
  updateIDC,
} from "../lib/api";
import { downloadRemoteCsv } from "../lib/export";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTimeZh } from "../lib/format";
import type {
  IDCListQuery,
  IDCMutationInput,
  IDCRecord,
  IDCToolQuery,
  IDCToolQueryResponse,
  RequestState,
} from "../types";

const statusOptions: GlassSelectOption[] = [
  { value: "", label: "全部状态" },
  { value: "active", label: "active" },
  { value: "maintenance", label: "maintenance" },
  { value: "inactive", label: "inactive" },
];

const initialQuery: IDCListQuery = {
  ordering: "code",
  page: "1",
  page_size: "20",
  status: "",
};

const orderingOptions: GlassSelectOption[] = [
  { value: "code", label: "编码 A-Z" },
  { value: "name", label: "名称 A-Z" },
  { value: "status", label: "状态分组" },
  { value: "-created_at", label: "最新创建" },
];

const initialForm: IDCMutationInput = {
  code: "",
  name: "",
  location: "",
  status: "active",
  description: "",
};

const initialToolQuery: IDCToolQuery = {
  q: "",
  code: "",
  name: "",
  location: "",
  status: "",
  limit: "6",
};

export function IDCsPage() {
  const { accessToken, baseUrl, capabilities } = useAuth();
  useHashSectionScroll();
  const [query, setQuery] = useState<IDCListQuery>(initialQuery);
  const [selectedIdcId, setSelectedIdcId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<IDCMutationInput>(initialForm);
  const [createState, setCreateState] = useState<RequestState>("idle");
  const [createSummary, setCreateSummary] = useState("在此维护机房主数据，保存后会自动刷新机房清单并定位到最新条目。");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<IDCMutationInput>(initialForm);
  const [editState, setEditState] = useState<RequestState>("idle");
  const [editSummary, setEditSummary] = useState("进入编辑模式后，可更新当前机房的编码、名称、位置与状态信息。");
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [toolQuery, setToolQuery] = useState<IDCToolQuery>(initialToolQuery);
  const [toolState, setToolState] = useState<RequestState>("idle");
  const [toolSummary, setToolSummary] = useState("支持按编码、名称、位置与运行状态组合检索，适用于资产归属核验、资源规划与主数据复核。");
  const [toolResponse, setToolResponse] = useState<IDCToolQueryResponse | null>(null);

  const {
    page: idcPage,
    state: idcListState,
    summary: idcListSummary,
    refresh: refreshIDCs,
  } = usePaginatedResource<IDCRecord, IDCListQuery>({
    accessToken,
    query,
    initialSummary: "读取机房主数据列表，查看当前可用机房与状态分布。",
    missingTokenSummary: "请先登录后再访问机房主数据。",
    loadingSummary: "正在同步机房主数据...",
    successSummary: (response) => `已加载 ${response.results.length} 个机房，共 ${response.count} 个。`,
    fetcher: (token, activeQuery) => getIDCs(baseUrl, token, activeQuery),
  });

  const activeIdcId = selectedIdcId ?? idcPage?.results[0]?.id ?? null;
  const {
    item: selectedIdcDetail,
    state: idcDetailState,
    summary: idcDetailSummary,
    refresh: refreshIDCDetail,
  } = useResourceDetail<IDCRecord>({
    accessToken,
    resourceId: activeIdcId,
    initialSummary: "选择机房后可查看主数据详情。",
    missingTokenSummary: "请先登录后再查看机房详情。",
    loadingSummary: (id) => `正在同步机房 ${id} 的主数据详情...`,
    successSummary: (item) => `已加载机房 ${item.code} 的主数据详情。`,
    fetcher: (token, id) => getIDC(baseUrl, token, id),
  });
  const selectedIdc = selectedIdcDetail || idcPage?.results.find((item) => item.id === selectedIdcId) || idcPage?.results[0] || null;
  const currentPage = Number(query.page || "1");
  const pageSize = Number(query.page_size || "20");

  useEffect(() => {
    if (!selectedIdc) {
      setEditOpen(false);
      setDeleteConfirming(false);
      return;
    }

    setEditForm({
      code: selectedIdc.code,
      name: selectedIdc.name,
      location: selectedIdc.location,
      status: selectedIdc.status,
      description: selectedIdc.description,
    });
    setEditState("idle");
    setEditSummary("进入编辑模式后，可更新当前机房的编码、名称、位置与状态信息。");
    setDeleteConfirming(false);
  }, [selectedIdc?.id]);

  function updateQuery<K extends keyof IDCListQuery>(key: K, value: IDCListQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  function updateCreateForm<K extends keyof IDCMutationInput>(key: K, value: IDCMutationInput[K]) {
    setCreateForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateEditForm<K extends keyof IDCMutationInput>(key: K, value: IDCMutationInput[K]) {
    setEditForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateToolQuery<K extends keyof IDCToolQuery>(key: K, value: IDCToolQuery[K]) {
    setToolQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleCreateIDC() {
    if (!accessToken) {
      return;
    }

    setCreateState("loading");
    setCreateSummary("正在创建机房并刷新主数据列表...");
    try {
      const created = await createIDC(baseUrl, accessToken, createForm);
      const response = await refreshIDCs();
      setSelectedIdcId(created.id);
      if (response?.results.length) {
        setSelectedIdcId(created.id);
      }
      setCreateState("success");
      setCreateSummary(`机房 ${created.code} 已纳入主数据清单。`);
      setCreateForm(initialForm);
      setCreateOpen(false);
    } catch (error) {
      setCreateState("error");
      setCreateSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleUpdateIDC() {
    if (!accessToken || !selectedIdc) {
      return;
    }

    setEditState("loading");
    setEditSummary("正在保存机房主数据...");
    try {
      await updateIDC(baseUrl, accessToken, selectedIdc.id, editForm);
      await refreshIDCs();
      await refreshIDCDetail(selectedIdc.id);
      setEditState("success");
      setEditSummary(`机房 ${editForm.code} 的主数据已更新。`);
      setEditOpen(false);
    } catch (error) {
      setEditState("error");
      setEditSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleDeleteIDC() {
    if (!accessToken || !selectedIdc) {
      return;
    }
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      return;
    }

    setEditState("loading");
    setEditSummary(`正在删除机房 ${selectedIdc.code}...`);
    try {
      await deleteIDC(baseUrl, accessToken, selectedIdc.id);
      const response = await refreshIDCs();
      setSelectedIdcId(response?.results[0]?.id ?? null);
      setDeleteConfirming(false);
      setEditOpen(false);
      setEditState("success");
      setEditSummary(`机房 ${selectedIdc.code} 已从主数据清单中移除。`);
    } catch (error) {
      setEditState("error");
      setEditSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleToolQuery() {
    if (!accessToken) {
      setToolState("error");
      setToolSummary("请先登录后再执行高级机房查询。");
      return;
    }

    const activeQuery = Object.fromEntries(
      Object.entries(toolQuery).filter(([, value]) => Boolean(value)),
    ) as IDCToolQuery;

    setToolState("loading");
    setToolSummary("正在执行高级机房查询...");
    try {
      const response = await getIDCToolQuery(baseUrl, accessToken, activeQuery);
      setToolResponse(response);
      setToolState("success");
      setToolSummary(`已返回 ${response.summary.returned} 个机房，共命中 ${response.summary.count} 个。`);
    } catch (error) {
      setToolResponse(null);
      setToolState("error");
      setToolSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleExportIDCs() {
    if (!accessToken) {
      return;
    }

    const exportQuery = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value && key !== "page" && key !== "page_size") {
        exportQuery.set(key, value);
      }
    });

    try {
      await downloadRemoteCsv(
        baseUrl,
        `/api/v1/cmdb/idcs/export/${exportQuery.toString() ? `?${exportQuery.toString()}` : ""}`,
        accessToken,
        "机房主数据清单",
      );
    } catch (error) {
      console.error(getUserFacingErrorMessage(error));
    }
  }

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8" id="idcs-assets">
        <div className="panel-heading">
          <h2>机房主数据</h2>
          <p>维护机房编码、名称、地理位置与运行状态，作为服务器资产归属与资源规划的基础主数据。</p>
        </div>

        <div className="filter-grid">
          <div className="field">
            <span>状态</span>
            <GlassSelect
              options={statusOptions}
              value={query.status || ""}
              onChange={(value) => updateQuery("status", value as IDCListQuery["status"])}
            />
          </div>
          <div className="field">
            <span>排序方式</span>
            <GlassSelect
              options={orderingOptions}
              value={query.ordering || "code"}
              onChange={(value) => updateQuery("ordering", value)}
            />
          </div>
        </div>

        <div className="actions">
          <button
            onClick={async () => {
              const response = await refreshIDCs();
              setSelectedIdcId(response?.results[0]?.id ?? null);
            }}
            type="button"
          >
            刷新列表
          </button>
          <button className="button-ghost" onClick={() => void handleExportIDCs()} type="button">
            导出结果
          </button>
          {capabilities.canWriteServers ? (
            <button className="button-ghost" onClick={() => setCreateOpen((current) => !current)} type="button">
              {createOpen ? "收起新增" : "新增机房"}
            </button>
          ) : null}
        </div>

        {!capabilities.canWriteServers ? (
          <p className="status idle">当前账号已开通机房查看能力，但未配置主数据写入权限。如需新增、编辑或删除机房，请联系平台管理员开通运维写入权限。</p>
        ) : null}

        {capabilities.canWriteServers && createOpen ? (
          <div className="advanced-settings server-create-panel">
            <div className="panel-heading server-create-heading">
              <h2>新增机房</h2>
              <p>补充机房主数据时，建议优先完善编码、名称、地理位置、运行状态与说明信息，便于后续关联服务器资产归属。</p>
            </div>

            <div className="form-grid server-create-grid">
              <label className="field">
                <span>机房编码</span>
                <input value={createForm.code} onChange={(event) => updateCreateForm("code", event.target.value)} />
              </label>
              <label className="field">
                <span>机房名称</span>
                <input value={createForm.name} onChange={(event) => updateCreateForm("name", event.target.value)} />
              </label>
              <label className="field">
                <span>地理位置</span>
                <input value={createForm.location} onChange={(event) => updateCreateForm("location", event.target.value)} />
              </label>
              <div className="field">
                <span>运行状态</span>
                <GlassSelect
                  options={statusOptions.filter((option) => option.value)}
                  value={createForm.status}
                  onChange={(value) => updateCreateForm("status", value as IDCMutationInput["status"])}
                />
              </div>
            </div>

            <label className="field stacked-field">
              <span>机房说明</span>
              <textarea
                className="server-create-textarea"
                rows={4}
                value={createForm.description}
                onChange={(event) => updateCreateForm("description", event.target.value)}
              />
            </label>

            <div className="actions">
              <button onClick={() => void handleCreateIDC()} type="button">
                创建机房
              </button>
              <button
                className="button-ghost"
                onClick={() => {
                  setCreateForm(initialForm);
                  setCreateState("idle");
                  setCreateSummary("在此维护机房主数据，保存后会自动刷新机房清单并定位到最新条目。");
                }}
                type="button"
              >
                重置表单
              </button>
            </div>

            <p className={`status ${createState}`}>{createSummary}</p>
          </div>
        ) : null}

        <p className={`status ${idcListState}`}>{idcListSummary}</p>

        <div className="table-shell">
          <table className="server-assets-table">
            <thead>
              <tr>
                <th>编码</th>
                <th>名称</th>
                <th>位置</th>
                <th>状态</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {idcPage?.results.length ? (
                idcPage.results.map((item) => (
                  <tr
                    className={item.id === selectedIdc?.id ? "row-selected" : undefined}
                    key={item.id}
                    onClick={() => setSelectedIdcId(item.id)}
                  >
                    <td>{item.code}</td>
                    <td>{item.name}</td>
                    <td>{item.location}</td>
                    <td>{item.status}</td>
                    <td>{formatDateTimeZh(item.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>当前暂无可展示的机房主数据。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={currentPage}
          onPageChange={(page) => updateQuery("page", String(page))}
          onPageSizeChange={(size) => updateQuery("page_size", String(size))}
          page={idcPage}
          pageSize={pageSize}
        />
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4 panel-fit-content">
        <div className="panel-heading">
          <h2>选中机房</h2>
          <p>展示当前机房的核心主数据与说明信息，便于快速确认资产归属背景与运行状态。</p>
        </div>

        <p className={`status ${idcDetailState}`}>{idcDetailSummary}</p>

        {selectedIdc ? (
          <>
            <dl className="profile-card detail-card">
              <div>
                <dt>机房编码</dt>
                <dd>{selectedIdc.code}</dd>
              </div>
              <div>
                <dt>机房名称</dt>
                <dd>{selectedIdc.name}</dd>
              </div>
              <div>
                <dt>地理位置</dt>
                <dd>{selectedIdc.location}</dd>
              </div>
              <div>
                <dt>运行状态</dt>
                <dd>{selectedIdc.status}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatDateTimeZh(selectedIdc.created_at)}</dd>
              </div>
              <div>
                <dt>更新时间</dt>
                <dd>{formatDateTimeZh(selectedIdc.updated_at)}</dd>
              </div>
            </dl>

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>机房说明</h3>
              <p>{selectedIdc.description || "当前机房暂未补充说明信息。"}</p>
            </BorderGlow>

            {capabilities.canWriteServers ? (
              <div className="actions">
                <button onClick={() => void refreshIDCDetail(selectedIdc.id)} type="button">
                  刷新详情
                </button>
                <button className="button-ghost" onClick={() => setEditOpen((current) => !current)} type="button">
                  {editOpen ? "收起编辑" : "编辑机房"}
                </button>
                <button
                  className={deleteConfirming ? "button-danger-soft" : undefined}
                  onClick={() => void handleDeleteIDC()}
                  type="button"
                >
                  {deleteConfirming ? "确认删除" : "删除机房"}
                </button>
              </div>
            ) : null}

            {editOpen ? (
              <div className="advanced-settings">
                <div className="panel-heading">
                  <h2>编辑机房</h2>
                  <p>维护当前机房的主数据字段，保存后会自动刷新机房清单并同步右侧信息卡。</p>
                </div>

                <div className="form-grid server-create-grid">
                  <label className="field">
                    <span>机房编码</span>
                    <input value={editForm.code} onChange={(event) => updateEditForm("code", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>机房名称</span>
                    <input value={editForm.name} onChange={(event) => updateEditForm("name", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>地理位置</span>
                    <input value={editForm.location} onChange={(event) => updateEditForm("location", event.target.value)} />
                  </label>
                  <div className="field">
                    <span>运行状态</span>
                    <GlassSelect
                      options={statusOptions.filter((option) => option.value)}
                      value={editForm.status}
                      onChange={(value) => updateEditForm("status", value as IDCMutationInput["status"])}
                    />
                  </div>
                </div>

                <label className="field stacked-field">
                  <span>机房说明</span>
                  <textarea
                    className="server-create-textarea"
                    rows={4}
                    value={editForm.description}
                    onChange={(event) => updateEditForm("description", event.target.value)}
                  />
                </label>

                <div className="actions">
                  <button onClick={() => void handleUpdateIDC()} type="button">
                    保存修改
                  </button>
                  <button className="button-ghost" onClick={() => setEditOpen(false)} type="button">
                    取消编辑
                  </button>
                </div>

                <p className={`status ${editState}`}>{editSummary}</p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="status idle">请先从左侧列表中选择目标机房，以查看主数据详情与说明信息。</p>
        )}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-12" id="idcs-advanced-query">
        <div className="panel-heading">
          <h2>高级机房查询</h2>
          <p>面向资产归属核验、资源规划与主数据复核场景，可通过编码、名称、位置与运行状态快速缩小检索范围。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>综合关键词</span>
            <input value={toolQuery.q || ""} onChange={(event) => updateToolQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>机房编码</span>
            <input value={toolQuery.code || ""} onChange={(event) => updateToolQuery("code", event.target.value)} />
          </label>
          <label className="field">
            <span>机房名称</span>
            <input value={toolQuery.name || ""} onChange={(event) => updateToolQuery("name", event.target.value)} />
          </label>
          <label className="field">
            <span>地理位置</span>
            <input value={toolQuery.location || ""} onChange={(event) => updateToolQuery("location", event.target.value)} />
          </label>
          <div className="field">
            <span>运行状态</span>
            <GlassSelect
              options={statusOptions}
              value={toolQuery.status || ""}
              onChange={(value) => updateToolQuery("status", value as IDCToolQuery["status"])}
            />
          </div>
        </div>

        <div className="actions">
          <button onClick={() => void handleToolQuery()} type="button">
            执行查询
          </button>
          <button
            className="button-ghost"
            onClick={() => {
              setToolQuery(initialToolQuery);
              setToolResponse(null);
              setToolState("idle");
              setToolSummary("支持按编码、名称、位置与运行状态组合检索，适用于资产归属核验、资源规划与主数据复核。");
            }}
            type="button"
          >
            重置条件
          </button>
        </div>

        <p className={`status ${toolState}`}>{toolSummary}</p>

        {toolResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">返回 {toolResponse.summary.returned} 个</span>
              <span className="filter-chip">命中 {toolResponse.summary.count} 个</span>
              {toolResponse.summary.truncated ? <span className="filter-chip">结果已截断</span> : null}
            </div>
            <div className="query-result-grid query-result-grid-compact">
              {toolResponse.items.map((item) => (
                <BorderGlow as="article" className="tool-result-card tool-result-card-compact" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <h3>{item.code}</h3>
                      <div className="tool-result-meta">
                        <span className="pill neutral">{item.name}</span>
                        <span className="pill neutral">{item.status}</span>
                      </div>
                    </div>
                    <button className="button-ghost query-action-button" onClick={() => setSelectedIdcId(item.id)} type="button">
                      查看详情
                    </button>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>位置</dt>
                      <dd>{item.location}</dd>
                    </div>
                    <div>
                      <dt>更新时间</dt>
                      <dd>{formatDateTimeZh(item.updated_at)}</dd>
                    </div>
                  </dl>
                </BorderGlow>
              ))}
            </div>
          </>
        ) : null}
      </BorderGlow>
    </main>
  );
}
