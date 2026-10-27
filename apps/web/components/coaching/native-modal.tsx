"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function NativeModal({ open, titleId, onClose, busy = false, children, className = "" }: {
  open: boolean; titleId: string; onClose: () => void; busy?: boolean; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      const target = returnTarget?.isConnected && returnTarget !== document.body
        ? returnTarget : document.querySelector<HTMLElement>(".road-check-in-chip");
      target?.focus({ preventScroll: true });
    };
  }, [open]);
  return <dialog ref={ref} className={`road-dialog ${className}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="road-dialog-content">{children}</div>
  </dialog>;
}
