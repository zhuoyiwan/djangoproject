import { Link } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../app/auth";
import { contractHighlights } from "../contract";
import { getHealth } from "../lib/api";
import type { RequestState } from "../types";

export function OverviewPage() {
  const { baseUrl, profile } = useAuth();
  const [healthState, setHealthState] = useState<RequestState>("idle");
  const [healthSummary, setHealthSummary] = useState("No live probe has been run in this session.");

  async function handleHealthCheck() {
    setHealthState("loading");
    setHealthSummary("Checking backend health ...");
    try {
      const response = await getHealth(baseUrl);
      setHealthState("success");
      setHealthSummary(`Backend healthy. Response keys: ${Object.keys(response).join(", ")}.`);
    } catch (error) {
      setHealthState("error");
      setHealthSummary((error as Error).message);
    }
  }

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>Workspace overview</h2>
          <p>
            This dashboard keeps the contract-first workflow visible while giving you a quick path
            into authenticated CMDB browsing.
          </p>
        </div>

        <div className="summary-grid">
          <article className="summary-card">
            <span>Signed in as</span>
            <strong>{profile?.display_name || profile?.username}</strong>
            <small>{profile?.email || "No email set"}</small>
          </article>
          <article className="summary-card">
            <span>Backend base URL</span>
            <strong>{baseUrl}</strong>
            <small>Changeable from the header at any time.</small>
          </article>
          <article className="summary-card">
            <span>Primary data path</span>
            <strong>/api/v1/cmdb/servers/</strong>
            <small>Read-only by default for authenticated users.</small>
          </article>
        </div>

        <div className="actions">
          <button onClick={() => void handleHealthCheck()} type="button">
            Probe health
          </button>
          <Link className="button-link" to="/servers">
            Open CMDB workspace
          </Link>
          <Link className="button-link" to="/automation">
            Open automation workspace
          </Link>
          <Link className="button-link button-link-ghost" to="/contract">
            Review contract
          </Link>
        </div>

        <p className={`status ${healthState}`}>{healthSummary}</p>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>Contract reminders</h2>
          <p>Highlights that should stay visible while frontend work expands.</p>
        </div>

        <div className="stack-grid">
          {contractHighlights.slice(0, 3).map((item) => (
            <article className="highlight-card compact-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
