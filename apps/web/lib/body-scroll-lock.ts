type ScrollTarget = Pick<HTMLElement, "style">;

const locks = new WeakMap<ScrollTarget, { count: number; overflow: string; priority: string }>();

/** Overlapping overlays release independently, including when their parents unmount first. */
export function acquireBodyScrollLock(body: ScrollTarget = document.body): () => void {
  let lock = locks.get(body);
  if (!lock) {
    lock = { count: 0, overflow: body.style.getPropertyValue("overflow"), priority: body.style.getPropertyPriority("overflow") };
    locks.set(body, lock);
    body.style.setProperty("overflow", "hidden");
  }
  lock.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lock.count -= 1;
    if (lock.count > 0) return;
    if (lock.overflow) body.style.setProperty("overflow", lock.overflow, lock.priority);
    else body.style.removeProperty("overflow");
    locks.delete(body);
  };
}
