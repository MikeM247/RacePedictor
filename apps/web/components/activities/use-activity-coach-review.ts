"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityCoachReviewResponse, ActivityReviewRequestResponse } from "../../../../packages/core/src/contracts/activity-review";
import { ActivityApiError, readActivityCoachReviewForActivityResponse } from "../../lib/activities-api-client";

export type ActivityReviewData = ActivityCoachReviewResponse["data"];
export type ActivityReviewReadPhase = "loading" | "ready" | "error";

type ActivityReviewReadState = {
  activityId: string;
  phase: ActivityReviewReadPhase;
  data: ActivityReviewData | null;
  message?: string;
  refreshing: boolean;
};

const initialState = (activityId: string): ActivityReviewReadState => ({
  activityId,
  phase: "loading",
  data: null,
  refreshing: false,
});

export function useActivityCoachReview(activityId: string | null) {
  const resolvedActivityId = activityId ?? "";
  const [storedState, setStoredState] = useState<ActivityReviewReadState>(() => initialState(resolvedActivityId));
  const controllerRef = useRef<AbortController | null>(null);
  const readGeneration = useRef(0);
  const writeGeneration = useRef(0);
  const state = storedState.activityId === resolvedActivityId ? storedState : initialState(resolvedActivityId);

  const load = useCallback(async () => {
    if (!activityId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = ++readGeneration.current;
    const writeVersion = writeGeneration.current;

    setStoredState((current) => current.activityId === activityId
      ? { ...current, phase: current.data ? "ready" : "loading", message: undefined, refreshing: Boolean(current.data) }
      : initialState(activityId));

    try {
      const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/coach-review`, { cache: "no-store", signal: controller.signal });
      const data = await readActivityCoachReviewForActivityResponse(response, activityId);
      if (controller.signal.aborted || generation !== readGeneration.current || writeVersion !== writeGeneration.current) return;
      setStoredState({ activityId, phase: "ready", data, refreshing: false });
    } catch (error) {
      if (controller.signal.aborted || generation !== readGeneration.current || writeVersion !== writeGeneration.current) return;
      const clearPrivateContent = error instanceof ActivityApiError && (error.status === 401 || error.status === 403);
      const message = error instanceof Error ? error.message : "Feedback could not be loaded.";
      setStoredState((current) => ({
        activityId,
        phase: "error",
        data: clearPrivateContent || current.activityId !== activityId ? null : current.data,
        message,
        refreshing: false,
      }));
    }
  }, [activityId]);

  useEffect(() => {
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const applyRequestResult = useCallback((result: ActivityReviewRequestResponse["data"]) => {
    if (!activityId) return;
    controllerRef.current?.abort();
    readGeneration.current += 1;
    writeGeneration.current += 1;
    setStoredState((current) => ({
      activityId,
      phase: "ready",
      data: {
        activityId,
        status: result.status,
        review: current.activityId === activityId ? current.data?.review ?? null : null,
        requestId: result.requestId,
        updatedAt: result.updatedAt,
        readRevision: current.activityId === activityId ? current.data?.readRevision ?? null : null,
      },
      refreshing: false,
    }));
  }, [activityId]);

  return { ...state, load, applyRequestResult };
}
