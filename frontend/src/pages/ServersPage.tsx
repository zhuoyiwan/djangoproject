import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { GlassSelect, type GlassSelectOption } from "../components/GlassSelect";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { useHashSectionScroll } from "../hooks/useHashSectionScroll";
import { useResourceDetail } from "../hooks/useResourceDetail";
import { PaginationControls } from "../components/PaginationControls";
import {
  bulkImportServers,
  bulkUpdateServerLifecycle,
  createServer,
  deleteServer,
  getIDCs,
  getServer,
  getServers,
  getServerToolQuery,
  updateServer,
} from "../lib/api";
import { downloadRemoteCsv } from "../lib/export";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTimeZh, formatDateTimeZhParts } from "../lib/format";
import type {
  RequestState,
  ServerBulkImportItem,
  ServerCreateInput,
  ServerQuery,
  ServerRecord,
  ServerToolQuery,
  ServerToolQueryResponse,
  ServerUpdateInput,
} from "../types";

const initialQuery: ServerQuery = {
  search: "",
  ordering: "-created_at",
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
const orderingOptions: GlassSelectOption[] = [
  { value: "-created_at", label: "最新创建" },
  { value: "hostname", label: "主机名 A-Z" },
  { value: "-cpu_cores", label: "CPU 从高到低" },
  { value: "-memory_gb", label: "内存从高到低" },
  { value: "environment", label: "环境分组" },
  { value: "lifecycle_status", label: "生命周期分组" },
];
const initialToolQuery: ServerToolQuery = {
  q: "",
  hostname: "",
  internal_ip: "",
  environment: "",
  lifecycle_status: "",
  idc_code: "",
  limit: "6",
};

const initialAgentMonitorQuery: ServerQuery = {
  search: "",
  ordering: "-created_at",
  page: "1",
  page_size: "6",
  environment: "",
  lifecycle_status: "",
  source: "agent",
};

const initialBulkImportForm = {
  os_version: "Ubuntu 22.04",
  environment: "dev" as ServerCreateInput["environment"],
  lifecycle_status: "online" as ServerCreateInput["lifecycle_status"],
  idc: null as number | null,
  lines: "",
};

function getHeartbeatState(lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return "missing";
  }
  const seenAt = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seenAt)) {
    return "missing";
  }
  const ageMs = Date.now() - seenAt;
  return ageMs > 24 * 60 * 60 * 1000 ? "stale" : "healthy";
}

export function ServersPage() {
  const { accessToken, baseUrl, capabilities } = useAuth();
  useHashSectionScroll();
  const [query, setQuery] = useState<ServerQuery>(initialQuery);
  const [agentMonitorQuery, setAgentMonitorQuery] = useState<ServerQuery>(initialAgentMonitorQuery);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ServerCreateInput>(initialCreateForm);
  const [createState, setCreateState] = useState<RequestState>("idle");
  const [createSummary, setCreateSummary] = useState("在此补录服务器基础档案，提交后系统会刷新资产清单并自动定位到新记录。");
  const [selectedServerIds, setSelectedServerIds] = useState<number[]>([]);
  const [bulkLifecycleStatus, setBulkLifecycleStatus] = useState<ServerRecord["lifecycle_status"]>("maintenance");
  const [bulkState, setBulkState] = useState<RequestState>("idle");
  const [bulkSummary, setBulkSummary] = useState("支持对当前页选中服务器批量更新生命周期，并保留原有资产字段不变。");
  const [bulkImportForm, setBulkImportForm] = useState(initialBulkImportForm);
  const [bulkImportState, setBulkImportState] = useState<RequestState>("idle");
  const [bulkImportSummary, setBulkImportSummary] = useState("支持按行导入服务器清单，共用系统版本、环境、生命周期与所属机房参数。");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<ServerUpdateInput>(initialCreateForm);
  const [editState, setEditState] = useState<RequestState>("idle");
  const [editSummary, setEditSummary] = useState("进入编辑模式后，可维护当前服务器的基础资产信息。");
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [toolQuery, setToolQuery] = useState<ServerToolQuery>(initialToolQuery);
  const [toolState, setToolState] = useState<RequestState>("idle");
  const [toolSummary, setToolSummary] = useState("支持按主机名、IP、环境、生命周期与机房编码组合检索，适用于排障核查、归属确认与环境盘点。");
  const [toolResponse, setToolResponse] = useState<ServerToolQueryResponse | null>(null);
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
  const {
    page: agentMonitorPage,
    state: agentMonitorState,
    summary: agentMonitorSummary,
    refresh: refreshAgentMonitor,
  } = usePaginatedResource<ServerRecord, ServerQuery>({
    accessToken,
    query: agentMonitorQuery,
    initialSummary: "查看机器上报资产与最近心跳状态。",
    missingTokenSummary: "请先登录后再查看机器上报监控。",
    loadingSummary: "正在同步机器上报资产与心跳状态...",
    successSummary: (response) => {
      const staleCount = response.results.filter((item) => getHeartbeatState(item.last_seen_at) === "stale").length;
      const missingCount = response.results.filter((item) => getHeartbeatState(item.last_seen_at) === "missing").length;
      return `已同步 ${response.results.length} 台机器上报资产，本页异常心跳 ${staleCount} 台，待核验 ${missingCount} 台。`;
    },
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

  useEffect(() => {
    const pageIds = new Set((serverPage?.results || []).map((item) => item.id));
    setSelectedServerIds((current) => current.filter((id) => pageIds.has(id)));
  }, [serverPage?.results]);

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

  function updateEditForm<K extends keyof ServerUpdateInput>(key: K, value: ServerUpdateInput[K]) {
    setEditForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateToolQuery<K extends keyof ServerToolQuery>(key: K, value: ServerToolQuery[K]) {
    setToolQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateAgentMonitorQuery<K extends keyof ServerQuery>(key: K, value: ServerQuery[K]) {
    setAgentMonitorQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  function updateBulkImportForm<K extends keyof typeof initialBulkImportForm>(
    key: K,
    value: (typeof initialBulkImportForm)[K],
  ) {
    setBulkImportForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleServerSelection(serverId: number) {
    setSelectedServerIds((current) =>
      current.includes(serverId) ? current.filter((id) => id !== serverId) : [...current, serverId],
    );
  }

  function toggleAllServerSelection() {
    const pageIds = serverPage?.results.map((item) => item.id) || [];
    if (!pageIds.length) {
      return;
    }
    setSelectedServerIds((current) => (current.length === pageIds.length ? [] : pageIds));
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

  const activeServerId = selectedServerId ?? serverPage?.results[0]?.id ?? null;
  const {
    item: selectedServer,
    state: serverDetailState,
    summary: serverDetailSummary,
    refresh: refreshServerDetail,
  } = useResourceDetail<ServerRecord>({
    accessToken,
    resourceId: activeServerId,
    initialSummary: "选择服务器后可查看完整资产详情。",
    missingTokenSummary: "请先登录后再查看服务器详情。",
    loadingSummary: (id) => `正在同步服务器 ${id} 的完整资产信息...`,
    successSummary: (item) => `已加载 ${item.hostname} 的完整资产信息。`,
    fetcher: (token, id) => getServer(baseUrl, token, id),
  });

  useEffect(() => {
    if (!selectedServer) {
      setEditOpen(false);
      setDeleteConfirming(false);
      return;
    }

    setEditForm({
      hostname: selectedServer.hostname,
      internal_ip: selectedServer.internal_ip,
      external_ip: selectedServer.external_ip || "",
      os_version: selectedServer.os_version,
      cpu_cores: selectedServer.cpu_cores,
      memory_gb: selectedServer.memory_gb,
      disk_summary: selectedServer.disk_summary,
      lifecycle_status: selectedServer.lifecycle_status,
      environment: selectedServer.environment,
      idc: selectedServer.idc,
    });
    setEditState("idle");
    setEditSummary("进入编辑模式后，可维护当前服务器的基础资产信息。");
    setDeleteConfirming(false);
  }, [selectedServer?.id]);

  function renderDateTime(value: string | null) {
    const { date, time } = formatDateTimeZhParts(value);
    return (
      <span className="time-stack">
        <span>{date}</span>
        {time ? <span>{time}</span> : null}
      </span>
    );
  }

  function renderDateTimeInline(value: string | null) {
    if (!value) {
      return "未记录";
    }
    const { date, time } = formatDateTimeZhParts(value);
    return [date, time].filter(Boolean).join(" ");
  }

  function focusServerDetail(serverId: number) {
    setSelectedServerId(serverId);
    window.requestAnimationFrame(() => {
      const detailPanel = document.getElementById("servers-selected-detail");
      detailPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleSaveServer() {
    if (!accessToken || !selectedServer) {
      return;
    }
    if (!editForm.idc) {
      setEditState("error");
      setEditSummary("请先选择所属机房后再保存服务器信息。");
      return;
    }

    setEditState("loading");
    setEditSummary("正在保存服务器信息，并同步最新资产详情...");
    try {
      await updateServer(baseUrl, accessToken, selectedServer.id, {
        ...editForm,
        external_ip: editForm.external_ip?.trim() ? editForm.external_ip.trim() : null,
        disk_summary: editForm.disk_summary?.trim() || "",
      });
      await refreshServers();
      await refreshServerDetail(selectedServer.id);
      setEditState("success");
      setEditSummary(`服务器 ${editForm.hostname} 的资产信息已更新。`);
      setEditOpen(false);
    } catch (error) {
      setEditState("error");
      setEditSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleBulkLifecycleUpdate() {
    if (!accessToken || !selectedServerIds.length) {
      setBulkState("error");
      setBulkSummary("请先勾选当前页需要处理的服务器。");
      return;
    }

    setBulkState("loading");
    setBulkSummary(`正在更新 ${selectedServerIds.length} 台服务器的生命周期...`);
    try {
      const response = await bulkUpdateServerLifecycle(baseUrl, accessToken, selectedServerIds, bulkLifecycleStatus);
      await refreshServers();
      if (selectedServerId) {
        await refreshServerDetail(selectedServerId);
      }
      setBulkState("success");
      setBulkSummary(`批量更新完成：已更新 ${response.updated} 台服务器。`);
      setSelectedServerIds([]);
    } catch (error) {
      setBulkState("error");
      setBulkSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleBulkImportServers() {
    if (!accessToken) {
      setBulkImportState("error");
      setBulkImportSummary("请先登录后再执行批量导入。");
      return;
    }
    if (!bulkImportForm.idc) {
      setBulkImportState("error");
      setBulkImportSummary("请先选择所属机房后再批量导入。");
      return;
    }

    const lines = bulkImportForm.lines
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setBulkImportState("error");
      setBulkImportSummary("请先输入至少一行服务器导入数据。");
      return;
    }

    setBulkImportState("loading");
    setBulkImportSummary(`正在导入 ${lines.length} 台服务器...`);
    const parsedItems: ServerBulkImportItem[] = [];
    let invalidCount = 0;

    for (const line of lines) {
      const [hostname, internal_ip, external_ip = "", cpu = "4", memory = "8.00", disk_summary = ""] = line
        .split(",")
        .map((item) => item.trim());

      if (!hostname || !internal_ip) {
        invalidCount += 1;
        continue;
      }

      parsedItems.push({
        hostname,
        internal_ip,
        external_ip: external_ip || null,
        os_version: bulkImportForm.os_version,
        cpu_cores: Number(cpu) || 4,
        memory_gb: memory || "8.00",
        disk_summary,
        lifecycle_status: bulkImportForm.lifecycle_status,
        environment: bulkImportForm.environment,
        idc: bulkImportForm.idc,
      });
    }

    if (!parsedItems.length) {
      setBulkImportState("error");
      setBulkImportSummary("未识别到可导入的有效服务器条目。");
      return;
    }

    try {
      const result = await bulkImportServers(baseUrl, accessToken, parsedItems);
      const response = await refreshServers();
      setSelectedServerId(result.items[0]?.id ?? response?.results[0]?.id ?? null);
      setBulkImportState(invalidCount ? "error" : "success");
      setBulkImportSummary(
        `批量导入完成：新增 ${result.created} 台，更新 ${result.updated} 台${invalidCount ? `，忽略 ${invalidCount} 行无效内容` : ""}。`,
      );
      if (!invalidCount) {
        setBulkImportForm(initialBulkImportForm);
      }
    } catch (error) {
      setBulkImportState("error");
      setBulkImportSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleExportServers() {
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
        `/api/v1/cmdb/servers/export/${exportQuery.toString() ? `?${exportQuery.toString()}` : ""}`,
        accessToken,
        "服务器资产清单",
      );
      setBulkState("success");
      setBulkSummary("已按当前筛选条件导出服务器资产清单");
    } catch (error) {
      setBulkState("error");
      setBulkSummary(getUserFacingErrorMessage(error));
    }
  }

  const bulkUpdateTooltip = selectedServerIds.length
    ? "批量更新已选服务器的生命周期"
    : "请先勾选目标服务器";
  const clearSelectionTooltip = selectedServerIds.length
    ? "清空当前选择"
    : "当前没有已选服务器";

  async function handleDeleteServer() {
    if (!accessToken || !selectedServer) {
      return;
    }
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      return;
    }

    setEditState("loading");
    setEditSummary(`正在删除服务器 ${selectedServer.hostname}...`);
    try {
      await deleteServer(baseUrl, accessToken, selectedServer.id);
      const response = await refreshServers();
      const fallbackId = response?.results[0]?.id ?? null;
      setSelectedServerId(fallbackId);
      setDeleteConfirming(false);
      setEditOpen(false);
      setEditState("success");
      setEditSummary(`服务器 ${selectedServer.hostname} 已从资产清单中移除。`);
    } catch (error) {
      setEditState("error");
      setEditSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleToolQuery() {
    if (!accessToken) {
      setToolState("error");
      setToolSummary("请先登录后再执行高级资产查询。");
      return;
    }

    const activeQuery = Object.fromEntries(
      Object.entries(toolQuery).filter(([, value]) => Boolean(value)),
    ) as ServerToolQuery;

    setToolState("loading");
    setToolSummary("正在执行高级资产查询...");
    try {
      const response = await getServerToolQuery(baseUrl, accessToken, activeQuery);
      setToolResponse(response);
      setToolState("success");
      setToolSummary(`已返回 ${response.summary.returned} 台服务器，共命中 ${response.summary.count} 台。`);
    } catch (error) {
      setToolResponse(null);
      setToolState("error");
      setToolSummary(getUserFacingErrorMessage(error));
    }
  }

  const currentPage = Number(query.page || "1");
  const pageSize = Number(query.page_size || "20");

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8" id="servers-assets">
        <div className="panel-heading">
          <h2>服务器资产</h2>
          <p>集中查看服务器台账，支持按关键词、环境与生命周期筛选，便于快速完成资产核对与状态确认。</p>
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
          <div className="field">
            <span>排序方式</span>
            <GlassSelect
              options={orderingOptions}
              value={query.ordering || "-created_at"}
              onChange={(value) => updateQuery("ordering", value)}
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
          {capabilities.canWriteServers ? (
            <button className="button-ghost" onClick={() => setCreateOpen((current) => !current)} type="button">
              {createOpen ? "收起新增" : "新增服务器"}
            </button>
          ) : null}
          <button className="button-ghost" onClick={() => void handleExportServers()} type="button">
            导出结果
          </button>
        </div>

        {!capabilities.canWriteServers ? (
          <p className="status idle">当前账号已开通服务器查看能力，但未配置资产写入权限。如需登记、编辑或删除服务器，请联系平台管理员开通运维写入权限。</p>
        ) : null}

        {capabilities.canWriteServers && createOpen ? (
          <div className="advanced-settings server-create-panel">
            <div className="panel-heading server-create-heading">
              <h2>新增服务器</h2>
              <p>填写服务器基础档案，包括主机标识、网络地址、资源规格、部署环境与所属机房，提交后即可纳入资产台账。</p>
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
                  setCreateSummary("在此补录服务器基础档案，提交后系统会刷新资产清单并自动定位到新记录。");
                }}
                type="button"
              >
                重置表单
              </button>
            </div>

            <p className={`status ${createState}`}>{createSummary}</p>

            <div className="advanced-divider" />

            <div className="panel-heading server-create-heading">
              <h2>批量导入</h2>
              <p>按行导入服务器清单。每行格式为：主机名,内网IP,外网IP,CPU核数,内存GB,磁盘摘要。</p>
            </div>

            <div className="form-grid server-create-grid">
              <label className="field">
                <span>系统版本</span>
                <input
                  value={bulkImportForm.os_version}
                  onChange={(event) => updateBulkImportForm("os_version", event.target.value)}
                />
              </label>
              <div className="field">
                <span>环境</span>
                <GlassSelect
                  options={createEnvironmentOptions}
                  value={bulkImportForm.environment}
                  onChange={(value) => updateBulkImportForm("environment", value as ServerCreateInput["environment"])}
                />
              </div>
              <div className="field">
                <span>生命周期</span>
                <GlassSelect
                  options={createLifecycleOptions}
                  value={bulkImportForm.lifecycle_status}
                  onChange={(value) =>
                    updateBulkImportForm("lifecycle_status", value as ServerCreateInput["lifecycle_status"])
                  }
                />
              </div>
              <div className="field">
                <span className="field-label-nowrap">所属机房</span>
                <GlassSelect
                  disabled={idcState === "loading" || !idcOptions.length}
                  options={idcOptions}
                  placeholder={idcState === "loading" ? "正在加载机房列表" : "请选择机房"}
                  value={bulkImportForm.idc ? String(bulkImportForm.idc) : ""}
                  onChange={(value) => updateBulkImportForm("idc", value ? Number(value) : null)}
                />
              </div>
            </div>

            <label className="field stacked-field">
              <span>导入内容</span>
              <textarea
                className="server-create-textarea bulk-import-textarea"
                placeholder={"例如：\napp-prod-01,10.0.0.21,1.2.3.4,8,16.00,system:100G data:300G\napp-prod-02,10.0.0.22,,8,16.00,system:100G data:300G"}
                rows={6}
                value={bulkImportForm.lines}
                onChange={(event) => updateBulkImportForm("lines", event.target.value)}
              />
            </label>

            <div className="actions">
              <button onClick={() => void handleBulkImportServers()} type="button">
                执行导入
              </button>
              <button className="button-ghost" onClick={() => setBulkImportForm(initialBulkImportForm)} type="button">
                清空内容
              </button>
            </div>

            <p className={`status ${bulkImportState}`}>{bulkImportSummary}</p>
          </div>
        ) : null}

        <p className={`status ${serverState}`}>{serverSummary}</p>

        {capabilities.canWriteServers ? (
          <div className="batch-toolbar">
            <div className="batch-toolbar-inline">
              <span className="filter-chip">已选 {selectedServerIds.length} 台</span>
            </div>
            <div className="field batch-toolbar-field">
              <span>批量生命周期</span>
              <GlassSelect
                options={createLifecycleOptions}
                value={bulkLifecycleStatus}
                onChange={(value) => setBulkLifecycleStatus(value as ServerRecord["lifecycle_status"])}
              />
            </div>
            <div className="actions">
              <span className="action-tooltip" data-tooltip={bulkUpdateTooltip}>
                <button disabled={!selectedServerIds.length} onClick={() => void handleBulkLifecycleUpdate()} type="button">
                  批量更新
                </button>
              </span>
              <span className="action-tooltip" data-tooltip={clearSelectionTooltip}>
                <button className="button-ghost" disabled={!selectedServerIds.length} onClick={() => setSelectedServerIds([])} type="button">
                  清空选择
                </button>
              </span>
            </div>
          </div>
        ) : null}

        {capabilities.canWriteServers && bulkState !== "idle" ? <p className={`status ${bulkState}`}>{bulkSummary}</p> : null}

        <div className="table-shell">
          <table className="server-assets-table">
            <thead>
              <tr>
                {capabilities.canWriteServers ? (
                  <th className="table-select-cell">
                    <input
                      aria-label="选择当前页全部服务器"
                      checked={Boolean(serverPage?.results.length) && selectedServerIds.length === (serverPage?.results.length || 0)}
                      className="table-checkbox"
                      onChange={toggleAllServerSelection}
                      type="checkbox"
                    />
                  </th>
                ) : null}
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
                    {capabilities.canWriteServers ? (
                      <td className="table-select-cell" onClick={(event) => event.stopPropagation()}>
                        <input
                          aria-label={`选择服务器 ${server.hostname}`}
                          checked={selectedServerIds.includes(server.id)}
                          className="table-checkbox"
                          onChange={() => toggleServerSelection(server.id)}
                          type="checkbox"
                        />
                      </td>
                    ) : null}
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
                  <td colSpan={capabilities.canWriteServers ? 9 : 8}>当前没有加载到服务器数据。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={currentPage}
          onPageChange={(page) => updateQuery("page", String(page))}
          onPageSizeChange={(size) => updateQuery("page_size", String(size))}
          page={serverPage}
          pageSize={pageSize}
        />
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4 panel-fit-content" id="servers-selected-detail">
        <div className="panel-heading">
          <h2>选中服务器</h2>
          <p>展示当前服务器的关键配置、网络信息与最近状态，便于快速核对资产信息与运行概况。</p>
        </div>

        <p className={`status ${serverDetailState}`}>{serverDetailSummary}</p>

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
              <div>
                <dt>创建时间</dt>
                <dd>{formatDateTimeZh(selectedServer.created_at)}</dd>
              </div>
              <div>
                <dt>环境</dt>
                <dd>{selectedServer.environment}</dd>
              </div>
              <div>
                <dt>生命周期</dt>
                <dd>{selectedServer.lifecycle_status}</dd>
              </div>
              <div>
                <dt>数据来源</dt>
                <dd>{selectedServer.source}</dd>
              </div>
            </dl>

            <BorderGlow as="article" className="highlight-card compact-card stacked-detail-card">
              <h3>磁盘摘要</h3>
              <p>{selectedServer.disk_summary || "当前服务器暂未同步磁盘摘要信息。"}</p>
            </BorderGlow>

            <BorderGlow as="article" className="highlight-card compact-card stacked-detail-card">
              <h3>扩展信息</h3>
              <pre className="json-block">{JSON.stringify(selectedServer.metadata, null, 2)}</pre>
            </BorderGlow>

            <div className="actions">
              <button onClick={() => void refreshServerDetail(selectedServer.id)} type="button">
                刷新详情
              </button>
              {capabilities.canWriteServers ? (
                <button className="button-ghost" onClick={() => setEditOpen((current) => !current)} type="button">
                  {editOpen ? "收起编辑" : "编辑服务器"}
                </button>
              ) : null}
              {capabilities.canWriteServers ? (
                <button
                  className={deleteConfirming ? "button-danger-soft" : undefined}
                  onClick={() => void handleDeleteServer()}
                  type="button"
                >
                  {deleteConfirming ? "确认删除" : "删除服务器"}
                </button>
              ) : null}
            </div>

            {editOpen ? (
              <div className="advanced-settings">
                <div className="panel-heading">
                  <h2>编辑服务器</h2>
                  <p>维护当前服务器的主机标识、资源规格、网络信息与部署归属，保存后会自动刷新资产清单与详情。</p>
                </div>

                <div className="form-grid server-create-grid">
                  <label className="field">
                    <span>主机名</span>
                    <input value={editForm.hostname} onChange={(event) => updateEditForm("hostname", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>内网 IP</span>
                    <input
                      value={editForm.internal_ip}
                      onChange={(event) => updateEditForm("internal_ip", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>外网 IP</span>
                    <input
                      value={editForm.external_ip || ""}
                      onChange={(event) => updateEditForm("external_ip", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>系统版本</span>
                    <input value={editForm.os_version} onChange={(event) => updateEditForm("os_version", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>CPU 核数</span>
                    <input
                      min="1"
                      type="number"
                      value={editForm.cpu_cores}
                      onChange={(event) => updateEditForm("cpu_cores", Number(event.target.value) || 1)}
                    />
                  </label>
                  <label className="field">
                    <span>内存容量</span>
                    <input
                      value={editForm.memory_gb}
                      onChange={(event) => updateEditForm("memory_gb", event.target.value)}
                    />
                    <small className="field-hint">单位为GB</small>
                  </label>
                  <div className="field">
                    <span>环境</span>
                    <GlassSelect
                      options={createEnvironmentOptions}
                      value={editForm.environment}
                      onChange={(value) => updateEditForm("environment", value as ServerUpdateInput["environment"])}
                    />
                  </div>
                  <div className="field">
                    <span>生命周期</span>
                    <GlassSelect
                      options={createLifecycleOptions}
                      value={editForm.lifecycle_status}
                      onChange={(value) =>
                        updateEditForm("lifecycle_status", value as ServerUpdateInput["lifecycle_status"])
                      }
                    />
                  </div>
                  <div className="field">
                    <span className="field-label-nowrap">所属机房</span>
                    <GlassSelect
                      disabled={idcState === "loading" || !idcOptions.length}
                      options={idcOptions}
                      placeholder={idcState === "loading" ? "正在加载机房列表" : "请选择机房"}
                      value={editForm.idc ? String(editForm.idc) : ""}
                      onChange={(value) => updateEditForm("idc", value ? Number(value) : null)}
                    />
                    <small className={`field-hint${idcState === "error" ? " field-hint-error" : ""}`}>{idcSummary}</small>
                  </div>
                </div>

                <label className="field stacked-field">
                  <span>磁盘摘要</span>
                  <textarea
                    className="server-create-textarea"
                    rows={4}
                    value={editForm.disk_summary || ""}
                    onChange={(event) => updateEditForm("disk_summary", event.target.value)}
                  />
                </label>

                <div className="actions">
                  <button onClick={() => void handleSaveServer()} type="button">
                    保存修改
                  </button>
                  <button
                    className="button-ghost"
                    onClick={() => {
                      setEditOpen(false);
                      setDeleteConfirming(false);
                    }}
                    type="button"
                  >
                    取消编辑
                  </button>
                </div>

                <p className={`status ${editState}`}>{editSummary}</p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="status idle">请先从左侧列表中选择目标服务器，以查看详细资产信息。</p>
        )}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-12" id="servers-agent-monitor">
        <div className="panel-heading">
          <h2>机器上报监控</h2>
          <p>聚合展示由 agent 同步的资产记录，重点关注最近心跳、来源元数据与待核验主机，便于快速判断机器侧同步是否正常。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>主机关键词</span>
            <input
              value={agentMonitorQuery.search || ""}
              onChange={(event) => updateAgentMonitorQuery("search", event.target.value)}
            />
          </label>
          <div className="field">
            <span>环境</span>
            <GlassSelect
              options={environmentOptions}
              value={agentMonitorQuery.environment || ""}
              onChange={(value) => updateAgentMonitorQuery("environment", value)}
            />
          </div>
          <div className="field">
            <span>生命周期</span>
            <GlassSelect
              options={lifecycleOptions}
              value={agentMonitorQuery.lifecycle_status || ""}
              onChange={(value) => updateAgentMonitorQuery("lifecycle_status", value)}
            />
          </div>
        </div>

        <div className="actions">
          <button onClick={() => void refreshAgentMonitor()} type="button">
            同步监控
          </button>
          <button
            className="button-ghost"
            onClick={() => setAgentMonitorQuery(initialAgentMonitorQuery)}
            type="button"
          >
            重置条件
          </button>
        </div>

        <p className={`status ${agentMonitorState}`}>{agentMonitorSummary}</p>

        {agentMonitorPage?.results.length ? (
          <div className="query-result-grid query-result-grid-compact">
            {agentMonitorPage.results.map((server) => {
              const heartbeatState = getHeartbeatState(server.last_seen_at);
              const heartbeatLabel =
                heartbeatState === "healthy" ? "心跳正常" : heartbeatState === "stale" ? "待核验" : "未上报";
              const agentVersion =
                typeof server.metadata?.agent_version === "string" ? server.metadata.agent_version : "未记录";

              return (
                <BorderGlow as="article" className="tool-result-card tool-result-card-compact" key={server.id}>
                  <div className="tool-result-header">
                    <div>
                      <h3>{server.hostname}</h3>
                      <div className="tool-result-meta">
                        <span className="pill neutral">{server.environment}</span>
                        <span className={`pill ${heartbeatState === "healthy" ? "approved" : heartbeatState === "stale" ? "pending" : "neutral"}`}>
                          {heartbeatLabel}
                        </span>
                      </div>
                    </div>
                    <button className="button-ghost query-action-button" onClick={() => focusServerDetail(server.id)} type="button">
                      查看详情
                    </button>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>内网 IP</dt>
                      <dd>{server.internal_ip}</dd>
                    </div>
                    <div>
                      <dt>所属机房</dt>
                      <dd>{server.idc_name || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>最近心跳</dt>
                      <dd>{renderDateTimeInline(server.last_seen_at)}</dd>
                    </div>
                    <div>
                      <dt>Agent 版本</dt>
                      <dd>{agentVersion}</dd>
                    </div>
                  </dl>
                </BorderGlow>
              );
            })}
          </div>
        ) : null}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-12" id="servers-advanced-query">
        <div className="panel-heading">
          <h2>高级资产查询</h2>
          <p>面向问题排查、归属核验与环境盘点场景，可通过主机名、IP、环境、生命周期与机房编码快速缩小检索范围。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>综合关键词</span>
            <input value={toolQuery.q || ""} onChange={(event) => updateToolQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>主机名</span>
            <input value={toolQuery.hostname || ""} onChange={(event) => updateToolQuery("hostname", event.target.value)} />
          </label>
          <label className="field">
            <span>内网 IP</span>
            <input
              value={toolQuery.internal_ip || ""}
              onChange={(event) => updateToolQuery("internal_ip", event.target.value)}
            />
          </label>
          <div className="field">
            <span>环境</span>
            <GlassSelect
              options={environmentOptions}
              value={toolQuery.environment || ""}
              onChange={(value) => updateToolQuery("environment", value as ServerToolQuery["environment"])}
            />
          </div>
          <div className="field">
            <span>生命周期</span>
            <GlassSelect
              options={lifecycleOptions}
              value={toolQuery.lifecycle_status || ""}
              onChange={(value) => updateToolQuery("lifecycle_status", value as ServerToolQuery["lifecycle_status"])}
            />
          </div>
          <label className="field">
            <span>机房编码</span>
            <input value={toolQuery.idc_code || ""} onChange={(event) => updateToolQuery("idc_code", event.target.value)} />
          </label>
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
              setToolSummary("支持按主机名、IP、环境、生命周期与机房编码组合检索，适用于排障核查、归属确认与环境盘点。");
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
              <span className="filter-chip">返回 {toolResponse.summary.returned} 台</span>
              <span className="filter-chip">命中 {toolResponse.summary.count} 台</span>
              {toolResponse.summary.truncated ? <span className="filter-chip">结果已截断</span> : null}
            </div>
            <div className="query-result-grid query-result-grid-compact">
              {toolResponse.items.map((item) => (
                <BorderGlow as="article" className="tool-result-card tool-result-card-compact" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <h3>{item.hostname}</h3>
                      <div className="tool-result-meta">
                        <span className="pill neutral">{item.environment}</span>
                        <span className="pill neutral">{item.lifecycle_status}</span>
                      </div>
                    </div>
                    <button className="button-ghost query-action-button" onClick={() => focusServerDetail(item.id)} type="button">
                      查看详情
                    </button>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>内网 IP</dt>
                      <dd>{item.internal_ip}</dd>
                    </div>
                    <div>
                      <dt>机房</dt>
                      <dd>{item.idc_code} · {item.idc_name}</dd>
                    </div>
                    <div>
                      <dt>系统</dt>
                      <dd>{item.os_version}</dd>
                    </div>
                    <div>
                      <dt>最近心跳</dt>
                      <dd>{formatDateTimeZh(item.last_seen_at)}</dd>
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
