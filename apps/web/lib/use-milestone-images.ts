"use client";
import { useEffect, useState, useCallback } from "react";
import {
  imageViewSchema,
  type ImageView,
} from "../../../packages/core/src/contracts/milestone-images.ts";
export function useMilestoneImages(enabled = true, refreshKey = 0) {
  const [data, setData] = useState<ImageView | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const refresh = useCallback(() => setRetry((x) => x + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const onChange = () => refresh();
    window.addEventListener("milestone-images-changed", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener("milestone-images-changed", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [enabled, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/v1/coaching/milestone-images", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Milestone images are unavailable. Reload before making changes.",
          );
        return imageViewSchema.parse((await r.json()).data);
      })
      .then((x) => {
        if (!controller.signal.aborted) {
          setData(x);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Images unavailable");
      });
    return () => controller.abort();
  }, [enabled, refreshKey, retry]);
  return { data, error, refresh, accept: setData };
}
