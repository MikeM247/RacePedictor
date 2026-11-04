import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { e2eRepositoryRoot, e2eRoot } from './e2e/fixture-paths.ts';
const url = process.env.COACH_VOICE_TEST_DATABASE_URL;
if (!url || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('The dictation integration test requires disposable loopback PostgreSQL.');
export default defineConfig({
  testDir: './e2e', testMatch: 'coach-progressive-integration.spec.ts', workers: 1, timeout: 90_000,
  outputDir: path.join(e2eRoot, 'dictation-integration-results'), reporter: [['list']],
  use: { baseURL: 'http://localhost:3321', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3321', cwd: path.join(e2eRepositoryRoot, 'apps/web'), url: 'http://localhost:3321', timeout: 120_000,
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, NEXT_TELEMETRY_DISABLED: '1',
      RACEPREDICTOR_NEXT_DIST_DIR: `.next-e2e-dictation-${process.env.RACEPREDICTOR_E2E_RUN_ID}`,
      RACEPREDICTOR_DATA_SOURCE: 'online-fixture', RACEPREDICTOR_CLOUD_MODE: 'enabled', RACEPREDICTOR_E2E_OWNER_AUTH_ENABLED: 'true',
      RACEPREDICTOR_COACH_UI_ENABLED: 'true', RACEPREDICTOR_COACH_CHAT_ENABLED: 'true', RACEPREDICTOR_COACH_DICTATION_ENABLED: 'true', RACEPREDICTOR_COACH_PROGRESSIVE_DICTATION_ENABLED: 'true',
      OPENAI_API_KEY: 'synthetic-integration-key', ORBIT_E2E_PROVIDER_MOCK: '1',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${fileURLToPath(new URL('./e2e/mock-ai-provider.mjs', import.meta.url))}`,
    },
  },
});
