"use client";
import { useEffect, useState } from "react";
import {
  homeTrainingSchema,
  type HomeTraining,
} from "../../../packages/core/src/contracts/home-training.ts";
export function useHomeTraining(refreshKey: number) {
  const [data, setData] = useState<HomeTraining | null>(null),
    [errors, setErrors] = useState({ lastRun: false, nextSession: false }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/dashboard/training-summary", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Summary unavailable");
        return homeTrainingSchema.parse((await r.json()).data);
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData((previous) =>
          previous
            ? {
                ...next,
                lastRun:
                  next.lastRun.status === "unavailable" &&
                  previous.lastRun.status === "ready"
                    ? previous.lastRun
                    : next.lastRun,
                nextSession:
                  next.nextSession.status === "unavailable" &&
                  previous.nextSession.status === "ready"
                    ? previous.nextSession
                    : next.nextSession,
              }
            : next,
        );
        setErrors({
          lastRun: next.lastRun.status === "unavailable",
          nextSession: next.nextSession.status === "unavailable",
        });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setErrors({ lastRun: true, nextSession: true });
      });
    return () => controller.abort();
  }, [refreshKey, retry]);
  return { data, errors, refresh: () => setRetry((x) => x + 1) };
}
