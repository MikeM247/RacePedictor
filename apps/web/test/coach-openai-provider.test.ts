import assert from "node:assert/strict";
import test from "node:test";
import { coachContextSchema } from "../../../packages/core/src/contracts/coach-chat.ts";
import { createOpenAIChatProvider, CoachProviderError } from "../lib/server/coach-openai-provider.ts";

const context = coachContextSchema.parse({
  localDate: "2026-10-22", timezone: "Africa/Johannesburg", fingerprint: "a".repeat(64),
  suggestedTopic: "prepare", selectedTopic: "prepare",
  opening: { kind: "prepare", text: "Your next session is an easy run." },
  sources: { goal: "available", plan: "available", activity: "missing", schedule: "available", wellbeing: "missing" },
  goal: { title: "Build toward a 10K", target: null }, plan: { id: "plan_12345678", version: 1, approvalHash: "b".repeat(64) },
  todaySchedule: { kind: "unscheduled", message: "No session is scheduled today." }, latestActivity: null,
  nextSession: { id: "session_12345678", planId: "plan_12345678", date: "2026-10-23", title: "Easy run", kind: "run", status: "upcoming", revision: 1, purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", durationMinutes: 30, distanceMeters: null, startTime: "06:00", cautions: ["Stop if pain changes your gait."], warnings: [] },
  recentActivities: [], wellbeing: null, actions: [], selectedRecord: { type: "session", id: "session_12345678" },
  ambiguousSessionIds: [], ambiguousSessions: [], canSend: true,
});

const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { "content-type": "application/json", "x-request-id": "req-synthetic-1" },
});

test("OpenAI adapter requests a private complete text response without tools", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const provider = createOpenAIChatProvider({
    apiKey: "synthetic-test-key", model: "gpt-5-mini", timeoutMs: 100,
    fetchImpl: async (input, init) => {
      requestUrl = String(input); requestInit = init;
      return response({ status: "completed", output_text: "Keep the run conversational and stop if pain changes your stride.", usage: { input_tokens: 55, output_tokens: 12 } });
    },
  });
  const result = await provider({ context, history: [], userText: "What is the purpose of tomorrow's run?" });
  assert.equal(requestUrl, "https://api.openai.com/v1/responses");
  assert.equal((requestInit?.headers as Record<string, string>).authorization, "Bearer synthetic-test-key");
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.model, "gpt-5-mini");
  assert.equal(body.store, false);
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.equal(body.max_output_tokens, 3000);
  assert.equal("tools" in body, false);
  assert.match(body.instructions, /Never claim to save or change/u);
  assert.equal(result.text, "Keep the run conversational and stop if pain changes your stride.");
  assert.equal(result.metadata.requestId, "req-synthetic-1");
  assert.equal(result.metadata.inputTokens, 55);
  assert.equal(result.metadata.outputTokens, 12);
});

test("OpenAI adapter reports missing credentials before making a request", async () => {
  let called = false;
  const provider = createOpenAIChatProvider({ apiKey: "", fetchImpl: async () => { called = true; return response({}); } });
  await assert.rejects(provider({ context, history: [], userText: "Hi" }), (error: unknown) => error instanceof CoachProviderError && error.safeCode === "PROVIDER_NOT_CONFIGURED");
  assert.equal(called, false);
});

test("OpenAI adapter safely rejects incomplete, refusal, malformed, and oversized responses", async () => {
  const rejected = async (payload: unknown, safeCode: string) => {
    const provider = createOpenAIChatProvider({ apiKey: "synthetic-test-key", fetchImpl: async () => response(payload) });
    await assert.rejects(provider({ context, history: [], userText: "Hi" }), (error: unknown) => error instanceof CoachProviderError && error.safeCode === safeCode);
  };
  await rejected({ status: "incomplete", output_text: "Partial" }, "PROVIDER_INCOMPLETE");
  await rejected({ status: "completed", output: [{ content: [{ type: "refusal", refusal: "No" }] }] }, "PROVIDER_REFUSAL");
  await rejected({ status: "completed", output: [] }, "PROVIDER_INVALID_RESPONSE");
  await rejected({ status: "failed", output_text: "Do not publish a failed response." }, "PROVIDER_INVALID_RESPONSE");
  await rejected({ output_text: "No completion status." }, "PROVIDER_INVALID_RESPONSE");
  await rejected({ status: "completed", output: {} }, "PROVIDER_INVALID_RESPONSE");
  await rejected({ status: "completed", output_text: "x".repeat(8_001) }, "PROVIDER_REPLY_TOO_LONG");
});

test("OpenAI adapter retains all text parts in a complete reply", async () => {
  const provider = createOpenAIChatProvider({ apiKey: "synthetic-test-key", fetchImpl: async () => response({
    status: "completed", output: [{ type: "message", content: [
      { type: "output_text", text: "Keep the effort easy." },
      { type: "output_text", text: "Stop if pain changes your gait." },
    ] }],
  }) });
  assert.equal((await provider({ context, history: [], userText: "How should I prepare?" })).text,
    "Keep the effort easy.\nStop if pain changes your gait.");
});

test("OpenAI adapter timeout includes a stalled response body after headers arrive", async () => {
  const provider = createOpenAIChatProvider({ apiKey: "synthetic-test-key", timeoutMs: 10, fetchImpl: async (_url, init) => {
    return new Response(new ReadableStream({ start(controller) {
      const fallback = setTimeout(() => controller.close(), 200);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(fallback);
        controller.error(new DOMException("Body read aborted", "AbortError"));
      }, { once: true });
    } }), { headers: { "content-type": "application/json" } });
  } });
  await assert.rejects(provider({ context, history: [], userText: "Hi" }),
    (error: unknown) => error instanceof CoachProviderError && error.safeCode === "PROVIDER_TIMEOUT");
});

test("OpenAI adapter maps request timeout and upstream rate limits to safe errors", async () => {
  const timeout = createOpenAIChatProvider({ apiKey: "synthetic-test-key", fetchImpl: async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); } });
  await assert.rejects(timeout({ context, history: [], userText: "Hi" }), (error: unknown) => error instanceof CoachProviderError && error.safeCode === "PROVIDER_TIMEOUT");
  const limited = createOpenAIChatProvider({ apiKey: "synthetic-test-key", fetchImpl: async () => response({ error: "secret provider payload" }, 429) });
  await assert.rejects(limited({ context, history: [], userText: "Hi" }), (error: unknown) => error instanceof CoachProviderError && error.safeCode === "PROVIDER_RATE_LIMITED" && !error.message.includes("secret"));
});
