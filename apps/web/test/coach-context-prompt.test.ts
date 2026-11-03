import assert from "node:assert/strict";
import test from "node:test";
import { boundCoachPrompt, modelPromptBudgetBytes } from "../lib/server/coach-context.ts";

test("prompt budgeting preserves the complete long current message and drops oldest history first", () => {
  const currentText = "race reflection ".repeat(1_800);
  const history = Array.from({ length: 12 }, (_, index) => ({ role: "user", text: `history-${index} ${"x".repeat(28_000)}` }));
  const messages = boundCoachPrompt("Keep coaching instructions intact.", history, currentText);
  assert.equal(messages.at(-1)?.content, currentText);
  assert.ok(messages.length > 1);
  assert.ok(messages.length < history.length + 1);
  assert.ok(messages.every(({ content }) => !content.includes("history-0")));
});

test("prompt budgeting rejects an oversized current message rather than truncating it", () => {
  assert.throws(() => boundCoachPrompt("instructions", [], "x".repeat(300_000)), /COACH_CONTEXT_TOO_LARGE/u);
});

test("prompt budget follows the configured model context window", () => {
  assert.equal(modelPromptBudgetBytes("gpt-5-mini"), 256 * 1024);
  assert.equal(modelPromptBudgetBytes("gpt-4o-mini"), 124_000);
  assert.equal(modelPromptBudgetBytes("gpt-4-turbo"), 124_000);
  assert.equal(modelPromptBudgetBytes("gpt-4-legacy"), 4_192);
  assert.equal(modelPromptBudgetBytes("custom-model"), 48 * 1024);
});

test("a smaller model budget drops history and preserves the complete current message", () => {
  const currentText = "current reflection ".repeat(1_000);
  const history = Array.from({ length: 4 }, (_, index) => ({ role: "user", text: `history-${index} ${"x".repeat(38_000)}` }));
  const messages = boundCoachPrompt("instructions", history, currentText, "gpt-4o-mini");
  assert.equal(messages.at(-1)?.content, currentText);
  assert.ok(messages.length < history.length + 1);
  assert.ok(messages.every(({ content }) => !content.includes("history-0")));
});
