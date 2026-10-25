import assert from "node:assert/strict";
import test from "node:test";
import { getCoachModels } from "../lib/server/coach-ai-model-catalog.ts";

test("OpenRouter catalog filters compatible models, caches success, and labels stale outage data", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "synthetic-openrouter-key";
  let calls = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    calls += 1;
    assert.match(String(url), /supported_parameters=structured_outputs/u);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-openrouter-key");
    return Response.json({ data: [
      { id: "vendor/model-a", name: "Model A", supported_parameters: ["structured_outputs"], architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
      { id: "vendor/model-b", name: "Model B", supported_parameters: ["tools"], architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
      { id: "openrouter/auto", name: "Auto", supported_parameters: ["structured_outputs"], architecture: { input_modalities: ["text"], output_modalities: ["text"] } },
      { id: "vendor/image", name: "Image", supported_parameters: ["structured_outputs"], architecture: { input_modalities: ["image"], output_modalities: ["text"] } },
    ] });
  };
  try {
    const fresh = await getCoachModels("openrouter", { fetchImpl, now: () => 1_000 });
    assert.deepEqual(fresh.models.map((item) => item.id), ["vendor/model-a"]);
    assert.equal(fresh.stale, false);
    const cached = await getCoachModels("openrouter", { fetchImpl, now: () => 2_000 });
    assert.equal(cached.models[0]?.id, "vendor/model-a");
    assert.equal(calls, 1);
    const stale = await getCoachModels("openrouter", { fetchImpl: async () => new Response(null, { status: 503 }), now: () => 901_001, allowStale: true });
    assert.equal(stale.stale, true);
    assert.equal(stale.models[0]?.id, "vendor/model-a");
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});
