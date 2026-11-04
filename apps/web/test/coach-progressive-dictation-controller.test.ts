import assert from "node:assert/strict";
import test from "node:test";
import { CoachProgressiveDictationController, PROGRESSIVE_MAX_PENDING_SECONDS, PROGRESSIVE_SAMPLE_RATE } from "../lib/coach-progressive-dictation-controller.ts";

const sessionResult = { data: { sessionId: "session_controller", expiresAt: "2026-11-02T12:30:00.000Z", leaseExpiresAt: "2026-11-02T12:01:30.000Z", limits: { maxDurationSeconds: 900, maxChunkSeconds: 30, maxChunkBytes: 992_044, maxChunks: 90 } } };
const context = { context: { selectedTopic: "general", selectedRecord: null, fingerprint: "a".repeat(64) }, generation: 1, sequence: 0 } as any;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

function controllerFor(fetchImpl: typeof fetch, now: () => number = () => 1_000, onPauseRequired = () => undefined) {
  let id = 0;
  return new CoachProgressiveDictationController({ fetchImpl, now, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, onPauseRequired });
}

test("controller assembles ordered short WAV chunks through the full 900-second capture limit", async () => {
  const admissions: Array<{ metadata: any; bytes: number }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/dictation-sessions")) return json(sessionResult, 201);
    if (url.endsWith("/chunks")) {
      const metadata = JSON.parse((init?.headers as Record<string, string>)["x-orbit-dictation-chunk"]);
      admissions.push({ metadata, bytes: (init?.body as Uint8Array).byteLength });
      return json({ data: { sessionId: "session_controller", chunkIndex: metadata.chunkIndex, capturedStartSeconds: metadata.capturedStartSeconds, capturedEndSeconds: metadata.capturedEndSeconds, text: `section ${metadata.chunkIndex + 1}`, words: [] } });
    }
    return json({ data: { closed: true } });
  };
  let durationStopped = false;
  const controller = new CoachProgressiveDictationController({ fetchImpl, now: () => 10_000, newId: () => crypto.randomUUID(), onDurationLimit: () => { durationStopped = true; } });
  await controller.startSession(context);
  for (let chunk = 0; chunk < 30; chunk += 1) {
    controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE * 30).fill(1000));
    await controller.settle();
  }
  const snapshot = controller.snapshot();
  assert.equal(snapshot.capturedSeconds, 900);
  assert.equal(snapshot.completedCount, 30);
  assert.match(snapshot.transcript, /^section 1 section 2/u);
  assert.ok(durationStopped);
  assert.equal(admissions.length, 30);
  assert.ok(admissions.every(({ bytes }) => bytes <= 992_044));
  assert.equal(admissions[0].metadata.overlapSeconds, 0);
  assert.equal(admissions[1].metadata.overlapSeconds, 1);
  assert.equal(admissions.at(-1)?.metadata.capturedEndSeconds, 900);
  await controller.close(false);
});

test("queue pressure pauses at the 90-second unacknowledged-audio ceiling", async () => {
  let releaseFirst!: () => void;
  const firstUpload = new Promise<Response>((resolve) => { releaseFirst = () => resolve(json({ data: { sessionId: "session_controller", chunkIndex: 0, capturedStartSeconds: 0, capturedEndSeconds: 30, text: "first", words: [] } })); });
  let calls = 0, pauseCount = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/dictation-sessions")) return json(sessionResult, 201);
    const metadata = JSON.parse((init?.headers as Record<string, string>)["x-orbit-dictation-chunk"]);
    calls += 1;
    if (metadata.chunkIndex === 0) return firstUpload;
    return json({ data: { sessionId: "session_controller", chunkIndex: metadata.chunkIndex, capturedStartSeconds: metadata.capturedStartSeconds, capturedEndSeconds: metadata.capturedEndSeconds, text: "next", words: [] } });
  };
  const controller = controllerFor(fetchImpl, () => 1_000, () => { pauseCount += 1; });
  await controller.startSession(context);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE * 30).fill(1000));
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE * 30).fill(1000));
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE * 30).fill(1000));
  const queuedSnapshot = controller.snapshot();
  controller.pauseCapture();
  releaseFirst();
  await controller.settle();
  assert.equal(queuedSnapshot.pausedForQueue, true);
  assert.ok(queuedSnapshot.pendingAudioSeconds <= PROGRESSIVE_MAX_PENDING_SECONDS);
  assert.ok(pauseCount >= 1);
  assert.equal(calls, 3);
  assert.equal(controller.snapshot().pendingAudioSeconds, 0);
  await controller.close(true);
});

test("failed chunks receive no automatic retry, permit one explicit retry, then expire", async () => {
  let calls = 0, now = 1_000;
  const retryOrdinals: number[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/dictation-sessions")) return json(sessionResult, 201);
    if (String(input).endsWith("/chunks")) {
      const metadata = JSON.parse((init?.headers as Record<string, string>)["x-orbit-dictation-chunk"]);
      retryOrdinals.push(metadata.retryOrdinal); calls += 1;
      if (calls === 1) return json({ error: { message: "provider temporarily unavailable" } }, 503);
      return json({ data: { sessionId: "session_controller", chunkIndex: metadata.chunkIndex, capturedStartSeconds: metadata.capturedStartSeconds, capturedEndSeconds: metadata.capturedEndSeconds, text: "test words", words: [] } });
    }
    return json({ data: { closed: true } });
  };
  const controller = controllerFor(fetchImpl, () => now);
  await controller.startSession(context);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE / 4).fill(1000));
  await controller.stopCapture();
  assert.equal(calls, 1, "the provider is not retried automatically");
  const failed = controller.snapshot().sections[0];
  assert.equal(failed.state, "failed");
  assert.equal(failed.retryAvailable, true);
  assert.equal(await controller.retry(failed.order), true);
  assert.deepEqual(retryOrdinals, [0, 1]);
  assert.equal(controller.snapshot().transcript, "test words");
  now += 181_000;
  controller.expireAudio(now);
  assert.equal(controller.snapshot().sections[0].state, "complete", "successful audio is disposed immediately and completed text remains");
  await controller.close(false);
});

test("temporary failed audio expires into a visible gap and can only be acknowledged", async () => {
  let now = 5_000;
  const fetchImpl: typeof fetch = async (input) => String(input).endsWith("/dictation-sessions") ? json(sessionResult, 201) : json({ error: { message: "provider unavailable" } }, 503);
  const controller = controllerFor(fetchImpl, () => now);
  await controller.startSession(context);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE / 4).fill(1000));
  await controller.stopCapture();
  now += 181_000; controller.expireAudio(now);
  const expired = controller.snapshot().sections[0];
  assert.equal(expired.state, "expired");
  assert.equal(expired.retryAvailable, false);
  assert.equal(controller.acknowledgeGap(expired.order), true);
  assert.equal(controller.snapshot().sections[0].state, "omitted");
  await controller.close(false);
});

test("session cancellation aborts work and discards incomplete audio without altering completed text", async () => {
  let closedBody = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/dictation-sessions")) return json(sessionResult, 201);
    if (String(input).endsWith("/close")) { closedBody = String(init?.body); return json({ data: { closed: true } }); }
    const metadata = JSON.parse((init?.headers as Record<string, string>)["x-orbit-dictation-chunk"]);
    return json({ data: { sessionId: "session_controller", chunkIndex: metadata.chunkIndex, capturedStartSeconds: metadata.capturedStartSeconds, capturedEndSeconds: metadata.capturedEndSeconds, text: "done", words: [] } });
  };
  const controller = controllerFor(fetchImpl);
  await controller.startSession(context);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE * 15).fill(1000));
  controller.pauseCapture();
  await controller.settle();
  assert.equal(controller.resumeCapture(), true);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE / 2).fill(1000));
  await controller.close(true);
  assert.deepEqual(JSON.parse(closedBody), { cancel: true });
  assert.equal(controller.snapshot().transcript, "done");
  assert.ok(controller.snapshot().sections.some((section) => section.state === "expired"));
});

test("cancelled session creation closes a late admission without reviving dictation", async () => {
  let release!: (response: Response) => void;
  let closes = 0;
  const gate = new Promise<Response>((resolve) => { release = resolve; });
  const controller = controllerFor(async (input) => {
    if (String(input).endsWith('/dictation-sessions')) return gate;
    closes += 1; return json({ data: { closed: true } });
  });
  const start = controller.startSession(context);
  await controller.close(true);
  release(json(sessionResult, 201));
  await assert.rejects(start, /cancelled/u);
  assert.equal(closes, 1);
  assert.equal(controller.snapshot().sessionId, null);
  assert.equal(controller.resumeCapture(), false);
});

test("backgrounding disposes pending audio and rejects a late successful response", async () => {
  let release!: (response: Response) => void;
  const gate = new Promise<Response>((resolve) => { release = resolve; });
  const controller = controllerFor(async (input) => {
    if (String(input).endsWith('/dictation-sessions')) return json(sessionResult, 201);
    if (String(input).endsWith('/chunks')) return gate;
    return json({ data: { closed: true } });
  });
  await controller.startSession(context);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE * 30).fill(1000));
  await controller.suspendForVisibility();
  release(json({ data: { sessionId: 'session_controller', chunkIndex: 0, capturedStartSeconds: 0, capturedEndSeconds: 30, text: 'late result', words: [] } }));
  await controller.settle();
  assert.equal(controller.snapshot().pendingAudioSeconds, 0);
  assert.equal(controller.snapshot().transcript, '');
  assert.equal(controller.snapshot().sections[0].state, 'expired');
});

test("heartbeat expiry permanently fences resume and silence does not dispatch provider work", async () => {
  let uploads = 0;
  const controller = controllerFor(async (input) => {
    if (String(input).endsWith('/dictation-sessions')) return json(sessionResult, 201);
    if (String(input).endsWith('/heartbeat')) return json({}, 409);
    if (String(input).endsWith('/chunks')) uploads += 1;
    return json({ data: { closed: true } });
  });
  await controller.startSession(context);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE * 15));
  await controller.settle();
  assert.equal(uploads, 0);
  assert.equal(controller.snapshot().completedCount, 1);
  assert.equal(await controller.heartbeat(), false);
  assert.equal(controller.resumeCapture(), false);
  controller.dispose();
});

test('failed audio counts toward the queue and expires automatically from its first sample', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 10_000;
  const controller = controllerFor(async (input) => String(input).endsWith('/dictation-sessions') ? json(sessionResult, 201) : json({}, 503), () => now);
  await controller.startSession(context);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE).fill(1000));
  await controller.stopCapture();
  assert.equal(controller.snapshot().pendingAudioSeconds, 1);
  now += 180_000;
  t.mock.timers.tick(180_000);
  assert.equal(controller.snapshot().pendingAudioSeconds, 0);
  assert.equal(controller.snapshot().sections[0].state, 'expired');
  assert.equal(controller.acknowledgeGap(controller.snapshot().sections[0].order, true), true);
  assert.match(controller.snapshot().sections[0].error, /Corrected in review/u);
  await controller.close(false);
});

test('repeated short pauses stop at 90 admitted chunks without creating an invalid chunk', async () => {
  const indices: number[] = [];
  let limited = false;
  const controller = new CoachProgressiveDictationController({ onDurationLimit: () => { limited = true; }, fetchImpl: async (input, init) => {
    if (String(input).endsWith('/dictation-sessions')) return json(sessionResult, 201);
    if (String(input).endsWith('/chunks')) {
      const metadata = JSON.parse((init?.headers as Record<string, string>)['x-orbit-dictation-chunk']);
      indices.push(metadata.chunkIndex);
      return json({ data: { sessionId: 'session_controller', chunkIndex: metadata.chunkIndex, capturedStartSeconds: metadata.capturedStartSeconds, capturedEndSeconds: metadata.capturedEndSeconds, text: 'section', words: [] } });
    }
    return json({ data: { closed: true } });
  } });
  await controller.startSession(context);
  for (let index = 0; index < 90; index += 1) {
    controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE).fill(1000));
    controller.pauseCapture();
    await controller.settle();
    if (index < 89) assert.equal(controller.resumeCapture(), true);
  }
  assert.equal(limited, true);
  assert.equal(controller.resumeCapture(), false);
  assert.equal(indices.length, 90);
  assert.equal(Math.max(...indices), 89);
  await controller.close(true);
});

test('a transient heartbeat outage preserves eligible failed audio for an explicit retry', async () => {
  let offline = true, uploads = 0;
  const controller = controllerFor(async (input, init) => {
    if (String(input).endsWith('/dictation-sessions')) return json(sessionResult, 201);
    if (String(input).endsWith('/heartbeat')) { if (offline) throw new TypeError('offline'); return json({ data: {} }); }
    if (String(input).endsWith('/chunks')) {
      uploads += 1;
      if (offline) throw new TypeError('offline');
      const metadata = JSON.parse((init?.headers as Record<string, string>)['x-orbit-dictation-chunk']);
      return json({ data: { sessionId: 'session_controller', chunkIndex: metadata.chunkIndex, capturedStartSeconds: metadata.capturedStartSeconds, capturedEndSeconds: metadata.capturedEndSeconds, text: 'Recovered.', words: [] } });
    }
    return json({ data: { closed: true } });
  });
  await controller.startSession(context);
  controller.pushFrame(new Int16Array(PROGRESSIVE_SAMPLE_RATE).fill(1000));
  await controller.stopCapture();
  assert.equal(await controller.heartbeat(), false);
  assert.equal(controller.snapshot().sections[0].retryAvailable, true);
  assert.equal(controller.snapshot().pendingAudioSeconds, 1);
  assert.equal(uploads, 1);
  offline = false;
  assert.equal(await controller.heartbeat(), true);
  assert.equal(await controller.retry(controller.snapshot().sections[0].order), true);
  assert.equal(uploads, 2);
  await controller.close(false);
});
