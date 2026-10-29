import assert from "node:assert/strict";
import test from "node:test";
import { CoachVoiceProviderError, createOpenAICoachVoiceProvider, normalizeCoachSpeechText, splitCoachSpeechText } from "../lib/server/coach-voice-provider.ts";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("OpenAI speech adapter sends only bounded canonical audio and requests English transcription", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const provider = createOpenAICoachVoiceProvider({ apiKey: "synthetic", fetchImpl: async (input, request) => {
    url = String(input); init = request; return json({ text: "Easy effort, then recover." });
  } });
  const transcript = await provider.transcribe(new Uint8Array([1, 2, 3]), new AbortController().signal);
  assert.equal(transcript, "Easy effort, then recover.");
  assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal((init?.headers as Record<string, string>).authorization, "Bearer synthetic");
  const form = init?.body as FormData;
  assert.equal(form.get("model"), "whisper-1");
  assert.equal(form.get("language"), "en");
  assert.equal(form.get("response_format"), "verbose_json");
  assert.equal((form.get("file") as File).type, "audio/wav");
});

test("speech adapter rejects silence, empty and oversized transcripts without returning provider text", async () => {
  const noSpeech = createOpenAICoachVoiceProvider({ apiKey: "synthetic", fetchImpl: async () => json({ text: " ", segments: [{ no_speech_prob: 0.9 }] }) });
  await assert.rejects(noSpeech.transcribe(new Uint8Array([1]), new AbortController().signal), (error: unknown) => error instanceof CoachVoiceProviderError && error.safeCode === "VOICE_NO_SPEECH");
  const long = createOpenAICoachVoiceProvider({ apiKey: "synthetic", fetchImpl: async () => json({ text: "x".repeat(16_001) }) });
  await assert.rejects(long.transcribe(new Uint8Array([1]), new AbortController().signal), (error: unknown) => error instanceof CoachVoiceProviderError && error.safeCode === "VOICE_TRANSCRIPT_TOO_LONG");
  const failure = createOpenAICoachVoiceProvider({ apiKey: "synthetic", fetchImpl: async () => json({ error: "private upstream detail" }, 401) });
  await assert.rejects(failure.transcribe(new Uint8Array([1]), new AbortController().signal), (error: unknown) => error instanceof CoachVoiceProviderError && !error.message.includes("private upstream detail"));
});

test("OpenAI speech adapter sends a single normalized text chunk and returns bounded MP3 bytes", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const provider = createOpenAICoachVoiceProvider({ apiKey: "synthetic", fetchImpl: async (input, request) => {
    url = String(input); init = request; return new Response(new Uint8Array([0x49, 0x44, 0x33]));
  } });
  const audio = await provider.synthesize("Keep the first kilometre easy.", new AbortController().signal);
  assert.deepEqual([...audio], [0x49, 0x44, 0x33]);
  assert.equal(url, "https://api.openai.com/v1/audio/speech");
  const body = JSON.parse(String(init?.body));
  assert.deepEqual(body, { model: "tts-1", voice: "onyx", input: "Keep the first kilometre easy.", response_format: "mp3", speed: 1 });
  assert.equal((init?.headers as Record<string, string>).authorization, "Bearer synthetic");
});

test("speech formatting preserves meaning, normalizes pace units and chunks all text", () => {
  const text = "## Warm up\n\nKeep **easy effort** near 5 km pace at 12 km/h.\nRead [the plan](https://example.test/secret-path), then run 03:00 / km. Do not speak https://secret.test/path.";
  const normalized = normalizeCoachSpeechText(text);
  assert.match(normalized, /Warm up/u);
  assert.match(normalized, /easy effort/u);
  assert.match(normalized, /5 kilometres/u);
  assert.match(normalized, /12 kilometres per hour/u);
  assert.match(normalized, /3 minutes per kilometre/u);
  assert.doesNotMatch(normalized, /secret-path|https/u);
  assert.doesNotMatch(normalized, /03:00/u);
  const source = Array.from({ length: 5 }, (_, index) => `Step ${index + 1}. ${"Run easily. ".repeat(100)}`).join("\n\n");
  const chunks = splitCoachSpeechText(source);
  assert.ok(chunks.length > 1 && chunks.length <= 6);
  assert.ok(chunks.every((chunk) => chunk.length <= 1_200));
  assert.equal(chunks.join(" ").replace(/\s+/gu, " "), normalizeCoachSpeechText(source).replace(/\s+/gu, " "));
});
