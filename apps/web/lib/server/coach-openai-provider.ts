import { boundCoachPrompt, buildCoachInstructions } from "./coach-context.ts";
import type { CoachContext } from "../../../../packages/core/src/contracts/coach-chat.ts";

const DEFAULT_MODEL = "gpt-5-mini";
const MAX_REPLY_CHARS = 8_000;
const MAX_OUTPUT_TOKENS = 3_000;

export class CoachProviderError extends Error {
  readonly safeCode: string;

  constructor(safeCode: string, message = "The coach could not complete this reply.") {
    super(message);
    this.name = "CoachProviderError";
    this.safeCode = safeCode;
  }
}

export function coachModelFromEnvironment(source: Record<string, string | undefined> = process.env) {
  const configured = source.RACEPREDICTOR_COACH_MODEL?.trim();
  return configured ? configured.slice(0, 100) : DEFAULT_MODEL;
}

export function createOpenAIChatProvider(input: {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 60_000;
  const model = input.model ?? DEFAULT_MODEL;
  return async function generateCoachReply(request: {
    context: CoachContext;
    history: readonly { role: string; text: string }[];
    userText: string;
  }) {
    const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new CoachProviderError("PROVIDER_NOT_CONFIGURED", "Coach chat is not configured yet.");
    const instructions = buildCoachInstructions(request.context);
    let messages: ReturnType<typeof boundCoachPrompt>;
    try { messages = boundCoachPrompt(instructions, request.history, request.userText); }
    catch { throw new CoachProviderError("CONTEXT_TOO_LARGE", "The current coaching context is too large to send safely."); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let response: Response;
    let payload: any;
    try {
      response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          instructions,
          input: messages,
        }),
        signal: controller.signal,
      });
      // Fetch resolves at headers; retain the timeout while reading the body.
      try { payload = await response.json(); }
      catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
        payload = null;
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new CoachProviderError("PROVIDER_TIMEOUT");
      throw new CoachProviderError("PROVIDER_UNAVAILABLE");
    } finally { clearTimeout(timer); }

    const requestId = response.headers.get("x-request-id");
    if (!response.ok) {
      if (response.status === 429) throw new CoachProviderError("PROVIDER_RATE_LIMITED");
      if (response.status >= 500) throw new CoachProviderError("PROVIDER_UNAVAILABLE");
      throw new CoachProviderError("PROVIDER_REJECTED");
    }
    if (payload?.status === "incomplete") throw new CoachProviderError("PROVIDER_INCOMPLETE");
    if (payload?.refusal || (Array.isArray(payload?.output) && payload.output.some((item: any) => Array.isArray(item?.content) && item.content.some((part: any) => part?.type === "refusal")))) {
      throw new CoachProviderError("PROVIDER_REFUSAL", "The coach could not answer that request safely. Try a different question.");
    }
    if (payload?.status !== "completed") throw new CoachProviderError("PROVIDER_INVALID_RESPONSE");
    const text = extractText(payload).trim();
    if (!text) throw new CoachProviderError("PROVIDER_EMPTY_RESPONSE");
    if (text.length > MAX_REPLY_CHARS) throw new CoachProviderError("PROVIDER_REPLY_TOO_LONG");
    return {
      text,
      metadata: {
        model,
        requestId: typeof requestId === "string" ? requestId.slice(0, 200) : null,
        inputTokens: Number.isInteger(payload?.usage?.input_tokens) ? payload.usage.input_tokens : null,
        outputTokens: Number.isInteger(payload?.usage?.output_tokens) ? payload.usage.output_tokens : null,
        latencyMs: Date.now() - startedAt,
      },
    };
  };
}

function extractText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload?.output)) throw new CoachProviderError("PROVIDER_INVALID_RESPONSE");
  const parts = payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => part.text);
  if (!parts.length || parts.some((part: unknown) => typeof part !== "string")) throw new CoachProviderError("PROVIDER_INVALID_RESPONSE");
  return parts.join("\n");
}
