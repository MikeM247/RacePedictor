"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalKeyboard } from "../coaching/use-modal-keyboard";
import "./activity-detail-dialog.css";

export type ActivityDisclosureState = { telemetry: boolean; splits: boolean; route: boolean };

export function ActivityDetailDialog({ open, title, parentLabel, onClose, returnFocusRef, fallbackFocus, status = "ready", error, onRetry, children }: {
  open: boolean;
  title: string;
  parentLabel: string;
  onClose: () => void;
  returnFocusRef?: { current: HTMLElement | null };
  fallbackFocus?: () => HTMLElement | null;
  status?: "loading" | "ready" | "error";
  error?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const previousStatus = useRef(status);
  const dialog = useModalKeyboard<HTMLElement>(open && Boolean(portal), onClose, returnFocusRef, fallbackFocus, true);

  useEffect(() => {
    if (!open) return;
    const element = document.createElement("div");
    element.className = "activity-dialog-portal";
    document.body.append(element);
    setPortal(element);
    return () => { element.remove(); setPortal(null); };
  }, [open]);

  useEffect(() => {
    if (!open || !portal) return;
    const background = Array.from(document.body.children).filter(element => element !== portal) as HTMLElement[];
    const previous = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    return () => background.forEach((element, index) => { element.inert = previous[index]; });
  }, [open, portal]);

  useEffect(() => {
    if (!open || !portal) return;
    if (previousStatus.current === status) return;
    previousStatus.current = status;
    // Retry replaces the focused error action. Keep keyboard dismissal and
    // navigation anchored inside the dialog through each loading transition.
    const frame = window.requestAnimationFrame(() => dialog.dialogRef.current?.querySelector<HTMLElement>(".detail-back-button")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open, portal, status]);

  if (!open || !portal) return null;
  const heading = title || (status === "loading" ? "Loading activity" : status === "error" ? "Activity unavailable" : "Activity details");
  return createPortal(<div className="activity-detail-backdrop">
    <section ref={dialog.dialogRef} onKeyDown={dialog.onKeyDown} className="activity-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="activity-dialog-title" tabIndex={-1}>
      <header className="activity-dialog-header"><button autoFocus className="detail-back-button" type="button" onClick={onClose}>← {parentLabel}</button><h1 id="activity-dialog-title" tabIndex={-1}>{heading}</h1></header>
      <div className="activity-dialog-content" key={status}>
        {status === "loading" ? <p role="status" aria-live="polite">Loading activity details…</p>
          : status === "error" ? <section className="activity-detail-error" role="alert"><h2>Unable to load this activity</h2><p>{error || "Activity details are temporarily unavailable. Try again without losing your place."}</p>{onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button> : null}</section>
            : children ?? <p role="status">Activity details are unavailable.</p>}
      </div>
    </section>
  </div>, portal);
}
