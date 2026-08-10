"use client";

import { useEffect, useState } from "react";
import type { DashboardFetchResult } from "../../../../packages/core/src/contracts/dashboard.ts";
import type { OnlineStatus } from "../../../../packages/core/src/contracts/sync.ts";
import { toDashboardViewModel } from "../../lib/dashboard-view-model.ts";
import { DashboardNavigation } from "./dashboard-navigation.tsx";
import { DashboardShell } from "./dashboard-shell.tsx";

type State =
  | { kind: "loading" }
  | { kind: "ready"; overview: DashboardFetchResult; status: OnlineStatus | null }
  | { kind: "error"; message: string };

export function OnlineDashboardShell() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/v1/dashboard/overview", { cache: "no-store" }),
      fetch("/api/v1/sync/status", { cache: "no-store" }),
    ]).then(async ([overviewResponse, statusResponse]) => {
      if (!overviewResponse.ok) throw new Error("Online dashboard data is temporarily unavailable.");
      const overview = await overviewResponse.json() as DashboardFetchResult;
      const statusEnvelope = statusResponse.ok ? await statusResponse.json() as { data: OnlineStatus } : null;
      if (active) setState({ kind: "ready", overview, status: statusEnvelope?.data ?? null });
    }).catch((error) => {
      if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "Online dashboard data is unavailable." });
    });
    return () => { active = false; };
  }, []);

  if (state.kind === "ready") {
    return <DashboardShell {...toDashboardViewModel(state.overview)} onlineStatus={state.status} />;
  }

  return (
    <main className="dashboard-layout">
      <DashboardNavigation activePage="today" />
      <div className="dashboard-main">
        <header className="dashboard-toolbar"><div><h2>Today</h2><p>Online RacePredictor</p></div></header>
        <section className="dashboard-content">
          <section className="state-panel" role={state.kind === "error" ? "alert" : "status"} aria-live="polite">
            <h3>{state.kind === "loading" ? "Loading your online dashboard" : "Unable to load online data"}</h3>
            <p>{state.kind === "loading" ? "Checking workout and Second Brain freshness…" : state.message}</p>
            {state.kind === "error" ? <button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button> : null}
          </section>
        </section>
      </div>
    </main>
  );
}
