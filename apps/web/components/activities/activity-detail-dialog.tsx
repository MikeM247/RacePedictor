"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalKeyboard } from "../coaching/use-modal-keyboard";
import "./activity-detail-dialog.css";

export type ActivityDisclosureState = { telemetry: boolean; splits: boolean; route: boolean };

export function ActivityDetailDialog({ open, title, parentLabel, onClose, returnFocusRef, fallbackFocus, status = "ready", error, onRetry, children, presentation = "modal" }: {
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
  presentation?: "modal" | "inline";
}) {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const previousStatus = useRef(status);
  const inlineBackButton = useRef<HTMLButtonElement>(null);
  const inline = presentation === "inline";
  const dialog = useModalKeyboard<HTMLElement>(open && !inline && Boolean(portal), onClose, returnFocusRef, fallbackFocus, true);
  const onInlineKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
    window.requestAnimationFrame(() => {
      const target = returnFocusRef?.current ?? fallbackFocus?.();
      target?.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    if (!open || inline) return;
    const element = document.createElement("div");
    element.className = "activity-dialog-portal";
    document.body.append(element);
    setPortal(element);
    return () => { element.remove(); setPortal(null); };
  }, [open, inline]);

  useEffect(() => {
    if (!open || !inline) return;
    const frame = window.requestAnimationFrame(() => inlineBackButton.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open, inline]);

  useEffect(() => {
    if (!open || inline || !portal) return;
    if (previousStatus.current === status) return;
    previousStatus.current = status;
    // Retry replaces the focused error action. Keep keyboard dismissal and
    // navigation anchored inside the dialog through each loading transition.
    const frame = window.requestAnimationFrame(() => dialog.dialogRef.current?.querySelector<HTMLElement>(".detail-back-button")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open, inline, portal, status]);

  if (!open) return null;
  const heading = title || (status === "loading" ? "Loading activity" : status === "error" ? "Activity unavailable" : "Activity details");
  const content = <section ref={inline ? undefined : dialog.dialogRef} onKeyDown={inline ? onInlineKeyDown : dialog.onKeyDown} className={inline ? "activity-detail-inline" : "activity-detail-dialog"} role="dialog" aria-modal={inline ? undefined : true} aria-labelledby="activity-dialog-title" tabIndex={-1}>
      <header className="activity-dialog-header"><button ref={inline ? inlineBackButton : undefined} autoFocus={!inline} className="detail-back-button" type="button" onClick={onClose}>← {parentLabel}</button><h1 id="activity-dialog-title" tabIndex={-1}>{heading}</h1></header>
      <div className="activity-dialog-content" key={status}>
        {status === "loading" ? <p role="status" aria-live="polite">Loading activity details…</p>
          : status === "error" ? <section className="activity-detail-error" role="alert"><h2>Unable to load this activity</h2><p>{error || "Activity details are temporarily unavailable. Try again without losing your place."}</p>{onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button> : null}</section>
            : children ?? <p role="status">Activity details are unavailable.</p>}
      </div>
    </section>;
  if (inline) return content;
  if (!portal) return null;
  return createPortal(<div className="activity-detail-backdrop">{content}</div>, portal);
}
