"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { acquireBodyScrollLock } from "../../lib/body-scroll-lock";

export function NativeModal({ open, titleId, onClose, busy = false, children, className = "", returnFocusRef }: {
  open: boolean; titleId: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string;
  returnFocusRef?: { readonly current: HTMLElement | null };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const returnTarget = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const releaseScrollLock = acquireBodyScrollLock();
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
      releaseScrollLock();
      const requestedTarget = returnFocusRef?.current;
      const target = requestedTarget?.isConnected ? requestedTarget : returnTarget;
      const targetIsUsable = target?.isConnected && target !== document.body && !target.closest("[inert]") && target.getClientRects().length > 0;
      const fallback = Array.from(document.querySelectorAll<HTMLElement>(".road-check-in-chip")).find((element) => element.getClientRects().length > 0 && !element.closest("[inert]"));
      (targetIsUsable ? target : fallback)?.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);
  return <dialog ref={ref} className={`road-dialog ${className}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="road-dialog-content">{children}</div>
  </dialog>;
}
