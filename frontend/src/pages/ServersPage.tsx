import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { GlassSelect, type GlassSelectOption } from "../components/GlassSelect";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { createServer, getIDCs, getServers } from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTimeZh, formatDateTimeZhParts } from "../lib/format";
import type { RequestState, ServerCreateInput, ServerQuery, ServerRecord } from "../types";

const initialQuery: ServerQuery = {
  search: "",
  ordering: "-updated_at",
  page: "1",
  page_size: "20",
  environment: "",
  lifecycle_status: "",
  source: "",
};

const initialCreateForm: ServerCreateInput = {
  hostname: "",
  internal_ip: "",
  external_ip: "",
  os_version: "Ubuntu 22.04",
  cpu_cores: 4,
  memory_gb: "8.00",
  disk_summary: "",
  lifecycle_status: "online",
  environment: "dev",
  idc: null,
};

const environmentOptions: GlassSelectOption[] = [
  { value: "", label: "全部" },
  { value: "dev", label: "dev" },
  { value: "test", label: "test" },
  { value: "prod", label: "prod" },
];

const createEnvironmentOptions: GlassSelectOption[] = environmentOptions.filter((option) => option.value);

const lifecycleOptions: GlassSelectOption[] = [
  { value: "", label: "全部" },
  { value: "online", label: "online" },
  { value: "offline", label: "offline" },
  { value: "maintenance", label: "maintenance" },
  { value: "pre_allocated", label: "pre_allocated" },
];

const createLifecycleOptions: GlassSelectOption[] = lifecycleOptions.filter((option) => option.value);

export function ServersPage() {
  const { accessToken, baseUrl } = useAuth();
  const [query, setQuery] = useState<ServerQuery>(initialQuery);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ServerCreateInput>(initialCreateForm);
  const [createState, setCreateState] = useState<RequestState>("idle");
  const [createSummary, setCreateSummary] = useState("在统一入口登记服务器资产信息，提交完成后系统会刷新清单并自动定位至新记录。");
  const [idcOptions, setIdcOptions] = useState<GlassSelectOption[]>([]);
  const [idcState, setIdcState] = useState<RequestState>("idle");
  const [idcSummary, setIdcSummary] = useState("正在同步机房列表。");
  const {
    page: serverPage,
    state: serverState,
    summary: serverSummary,
    refresh: refreshServers,
  } = usePaginatedResource<ServerRecord, ServerQuery>({
    accessToken,
    query,
    initialSummary: "读取当前 CMDB 服务器列表。",
    missingTokenSummary: "请先登录后再查询 CMDB 服务器。",
    loadingSummary: "正在查询实时 CMDB 数据...",
    successSummary: (response) => `已加载 ${response.results.length} 台服务器，共 ${response.count} 台。`,
    fetcher: (token, activeQuery) => getServers(baseUrl, token, activeQuery),
  });

  useEffect(() => {
    if (!accessToken) {
      setIdcOptions([]);
      setIdcState("idle");
      setIdcSummary("请先登录后再加载机房列表。");
      return;
    }

    void loadIDCs();
  }, [accessToken, baseUrl]);

  function updateQuery<K extends keyof ServerQuery>(key: K, value: ServerQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  function updateCreateForm<K extends keyof ServerCreateInput>(key: K, value: ServerCreateInput[K]) {
    setCreateForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function loadIDCs() {
    if (!accessToken) {
      return;
    }

    setIdcState("loading");
    setIdcSummary("正在同步机房列表。");

    try {
      const response = await getIDCs(baseUrl, accessToken, {
        ordering: "code",
        page: "1",
        page_size: "100",
      });
      const options = response.results.map((idc) => ({
        value: String(idc.id),
        label: `${idc.code} · ${idc.name}`,
      }));
      setIdcOptions(options);
      setIdcState("success");
      setIdcSummary(`已加载 ${options.length} 个机房选项。`);
    } catch (error) {
      setIdcState("error");
      setIdcSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleCreateServer() {
    if (!accessToken) {
      setCreateState("error");
      setCreateSummary("请先完成身份验证后再执行服务器资产登记。");
      return;
    }

    if (!createForm.idc) {
      setCreateState("error");
      setCreateSummary("请选择所属机房后再提交服务器资产信息。");
      return;
    }

    setCreateState("loading");
    setCreateSummary("正在提交服务器资产信息，并同步最新资产清单...");

    try {
      const selectedIdc = createForm.idc;
      const created = await createServer(baseUrl, accessToken, {
        ...createForm,
        idc: selectedIdc,
        external_ip: createForm.external_ip?.trim() ? createForm.external_ip.trim() : null,
        disk_summary: createForm.disk_summary?.trim() || "",
      });
      await refreshServers();
      setSelectedServerId(created.id);
      setCreateState("success");
      setCreateSummary(`服务器 ${created.hostname} 已完成登记，并已纳入当前资产清单。`);
      setCreateForm(initialCreateForm);
      setCreateOpen(false);
    } catch (error) {
      setCreateState("error");
      setCreateSummary(getUserFacingErrorMessage(error));
    }
  }

  const selectedServer =
    serverPage?.results.find((server) => server.id === selectedServerId) || serverPage?.results[0] || null;

  function renderDateTime(value: string | null) {
    const { date, time } = formatDateTimeZhParts(value);
    return (
      <span className="time-stack">
        <span>{date}</span>
        {time ? <span>{time}</span> : null}
      </span>
    );
  }

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8">
        <div className="panel-heading">
          <h2>服务器资产</h2>
          <p>统一查看服务器资产信息，支持按关键词、环境与生命周期快速筛选，便于在同一页面内完成基础核查与状态确认。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>关键词</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
          </label>
          <div className="field">
            <span>环境</span>
            <GlassSelect
              options={environmentOptions}
              value={query.environment || ""}
              onChange={(value) => updateQuery("environment", value)}
            />
          </div>
          <div className="field">
            <span>生命周期</span>
            <GlassSelect
              options={lifecycleOptions}
              value={query.lifecycle_status || ""}
              onChange={(value) => updateQuery("lifecycle_status", value)}
            />
          </div>
        </div>

        <div className="actions">
          <button
            onClick={async () => {
              const response = await refreshServers();
              if (response) {
                setSelectedServerId(response.results[0]?.id ?? null);
              }
            }}
            type="button"
          >
            刷新列表
          </button>
          <button className="button-ghost" onClick={() => setCreateOpen((current) => !current)} type="button">
            {createOpen ? "收起新增" : "新增服务器"}
          </button>
        </div>

        {createOpen ? (
          <div className="advanced-settings server-create-panel">
            <div className="panel-heading server-create-heading">
              <h2>新增服务器</h2>
              <p>请补充服务器的基础档案信息，包括主机标识、网络地址、资源规格、部署环境与机房归属，以便纳入统一资产台账。</p>
            </div>

            <div className="form-grid server-create-grid">
              <label className="field">
                <span>主机名</span>
                <input
                  placeholder="例如：app-prod-01"
                  value={createForm.hostname}
                  onChange={(event) => updateCreateForm("hostname", event.target.value)}
                />
              </label>
              <label className="field">
                <span>内网 IP</span>
                <input
                  placeholder="例如：10.0.0.21"
                  value={createForm.internal_ip}
                  onChange={(event) => updateCreateForm("internal_ip", event.target.value)}
                />
              </label>
              <label className="field">
                <span>外网 IP</span>
                <input
                  placeholder="可选，例如：1.2.3.4"
                  value={createForm.external_ip || ""}
                  onChange={(event) => updateCreateForm("external_ip", event.target.value)}
                />
              </label>
              <label className="field">
                <span>系统版本</span>
                <input
                  placeholder="例如：Ubuntu 22.04"
                  value={createForm.os_version}
                  onChange={(event) => updateCreateForm("os_version", event.target.value)}
                />
              </label>
              <label className="field">
                <span>CPU 核数</span>
                <input
                  min="1"
                  type="number"
                  value={createForm.cpu_cores}
                  onChange={(event) => updateCreateForm("cpu_cores", Number(event.target.value) || 1)}
                />
              </label>
              <label className="field">
                <span>内存容量</span>
                <input
                  placeholder="例如：8.00"
                  value={createForm.memory_gb}
                  onChange={(event) => updateCreateForm("memory_gb", event.target.value)}
                />
                <small className="field-hint">单位为GB</small>
              </label>
              <div className="field">
                <span>环境</span>
                <GlassSelect
                  options={createEnvironmentOptions}
                  value={createForm.environment}
                  onChange={(value) => updateCreateForm("environment", value as ServerCreateInput["environment"])}
                />
              </div>
              <div className="field">
                <span>生命周期</span>
                <GlassSelect
                  options={createLifecycleOptions}
                  value={createForm.lifecycle_status}
                  onChange={(value) =>
                    updateCreateForm("lifecycle_status", value as ServerCreateInput["lifecycle_status"])
                  }
                />
              </div>
              <div className="field">
                <span className="field-label-nowrap">所属机房</span>
                <GlassSelect
                  disabled={idcState === "loading" || !idcOptions.length}
                  options={idcOptions}
                  placeholder={idcState === "loading" ? "正在加载机房列表" : "请选择机房"}
                  value={createForm.idc ? String(createForm.idc) : ""}
                  onChange={(value) => updateCreateForm("idc", value ? Number(value) : null)}
                />
                <small className={`field-hint${idcState === "error" ? " field-hint-error" : ""}`}>{idcSummary}</small>
              </div>
            </div>

            <label className="field stacked-field">
              <span>磁盘摘要</span>
              <textarea
                className="server-create-textarea"
                placeholder="可选，例如：system:100G,data:500G"
                rows={4}
                value={createForm.disk_summary || ""}
                onChange={(event) => updateCreateForm("disk_summary", event.target.value)}
              />
            </label>

            <div className="actions">
              <button onClick={() => void handleCreateServer()} type="button">
                创建服务器
              </button>
              <button
                className="button-ghost"
                onClick={() => {
                  setCreateForm(initialCreateForm);
                  setCreateState("idle");
                  setCreateSummary("在统一入口登记服务器资产信息，提交完成后系统会刷新清单并自动定位至新记录。");
                }}
                type="button"
              >
                重置表单
              </button>
            </div>

            <p className={`status ${createState}`}>{createSummary}</p>
          </div>
        ) : null}

        <p className={`status ${serverState}`}>{serverSummary}</p>

        <div className="table-shell">
          <table className="server-assets-table">
            <thead>
              <tr>
                <th>主机名</th>
                <th>内网 IP</th>
                <th>IDC</th>
                <th>系统</th>
                <th>环境</th>
                <th>生命周期</th>
                <th>来源</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {serverPage?.results.length ? (
                serverPage.results.map((server) => (
                  <tr
                    className={server.id === selectedServer?.id ? "row-selected" : undefined}
                    key={server.id}
                    onClick={() => setSelectedServerId(server.id)}
                  >
                    <td>{server.hostname}</td>
                    <td>{server.internal_ip}</td>
                    <td>{server.idc_name || "未记录"}</td>
                    <td>{server.os_version}</td>
                    <td>{server.environment}</td>
                    <td>{server.lifecycle_status}</td>
                    <td>{server.source}</td>
                    <td>{renderDateTime(server.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>当前没有加载到服务器数据。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4 panel-fit-content">
        <div className="panel-heading">
          <h2>选中服务器</h2>
          <p>聚合展示当前服务器的核心属性与运行概况，帮助快速确认主机配置、网络信息与最近状态。</p>
        </div>

        {selectedServer ? (
          <>
            <dl className="profile-card detail-card">
              <div>
                <dt>主机名</dt>
                <dd>{selectedServer.hostname}</dd>
              </div>
              <div>
                <dt>IDC</dt>
                <dd>{selectedServer.idc_name || "未记录"}</dd>
              </div>
              <div>
                <dt>内网 IP</dt>
                <dd>{selectedServer.internal_ip}</dd>
              </div>
              <div>
                <dt>外网 IP</dt>
                <dd>{selectedServer.external_ip || "未记录"}</dd>
              </div>
              <div>
                <dt>CPU</dt>
                <dd>{selectedServer.cpu_cores} cores</dd>
              </div>
              <div>
                <dt>内存</dt>
                <dd>{selectedServer.memory_gb} GB</dd>
              </div>
              <div>
                <dt>最近心跳</dt>
                <dd>{formatDateTimeZh(selectedServer.last_seen_at)}</dd>
              </div>
              <div>
                <dt>更新时间</dt>
                <dd>{formatDateTimeZh(selectedServer.updated_at)}</dd>
              </div>
            </dl>

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>磁盘摘要</h3>
              <p>{selectedServer.disk_summary || "当前服务器暂未同步磁盘摘要信息。"}</p>
            </BorderGlow>
          </>
        ) : (
          <p className="status idle">请先从左侧列表中选择目标服务器，以查看详细资产信息。</p>
        )}
      </BorderGlow>
    </main>
  );
}
