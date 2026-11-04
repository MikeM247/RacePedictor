// Unit tests supply their own fixtures and authentication configuration. Never
// inherit deployment credentials or cloud mode from the developer's shell.
for (const key of Object.keys(process.env)) {
  if (/^(RACEPREDICTOR_|AUTH_|DATABASE_URL|VERCEL|OPENAI_|OPENROUTER_)/u.test(key)) delete process.env[key];
}
process.env.NODE_ENV = "test";
