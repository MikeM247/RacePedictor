"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { claimNativeModal, isolateModal, lockModalScroll, releaseNativeModal } from "./modal-ownership";

export function NativeModal({ open, titleId, onClose, busy = false, children, className = "", returnFocusId, initialFocusId }: {
  open: boolean; titleId: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string; returnFocusId?: string; initialFocusId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const token = useRef(Symbol("modal"));
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    if (!claimNativeModal(token.current, () => closeRef.current(), () => busyRef.current)) { closeRef.current(); return; }
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockScroll = lockModalScroll();
    if (!dialog.open) dialog.showModal();
    const restoreBackground = isolateModal(dialog);
    if (initialFocusId) document.getElementById(initialFocusId)?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      restoreBackground();
      releaseNativeModal(token.current);
      unlockScroll();
      const target = [(returnFocusId ? document.getElementById(returnFocusId) : null), returnTarget, document.getElementById("app-menu-button"), document.querySelector<HTMLElement>(".rail-toggle")]
        .find(candidate => candidate?.isConnected && candidate !== document.body && candidate.getClientRects().length > 0 && !candidate.closest("[inert]"));
      target?.focus({ preventScroll: true });
    };
  }, [open, returnFocusId, initialFocusId]);
  return <dialog ref={ref} className={`road-dialog ${className}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="road-dialog-content">{children}</div>
  </dialog>;
}
