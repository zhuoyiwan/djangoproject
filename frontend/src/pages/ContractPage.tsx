import { contractHighlights, endpointGroups } from "../contract";
import { BorderGlow } from "../components/BorderGlow";
import { useAuth } from "../app/auth";

export function ContractPage() {
  const { baseUrl } = useAuth();
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const schemaUrl = `${normalizedBaseUrl}/api/schema/`;
  const swaggerUrl = `${normalizedBaseUrl}/api/docs/`;
  const redocUrl = `${normalizedBaseUrl}/api/redoc/`;

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-12">
        <div className="panel-heading">
          <h2>后端契约工作台</h2>
          <p>把当前后端文档中的关键约束、只读查询面和角色敏感路由集中展示，减少前端联调时的契约漂移。</p>
        </div>

        <div className="summary-grid">
          <BorderGlow as="article" className="summary-card">
            <span>当前接入地址</span>
            <strong>{normalizedBaseUrl}</strong>
            <small>契约页中的在线文档入口会直接基于当前服务地址打开。</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>联调提示</span>
            <strong>先看契约，再调接口</strong>
            <small>建议先核对 Schema 与权限边界，再进入具体模块验证请求与返回形状。</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>推荐顺序</span>
            <strong>Schema → Swagger → 页面联调</strong>
            <small>先确认字段与响应结构，再回到工作台页面执行交互验证。</small>
          </BorderGlow>
        </div>

        <div className="actions contract-entry-actions">
          <a className="button-link" href={swaggerUrl} rel="noreferrer" target="_blank">
            打开 Swagger
          </a>
          <a className="button-link" href={redocUrl} rel="noreferrer" target="_blank">
            打开 Redoc
          </a>
          <a className="button-link button-link-ghost" href={schemaUrl} rel="noreferrer" target="_blank">
            查看 Schema JSON
          </a>
        </div>

        <div className="highlight-grid">
          {contractHighlights.map((item) => (
            <BorderGlow as="article" className="highlight-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </BorderGlow>
          ))}
        </div>

        <div className="endpoint-grid">
          {endpointGroups.map((group) => (
            <BorderGlow as="article" className="endpoint-card" key={group.label}>
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </BorderGlow>
          ))}
        </div>

        <BorderGlow as="article" className="highlight-card compact-card contract-entry-card">
          <h3>联调入口</h3>
          <p>当前页面已经承接在线 Schema、Swagger 与 Redoc 文档入口，可直接作为内部开发协作与接口核对的统一起点。</p>
        </BorderGlow>
      </BorderGlow>
    </main>
  );
}
