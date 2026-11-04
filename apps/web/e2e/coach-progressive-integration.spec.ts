import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const athleteId = 'racepredictor-e2e-athlete';

test('real dictation API and PostgreSQL feed one reviewed 30k message with duplicate-send recovery', async ({ page, baseURL }) => {
  const url = process.env.COACH_VOICE_TEST_DATABASE_URL!;
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(url).hostname);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const longReflection = 'é'.repeat(30_000);
  try {
    await prisma.athlete.deleteMany({ where: { id: athleteId } });
    await prisma.athlete.create({ data: { id: athleteId } });
    await page.addInitScript(() => {
      const fixture = window as any;
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
      class Worklet {
        port = { onmessage: null as any, close() {}, postMessage: (message: any) => {
          if (message.type === 'flush') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'flushed' } }));
        } };
        connect() { fixture.__emitSeconds = (seconds: number) => this.port.onmessage?.({ data: { type: 'pcm', frame: new Int16Array(seconds * 16_000).fill(1000) } }); return this; }
        disconnect() {}
      }
      Object.defineProperty(window, 'AudioWorkletNode', { configurable: true, value: Worklet });
      Object.defineProperty(AudioContext.prototype, 'createMediaStreamSource', { configurable: true, value: () => ({ connect() {}, disconnect() {} }) });
      Object.defineProperty(AudioContext.prototype, 'createGain', { configurable: true, value: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }) });
    });
    await page.goto('/dashboard/coach');
    const composer = page.getByRole('textbox', { name: 'Message ORBIT' });
    await expect(page.getByRole('button', { name: 'Start dictation', exact: true })).toBeVisible();
    await composer.fill('Typed opening');
    await page.getByRole('button', { name: 'Start dictation', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to microphone permission' }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.evaluate(() => (window as any).__emitSeconds(30));
    await expect(page.locator('.coach-progressive-live')).toContainText('Synthetic reflection.');
    await page.getByRole('button', { name: 'Stop and review', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Editable transcript' })).toHaveValue('Synthetic reflection.');
    await expect(composer).toHaveValue('Typed opening');
    expect(await prisma.coachMessage.count({ where: { athleteId } })).toBe(0);
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('Synthetic reflection.');
    await page.getByRole('button', { name: 'Add to draft', exact: true }).click();
    await expect(composer).toHaveValue('Typed opening\n\nSynthetic reflection.');
    await expect.poll(() => prisma.coachProgressiveDictationSession.count({ where: { athleteId, state: 'closed' } })).toBe(1);
    await composer.fill(longReflection);
    const sent = page.waitForRequest((request) => request.url().endsWith('/coaching/chat/turns') && request.method() === 'POST');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const sendRequest = await sent;
    await expect(page.getByText('Synthetic staging coaching reply.', { exact: true })).toBeVisible();
    const messages = await prisma.coachMessage.findMany({ where: { athleteId }, orderBy: { sequence: 'asc' } });
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe(longReflection);
    const replay = await page.request.post('/api/v1/coaching/chat/turns', { headers: { origin: baseURL! }, data: sendRequest.postDataJSON() });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data.replayKind).toBe('duplicate');
    expect(await prisma.coachTurn.count({ where: { athleteId } })).toBe(1);
    expect(await prisma.coachMessage.count({ where: { athleteId, role: 'user' } })).toBe(1);
    await page.reload();
    await expect(page.getByText('Synthetic staging coaching reply.', { exact: true })).toBeVisible();
    expect(await page.locator('.coach-bubble--user > p').textContent()).toBe(longReflection);
    await expect(composer).toHaveValue('');
    await page.getByRole('button', { name: 'Clear chat', exact: true }).click();
    await page.getByRole('dialog', { name: 'Clear this chat?' }).getByRole('button', { name: 'Save and start new', exact: true }).click();
    await expect(page.getByText('Chat saved. New discussion started.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Previous chats', exact: true }).click();
    const history = page.getByRole('dialog', { name: 'Previous chats' });
    await history.getByRole('button', { name: /é/ }).click();
    expect(await history.getByRole('list', { name: 'Saved conversation messages' }).getByRole('listitem').first().locator('p').textContent()).toBe(longReflection);
  } finally {
    await prisma.athlete.deleteMany({ where: { id: athleteId } });
    await prisma.$disconnect();
  }
});
