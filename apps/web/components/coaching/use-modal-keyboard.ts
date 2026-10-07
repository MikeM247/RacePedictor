"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

const selector = ["button:not([disabled])", "input:not([disabled])", "textarea:not([disabled])", "select:not([disabled])", "summary", "a[href]", "[contenteditable='true']", "[tabindex]:not([tabindex='-1'])"].join(",");

function focusableElements(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLElement>(selector) ?? []).filter(element => {
    if (!element.isConnected || element.closest("[inert]") || element.matches(":disabled")) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  });
}

export function useModalKeyboard<T extends HTMLElement>(open: boolean, close: () => void, returnFocusRef?: { current: HTMLElement | null }, fallbackFocus?: () => HTMLElement | null, preserveScroll = false) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(close);
  const requestedCloseFocus = useRef<(() => HTMLElement | null) | null>(null);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    requestedCloseFocus.current = null;
    const returnTarget = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>("[autofocus]") ?? focusableElements(dialogRef.current)[0] ?? dialogRef.current;
      target?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => {
        // A restored list may replace the row node while the dialog is open.
        // Prefer the current ref so focus does not target a detached node.
        const target = requestedCloseFocus.current?.() ?? returnFocusRef?.current ?? returnTarget;
        requestedCloseFocus.current = null;
        if (target?.isConnected && !target.closest("[inert]") && (!preserveScroll || (target.getClientRects().length > 0 && target.tagName !== "BODY"))) target.focus({ preventScroll: preserveScroll });
        else fallbackFocus?.()?.focus({ preventScroll: preserveScroll });
      });
    };
  }, [open]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(dialogRef.current);
    if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  }

  return { dialogRef, onKeyDown, requestCloseFocus: (target: () => HTMLElement | null) => { requestedCloseFocus.current = target; } };
}
