import { contractHighlights, endpointGroups } from "../contract";

export function ContractPage() {
  return (
    <main className="workspace-grid">
      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>Backend contract workspace</h2>
          <p>
            Keep these anchors close while building pages. They mirror the current backend docs and
            make contract drift easier to spot early.
          </p>
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
