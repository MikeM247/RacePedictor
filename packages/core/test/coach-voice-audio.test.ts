import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { encodeCoachVoiceWav, inspectCoachVoiceWav, CoachVoiceAudioFormatError } from "../src/services/coach-voice-audio.ts";

test("canonical encoder and inspector agree on mono PCM16 WAV metadata and samples", () => {
  const first = new Int16Array(8_000); first[1] = -12; first[2] = 120; first[3] = 32767;
  const wav = encodeCoachVoiceWav([first]);
  const facts = inspectCoachVoiceWav(wav);
  assert.equal(wav.byteLength, 16_044);
  assert.equal(facts.sampleCount, 8_000);
  assert.equal(facts.durationSeconds, 0.5);
  assert.equal(facts.isDigitalSilence, false);
  assert.equal(new DataView(wav.buffer).getUint32(24, true), 16_000);
  assert.equal(new DataView(wav.buffer).getUint16(22, true), 1);
  assert.equal(new DataView(wav.buffer).getInt16(46, true), -12);
});

test("canonical WAV validation rejects short, malformed, oversized and digital-silence recordings", () => {
  assert.throws(() => encodeCoachVoiceWav([new Int16Array(7_999)]), CoachVoiceAudioFormatError);
  assert.throws(() => inspectCoachVoiceWav(new Uint8Array(44 + 16_000)), CoachVoiceAudioFormatError);
  const wrongHeader = encodeCoachVoiceWav([new Int16Array(8_000).fill(1)]);
  wrongHeader[0] = 0;
  assert.throws(() => inspectCoachVoiceWav(wrongHeader), CoachVoiceAudioFormatError);
  const silence = encodeCoachVoiceWav([new Int16Array(8_000)]);
  assert.equal(inspectCoachVoiceWav(silence).isDigitalSilence, true);
  assert.throws(() => encodeCoachVoiceWav([new Int16Array(1_920_001)]), CoachVoiceAudioFormatError);
});

test("AudioWorklet resampler emits a one-second 16 kHz stream from 44.1 and 48 kHz input", async () => {
  const source = await readFile(new URL("../../../apps/web/public/audio/coach-voice-processor.js", import.meta.url), "utf8");
  for (const sampleRate of [44_100, 48_000]) {
    const sent: Int16Array[] = [];
    let Processor: new () => { port: { onmessage: (event: { data: unknown }) => void }; process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean };
    class WorkletBase { port = { onmessage: (_event: { data: unknown }) => undefined, postMessage: (message: { frame: Int16Array }) => sent.push(message.frame) }; }
    const sandbox = {
      AudioWorkletProcessor: WorkletBase,
      sampleRate,
      Math,
      Float32Array,
      Int16Array,
      registerProcessor: (_name: string, value: typeof Processor) => { Processor = value; },
    };
    runInNewContext(source, sandbox);
    // @ts-expect-error registerProcessor fills this when the source is evaluated.
    const processor = new Processor();
    const totalInput = sampleRate;
    for (let offset = 0; offset < totalInput; offset += 128) {
      const length = Math.min(128, totalInput - offset);
      processor.process([[new Float32Array(length)]], [[new Float32Array(length)]]);
    }
    processor.port.onmessage({ data: { type: "flush" } });
    assert.equal(sent.reduce((sum, frame) => sum + frame.length, 0), 16_000, `${sampleRate} Hz input`);
  }
});
