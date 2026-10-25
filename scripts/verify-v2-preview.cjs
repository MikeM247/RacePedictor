"use strict";

// Run deliberately in the work Preview deployment after Prisma generation.
// Never print credentials, provider response bodies, or owner identifiers.
const { createRequire } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function fail(code) {
  const error = new Error(code);
  error.smokeCode = code;
  throw error;
}

async function main() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "work") {
    fail("REQUIRES_WORK_PREVIEW");
  }
  const moduleUrl = (file) => pathToFileURL(path.resolve(__dirname, file)).href;
  const { readPreviewDatabaseOverride } = await import(moduleUrl("../packages/db/src/cloud/preview-database-configuration.js"));
  const preview = readPreviewDatabaseOverride();
  if (!process.env.RACEPREDICTOR_OWNER_ATHLETE_ID || !process.env.RACEPREDICTOR_OWNER_AUTH_SUBJECT) fail("OWNER_CONFIGURATION_MISSING");

  const appRequire = createRequire(path.resolve(__dirname, "../apps/web/package.json"));
  const { PrismaClient } = appRequire("@prisma/client");
  const { getCloudPrismaClient } = await import(moduleUrl("../packages/db/src/cloud/prisma-client.js"));
  const prisma = getCloudPrismaClient();
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
    if (await prisma.activity.count() !== 0) fail("PREVIEW_HAS_UNEXPECTED_ACTIVITY_DATA");
    console.log("[preview-smoke] Application client reached the isolated pooled database: one owner grant, zero activities.");
  } finally {
    await prisma.$disconnect();
  }

  const direct = new PrismaClient({ datasources: { db: { url: preview.directUrl } } });
  try {
    await direct.$queryRawUnsafe("SELECT 1");
    console.log("[preview-smoke] Isolated direct database connection passed.");
  } finally { await direct.$disconnect(); }

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
