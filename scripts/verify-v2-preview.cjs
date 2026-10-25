"use strict";

// Run deliberately in the work Preview deployment after Prisma generation.
// Never print credentials, provider response bodies, or owner identifiers.
const { createRequire } = require("node:module");
const path = require("node:path");

function fail(code) {
  const error = new Error(code);
  error.smokeCode = code;
  throw error;
}

async function main() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "work") {
    fail("REQUIRES_WORK_PREVIEW");
  }
  const directHost = "ep-tiny-band-b1j73wgx.c-5.eu-central-1.aws.neon.tech";
  const pooledHost = "ep-tiny-band-b1j73wgx-pooler.c-5.eu-central-1.aws.neon.tech";
  if (new URL(process.env.DATABASE_URL).hostname !== pooledHost) fail("WRONG_POOLED_ENDPOINT");
  if (new URL(process.env.DATABASE_URL_UNPOOLED).hostname !== directHost) fail("WRONG_DIRECT_ENDPOINT");

  const appRequire = createRequire(path.resolve(__dirname, "../apps/web/package.json"));
  const { PrismaClient } = appRequire("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    const ownerGrants = await prisma.athleteAccess.count({
      where: {
        athleteId: process.env.RACEPREDICTOR_OWNER_ATHLETE_ID,
        role: "owner",
        user: { authSubject: process.env.RACEPREDICTOR_OWNER_AUTH_SUBJECT },
      },
    });
    if (ownerGrants !== 1) fail("OWNER_GRANT_MISSING");
    console.log("[preview-smoke] Isolated pooled database and owner grant passed; direct endpoint verified.");
  } finally {
    await prisma.$disconnect();
  }

  if (!process.env.OPENAI_API_KEY?.trim()) fail("OPENAI_KEY_MISSING");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.RACEPREDICTOR_ACTIVITY_REVIEW_MODEL || "gpt-5-mini",
      reasoning: { effort: "minimal" },
      max_output_tokens: 256,
      input: "This is a synthetic deployment health check. Reply with exactly OK.",
      store: false,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) fail(`OPENAI_HTTP_${response.status}`);
  if (payload?.status !== "completed") fail("OPENAI_RESPONSE_NOT_COMPLETED");
  const output = payload.output?.flatMap((item) => item.content || [])
    .map((content) => content.text || "").join("").trim();
  if (!/^OK[.!]?$/.test(output)) fail("OPENAI_UNEXPECTED_RESPONSE");
  console.log("[preview-smoke] OpenAI Responses API passed (HTTP 200, completed synthetic response).");
}

main().catch((error) => {
  console.error(`[preview-smoke] FAILED ${error.smokeCode || error.name || "UNKNOWN"}`);
  process.exitCode = 1;
});
