import { COACH_VOICE_MAX_AUDIO_BYTES, COACH_VOICE_MAX_DURATION_SECONDS } from "../contracts/coach-voice.ts";

export class CoachVoiceAudioFormatError extends Error {
  readonly code = "VOICE_INVALID_AUDIO";
  constructor() { super("The recording format or duration is unsupported."); this.name = "CoachVoiceAudioFormatError"; }
}

const SAMPLE_RATE = 16_000;
const WAV_HEADER_BYTES = 44;
const MAX_PCM_SAMPLES = SAMPLE_RATE * COACH_VOICE_MAX_DURATION_SECONDS;

/** Encodes transferred worklet frames without retaining or normalizing the raw recording. */
export function encodeCoachVoiceWav(frames: readonly Int16Array[]) {
  const totalSamples = frames.reduce((total, frame) => total + frame.length, 0);
  if (!Number.isSafeInteger(totalSamples) || totalSamples < SAMPLE_RATE / 2 || totalSamples > MAX_PCM_SAMPLES) throw new CoachVoiceAudioFormatError();
  const output = new Uint8Array(WAV_HEADER_BYTES + totalSamples * 2);
  const view = new DataView(output.buffer);
  writeAscii(view, 0, "RIFF"); view.setUint32(4, output.length - 8, true);
  writeAscii(view, 8, "WAVE"); writeAscii(view, 12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeAscii(view, 36, "data"); view.setUint32(40, totalSamples * 2, true);
  let cursor = WAV_HEADER_BYTES;
  for (const frame of frames) for (let i = 0; i < frame.length; i += 1) {
    view.setInt16(cursor, frame[i], true); cursor += 2;
  }
  return output;
}

export function inspectCoachVoiceWav(bytes: Uint8Array) {
  if (bytes.byteLength < WAV_HEADER_BYTES + SAMPLE_RATE || bytes.byteLength > COACH_VOICE_MAX_AUDIO_BYTES) throw new CoachVoiceAudioFormatError();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(view, 0, 4) !== "RIFF" || view.getUint32(4, true) !== bytes.byteLength - 8
    || ascii(view, 8, 4) !== "WAVE" || ascii(view, 12, 4) !== "fmt "
    || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1
    || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== SAMPLE_RATE
    || view.getUint32(28, true) !== SAMPLE_RATE * 2 || view.getUint16(32, true) !== 2
    || view.getUint16(34, true) !== 16 || ascii(view, 36, 4) !== "data") throw new CoachVoiceAudioFormatError();
  const dataBytes = view.getUint32(40, true);
  if (dataBytes !== bytes.byteLength - WAV_HEADER_BYTES || dataBytes % 2 !== 0 || dataBytes / 2 > MAX_PCM_SAMPLES) throw new CoachVoiceAudioFormatError();
  const sampleCount = dataBytes / 2;
  let maxAmplitude = 0;
  for (let offset = WAV_HEADER_BYTES; offset < bytes.byteLength; offset += 2) maxAmplitude = Math.max(maxAmplitude, Math.abs(view.getInt16(offset, true)));
  return { durationSeconds: sampleCount / SAMPLE_RATE, sampleCount, isDigitalSilence: maxAmplitude === 0 };
}

function ascii(view: DataView, offset: number, length: number) {
  let value = "";
  for (let i = 0; i < length; i += 1) value += String.fromCharCode(view.getUint8(offset + i));
  return value;
}
function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}
