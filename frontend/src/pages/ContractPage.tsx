import { contractHighlights, endpointGroups } from "../contract";

export function ContractPage() {
  return (
    <main className="workspace-grid">
      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>后端契约工作台</h2>
          <p>把当前后端文档中的关键约束、只读查询面和角色敏感路由集中展示，减少前端联调时的契约漂移。</p>
        </div>

        <div className="highlight-grid">
          {contractHighlights.map((item) => (
            <article className="highlight-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <div className="endpoint-grid">
          {endpointGroups.map((group) => (
            <article className="endpoint-card" key={group.label}>
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
