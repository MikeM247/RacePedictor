import assert from "node:assert/strict";
import test from "node:test";
import { acquireBodyScrollLock } from "../lib/body-scroll-lock.ts";

function target(overflow = "", priority = "") {
  const values = new Map(overflow ? [["overflow", { value: overflow, priority }]] : []);
  return { style: {
    getPropertyValue: (name: string) => values.get(name)?.value ?? "",
    getPropertyPriority: (name: string) => values.get(name)?.priority ?? "",
    setProperty: (name: string, value: string, priority = "") => { values.set(name, { value, priority }); },
    removeProperty: (name: string) => { const previous = values.get(name)?.value ?? ""; values.delete(name); return previous; },
  } as CSSStyleDeclaration };
}

for (const parentFirst of [false, true]) {
  test(`overlapping locks restore scrolling when ${parentFirst ? "parent" : "child"} releases first`, () => {
    const body = target();
    const parent = acquireBodyScrollLock(body);
    const child = acquireBodyScrollLock(body);
    const [first, last] = parentFirst ? [parent, child] : [child, parent];
    first();
    assert.equal(body.style.getPropertyValue("overflow"), "hidden");
    first(); // Duplicate cleanup cannot release another overlay's lock.
    assert.equal(body.style.getPropertyValue("overflow"), "hidden");
    last();
    assert.equal(body.style.getPropertyValue("overflow"), "");
    last();
    assert.equal(body.style.getPropertyValue("overflow"), "");
  });
}

for (const overflow of ["auto", "scroll", "hidden"]) {
  test(`restores the original ${overflow} value and priority`, () => {
    const body = target(overflow, "important");
    const release = acquireBodyScrollLock(body);
    assert.equal(body.style.getPropertyValue("overflow"), "hidden");
    release();
    assert.equal(body.style.getPropertyValue("overflow"), overflow);
    assert.equal(body.style.getPropertyPriority("overflow"), "important");
  });
}

test("a new acquisition after cleanup captures the current style and isolates other documents", () => {
  const body = target();
  const other = target("scroll");
  const releaseOther = acquireBodyScrollLock(other);
  acquireBodyScrollLock(body)();
  body.style.setProperty("overflow", "auto");
  acquireBodyScrollLock(body)();
  assert.equal(body.style.getPropertyValue("overflow"), "auto");
  assert.equal(other.style.getPropertyValue("overflow"), "hidden");
  releaseOther();
  assert.equal(other.style.getPropertyValue("overflow"), "scroll");
});
