"use client";

import { useCallback, useEffect, useState } from "react";
import type { MilestoneTimeline } from "../../../packages/core/src/contracts/milestone-timeline.ts";
import { loadMilestoneTimeline } from "./milestone-timeline-client.ts";

export function useMilestoneTimeline(includeRemoved = false, refreshKey = 0) {
  const [data, setData] = useState<MilestoneTimeline | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [retry, setRetry] = useState(0);
  const refresh = useCallback(() => setRetry((value) => value + 1), []);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", visible); window.addEventListener("milestones-changed", refresh);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60_000);
    return () => {
      window.removeEventListener("focus", visible); window.removeEventListener("milestones-changed", refresh);
      document.removeEventListener("visibilitychange", visible); window.clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController(); setRefreshing(true);
    void loadMilestoneTimeline(includeRemoved, controller.signal).then((view) => {
      if (!controller.signal.aborted) { setData(view); setError(""); }
    }).catch((cause) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Milestones could not be loaded.");
        if (cause instanceof Error && cause.message === "Milestone access is unavailable.") setData(null);
      }
    }).finally(() => { if (!controller.signal.aborted) setRefreshing(false); });
    return () => controller.abort();
  }, [includeRemoved, refreshKey, retry]);
  return { data, error, refreshing, refresh, accept: setData };
}
