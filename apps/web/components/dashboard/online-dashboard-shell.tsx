"use client";

import { useEffect, useState } from "react";
import type { DashboardFetchResult } from "../../../../packages/core/src/contracts/dashboard.ts";
import type { OnlineStatus } from "../../../../packages/core/src/contracts/sync.ts";
import { toDashboardViewModel } from "../../lib/dashboard-view-model.ts";
import { DashboardShell } from "./dashboard-shell.tsx";

type State =
  | { kind: "loading" }
  | { kind: "ready"; overview: DashboardFetchResult }
  | { kind: "error"; message: string };

type StatusState =
  | { kind: "loading" }
  | { kind: "ready"; status: OnlineStatus }
  | { kind: "error"; message: string };

const unavailableDashboard = (message: string) => toDashboardViewModel({
  fetchStatus: "error",
  errorMessage: message,
  stale: { isStale: false, staleReason: null, staleAtIso: null },
});

export function OnlineDashboardShell() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [statusState, setStatusState] = useState<StatusState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/dashboard/overview", { cache: "no-store" }).then(async (overviewResponse) => {
      if (!overviewResponse.ok) throw new Error("Online dashboard data is temporarily unavailable.");
      const overview = await overviewResponse.json() as DashboardFetchResult;
      if (active) setState({ kind: "ready", overview });
    }).catch((error) => {
      if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "Online dashboard data is unavailable." });
    });

    void fetch("/api/v1/sync/status", { cache: "no-store" }).then(async (statusResponse) => {
      if (!statusResponse.ok) throw new Error("Freshness details are temporarily unavailable.");
      const statusEnvelope = await statusResponse.json() as { data?: OnlineStatus };
      if (!statusEnvelope.data) throw new Error("Freshness details are temporarily unavailable.");
      if (active) setStatusState({ kind: "ready", status: statusEnvelope.data });
    }).catch((error) => {
      if (active) setStatusState({ kind: "error", message: error instanceof Error ? error.message : "Freshness details are unavailable." });
    });
    return () => { active = false; };
  }, []);

  const viewModel = state.kind === "ready"
    ? toDashboardViewModel(state.overview)
    : unavailableDashboard(state.kind === "error" ? state.message : "Recent analytics are loading.");

  return <DashboardShell
    {...viewModel}
    analyticsLoading={state.kind === "loading"}
    onlineStatus={statusState.kind === "ready" ? statusState.status : null}
    onlineStatusLoading={statusState.kind === "loading"}
    onlineStatusError={statusState.kind === "error" ? statusState.message : null}
    onAnalyticsRetry={state.kind === "error" ? () => window.location.reload() : undefined}
  />;
}
