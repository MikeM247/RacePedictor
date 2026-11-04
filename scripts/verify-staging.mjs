import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = path.join(root, 'packages/db/.env.test.local');
const example = path.join(root, 'packages/db/.env.test.local.example');
const configured = parseEnv(readFileSync(existsSync(envFile) ? envFile : example, 'utf8'));
const url = configured.COACH_VOICE_TEST_DATABASE_URL;
const parsed = new URL(url);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
  || parsed.port !== '55432' || parsed.pathname !== '/racepredictor_voice_test') {
  throw new Error('Staging verification requires the disposable loopback voice-test database on port 55432.');
}
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(RACEPREDICTOR_|AUTH_|DATABASE_URL|VERCEL|OPENAI_|OPENROUTER_|NODE_ENV$|COACH_VOICE_TEST_DATABASE_URL$)/u.test(key)));
Object.assign(env, { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, COACH_VOICE_TEST_DATABASE_URL: url,
  RACEPREDICTOR_CLOUD_MODE: 'disabled', RACEPREDICTOR_MILESTONE_HOME_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1' });
if (!env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && existsSync('/usr/bin/chromium')) env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/usr/bin/chromium';
const logs = path.join(root, '.local/staging-verification', new Date().toISOString().replace(/[:.]/gu, '-'));
mkdirSync(logs, { recursive: true });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const steps = [
  ['database-setup', npm, ['run', 'db:test:voice:setup']],
  ['voice', npm, ['run', 'db:test:voice']],
  ['core', npm, ['test', '--workspace', '@racepredictor/core']],
  ['database-all', process.execPath, ['--no-warnings', '--experimental-strip-types', '--test', ...readdirSync(path.join(root, 'packages/db/test')).filter((name) => name.endsWith('.test.js')).map((name) => `packages/db/test/${name}`)]],
  ...['normalize', 'seed', 'contracts', 'gate'].map((name) => [
    `database-${name}`, npm, ['run', `db:test:${name}`, '--workspace', '@racepredictor/db'],
  ]),
  ['web', npm, ['test', '--workspace', '@racepredictor/web']],
  ['typecheck', npm, ['run', 'lint']],
  ['build', npm, ['run', 'build']],
];
if (!process.argv.includes('--unit-only')) {
  for (const script of ['test:e2e:local', 'test:e2e:online', 'test:e2e:coach:online', 'test:e2e:auth', 'test:e2e:milestones', 'test:e2e:milestone-home', 'test:e2e:dictation:integration']) {
    steps.push([script.replaceAll(':', '-'), npm, ['run', script, '--workspace', '@racepredictor/web']]);
  }
}
const results = [];
const selected = process.argv.find((argument) => argument.startsWith('--only='))?.slice(7).split(',');
if (selected?.some((name) => !steps.some((step) => step[0] === name))) throw new Error('Unknown verification step in --only.');
console.log(`Verification logs: ${logs}`);
for (const [name, command, args] of steps) {
  if (selected && !selected.includes(name)) continue;
  const log = path.join(logs, `${name}.log`);
  console.log(`Running ${name}…`);
  const fd = openSync(log, 'w');
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: root, env, stdio: ['ignore', fd, fd], shell: process.platform === 'win32' && command === npm });
  closeSync(fd);
  const passed = !result.error && result.status === 0;
  results.push({ name, passed, durationMs: Date.now() - started, log });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  if (!passed) console.log(readFileSync(log, 'utf8').split('\n').slice(-25).join('\n'));
  if (!passed && name === 'database-setup') break;
}
writeFileSync(path.join(logs, 'summary.json'), JSON.stringify(results, null, 2) + '\n');
if (results.some((result) => !result.passed)) process.exitCode = 1;
