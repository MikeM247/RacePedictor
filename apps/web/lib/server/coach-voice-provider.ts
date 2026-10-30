import { COACH_VOICE_MAX_TRANSCRIPT_CHARS, COACH_VOICE_SPEECH_CHUNK_CHARS } from "../../../../packages/core/src/contracts/coach-voice.ts";

export const COACH_TRANSCRIPTION_MODEL = "whisper-1";
export const COACH_SPEECH_MODEL = "tts-1";
export const COACH_SPEECH_VOICE = "onyx";
const MAX_SYNTHESIZED_AUDIO_BYTES = 1_000_000;

export class CoachVoiceProviderError extends Error {
  readonly safeCode: string;
  constructor(safeCode: string) { super("Voice processing is temporarily unavailable."); this.name = "CoachVoiceProviderError"; this.safeCode = safeCode; }
}

export function createOpenAICoachVoiceProvider(input: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    async transcribe(audio: Uint8Array, signal: AbortSignal) {
      const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new CoachVoiceProviderError("VOICE_PROVIDER_NOT_CONFIGURED");
      const form = new FormData();
      const fileBytes = new ArrayBuffer(audio.byteLength);
      new Uint8Array(fileBytes).set(audio);
      form.set("file", new Blob([fileBytes], { type: "audio/wav" }), "recording.wav");
      form.set("model", COACH_TRANSCRIPTION_MODEL);
      form.set("language", "en");
      form.set("response_format", "verbose_json");
      let response: Response;
      try {
        response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form, signal,
        });
      } catch (error) { throw asProviderError(error, signal); }
      if (!response.ok) {
        console.warn("coach.voice.provider_rejected", { operation: "transcription", status: response.status });
        throw mapProviderStatus(response.status);
      }
      let payload: unknown;
      try { payload = await response.json(); }
      catch { throw new CoachVoiceProviderError("VOICE_PROVIDER_INVALID_RESPONSE"); }
      const result = payload as { text?: unknown; segments?: Array<{ no_speech_prob?: unknown }> } | null;
      const text = typeof result?.text === "string" ? result.text.trim() : "";
      if (result?.segments?.length && result.segments.every((segment) => typeof segment.no_speech_prob === "number" && segment.no_speech_prob >= 0.6)) {
        throw new CoachVoiceProviderError("VOICE_NO_SPEECH");
      }
      if (!text) throw new CoachVoiceProviderError("VOICE_NO_SPEECH");
      if (text.length > COACH_VOICE_MAX_TRANSCRIPT_CHARS) throw new CoachVoiceProviderError("VOICE_TRANSCRIPT_TOO_LONG");
      return text;
    },

    async synthesize(text: string, signal: AbortSignal) {
      const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new CoachVoiceProviderError("VOICE_PROVIDER_NOT_CONFIGURED");
      if (!text.trim() || text.length > COACH_VOICE_SPEECH_CHUNK_CHARS) throw new CoachVoiceProviderError("VOICE_INVALID_SPEECH_CHUNK");
      let response: Response;
      try {
        response = await fetchImpl("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: COACH_SPEECH_MODEL, voice: COACH_SPEECH_VOICE, input: text, response_format: "mp3", speed: 1 }),
          signal,
        });
      } catch (error) { throw asProviderError(error, signal); }
      if (!response.ok) throw mapProviderStatus(response.status);
      if (!response.body) throw new CoachVoiceProviderError("VOICE_PROVIDER_INVALID_RESPONSE");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_SYNTHESIZED_AUDIO_BYTES) {
            await reader.cancel();
            throw new CoachVoiceProviderError("VOICE_PROVIDER_AUDIO_TOO_LARGE");
          }
          chunks.push(value);
        }
      } catch (error) {
        if (error instanceof CoachVoiceProviderError) throw error;
        throw asProviderError(error, signal);
      } finally { reader.releaseLock(); }
      if (!totalBytes) throw new CoachVoiceProviderError("VOICE_PROVIDER_INVALID_RESPONSE");
      const audio = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.byteLength; }
      for (const chunk of chunks) chunk.fill(0);
      return audio;
    },
  };
}

function mapProviderStatus(status: number) {
  if (status === 429) return new CoachVoiceProviderError("VOICE_PROVIDER_RATE_LIMITED");
  if (status >= 500) return new CoachVoiceProviderError("VOICE_PROVIDER_UNAVAILABLE");
  return new CoachVoiceProviderError("VOICE_PROVIDER_REJECTED");
}

function asProviderError(error: unknown, signal: AbortSignal) {
  return new CoachVoiceProviderError(signal.aborted ? "VOICE_PROVIDER_TIMEOUT" : "VOICE_PROVIDER_UNAVAILABLE");
}

export function normalizeCoachSpeechText(value: string) {
  return value
    .replace(/```[^\n]*\n?([\s\S]*?)```/gu, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)/gmu, "")
    .replace(/(^|\s)\*\*(.*?)\*\*(?=\s|[.,;:!?]|$)/gu, "$1$2")
    .replace(/(^|\s)([*_~])([^\n]*?)\2(?=\s|[.,;:!?]|$)/gmu, "$1$3")
    .replace(/\b(\d{1,2}):([0-5]\d)\s*\/\s*km\b/giu, (_match, minutes: string, seconds: string) => `${Number(minutes)} minute${Number(minutes) === 1 ? "" : "s"}${Number(seconds) ? ` ${Number(seconds)} seconds` : ""} per kilometre`)
    .replace(/\b(\d{1,2}):([0-5]\d)\s*\/\s*mi(?:le)?s?\b/giu, (_match, minutes: string, seconds: string) => `${Number(minutes)} minute${Number(minutes) === 1 ? "" : "s"}${Number(seconds) ? ` ${Number(seconds)} seconds` : ""} per mile`)
    .replace(/\bkm\s*\/\s*h\b/giu, "kilometres per hour")
    .replace(/\bmph\b/giu, "miles per hour")
    .replace(/\b(\d+(?:\.\d+)?)\s*km\b/giu, "$1 kilometres")
    .replace(/\b(\d+(?:\.\d+)?)\s*mi\b/giu, "$1 miles")
    .replace(/\bper\s+km\b/giu, "per kilometre")
    .replace(/\bper\s+mi\b/giu, "per mile")
    .replace(/\bhttps?:\/\/[^\s)\]]+/giu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+([.,;:!?])/gu, "$1")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function splitCoachSpeechText(value: string, maxChars = COACH_VOICE_SPEECH_CHUNK_CHARS) {
  const text = normalizeCoachSpeechText(value);
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > COACH_VOICE_SPEECH_CHUNK_CHARS) throw new RangeError("Invalid coach voice chunk size");
  if (!text) return [];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let boundary = Math.max(remaining.lastIndexOf("\n\n", maxChars), remaining.lastIndexOf(". ", maxChars) + (remaining.lastIndexOf(". ", maxChars) >= 0 ? 1 : 0), remaining.lastIndexOf(" ", maxChars));
    if (boundary < Math.floor(maxChars * 0.55)) boundary = maxChars;
    const chunk = remaining.slice(0, boundary).trim();
    if (!chunk) throw new CoachVoiceProviderError("VOICE_PROVIDER_INVALID_RESPONSE");
    chunks.push(chunk);
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
