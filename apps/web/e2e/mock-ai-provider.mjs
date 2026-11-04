// Loaded only by the isolated integration-test Next process, never by app code.
if (process.env.NODE_ENV === 'production' || process.env.ORBIT_E2E_PROVIDER_MOCK !== '1'
  || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
  throw new Error('AI provider fixture requires an explicit local development test database.');
}
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.openai.com') {
    if (url.pathname === '/v1/audio/transcriptions') return Response.json({ text: 'Synthetic reflection.', words: [{ word: 'Synthetic', start: 1.1, end: 1.4 }, { word: 'reflection.', start: 1.4, end: 1.8 }] });
    if (url.pathname === '/v1/responses') {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : await input.clone().text());
      if (body.input.at(-1)?.content !== 'é'.repeat(30_000) || !body.instructions?.length) throw new Error('The complete reflection and instructions must reach the provider.');
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic staging coaching reply.' }] }], usage: { input_tokens: 12_000, output_tokens: 8 } });
    }
    throw new Error('Unexpected AI provider fixture request.');
  }
  return originalFetch(input, init);
};
