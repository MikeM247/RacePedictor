// Share background isolation between native dialogs and existing portaled details.
// Counts preserve inert state when an activity dialog temporarily covers Day details.
const isolated = new WeakMap<HTMLElement, { count: number; original: boolean }>();
let scrollLocks = 0;
let previousOverflow = "";
export function lockModalScroll() {
  if (scrollLocks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  return () => { if (--scrollLocks === 0) document.body.style.overflow = previousOverflow; };
}
export function isolateModal(dialog: HTMLElement) {
  const background: HTMLElement[] = [];
  let current: HTMLElement = dialog;
  while (current.parentElement) {
    for (const sibling of Array.from(current.parentElement.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === current || sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
      const state = isolated.get(sibling) ?? { count: 0, original: sibling.inert };
      state.count += 1; isolated.set(sibling, state); sibling.inert = true; background.push(sibling);
    }
    current = current.parentElement;
    if (current === document.body) break;
  }
  return () => background.forEach(element => {
    const state = isolated.get(element);
    if (!state) return;
    if (--state.count === 0) { element.inert = state.original; isolated.delete(element); }
  });
}
let activeNative: { token: symbol; close: () => void; busy: () => boolean } | null = null;
export function claimNativeModal(token: symbol, close: () => void, busy: () => boolean) {
  if (activeNative && activeNative.token !== token) {
    if (activeNative.busy()) return false;
    activeNative.close();
  }
  activeNative = { token, close, busy };
  return true;
}
export function releaseNativeModal(token: symbol) { if (activeNative?.token === token) activeNative = null; }
