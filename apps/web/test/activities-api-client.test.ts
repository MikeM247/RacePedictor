import assert from "node:assert/strict";
import test from "node:test";
import {
  readActivitiesListResponse,
  readActivityDetailResponse,
} from "../lib/activities-api-client.ts";

const summary = {
  id: "activity-a",
  athleteId: "athlete-a",
  title: "Morning Run",
  occurredAt: "2026-08-11T04:00:00.000Z",
  localOccurredAt: "2026-08-11T06:00:00.000+02:00",
  sport: "run" as const,
  distanceM: 10_000,
  elapsedTimeS: 3_000,
  avgPaceSecPerKm: 300,
  elevationGainM: 100,
  hrAvailable: true,
  cadenceAvailable: true,
};

const detail = {
  ...summary,
  endedAt: "2026-08-11T04:50:00.000Z",
  sourceType: "strava" as const,
  sourceActivityId: "strava-a",
  elevationLossM: 90,
  dedupeHash: "a".repeat(64),
  createdAt: "2026-08-11T05:00:00.000Z",
  splits: [],
  routeSignature: null,
};

test("activity API client unwraps and validates standard cloud success envelopes", async () => {
  const list = await readActivitiesListResponse(jsonResponse({ data: { items: [summary] } }));
  const selected = await readActivityDetailResponse(jsonResponse({ data: { activity: detail } }));

  assert.equal(list.items[0].title, "Morning Run");
  assert.equal(selected.activity.sourceType, "strava");
  assert.deepEqual(selected.activity.splits, []);
});

test("activity API client rejects malformed success envelopes without leaking a render error", async () => {
  await assert.rejects(
    () => readActivitiesListResponse(jsonResponse({ data: {} })),
    /invalid activity response/u,
  );
  await assert.rejects(
    () => readActivityDetailResponse(jsonResponse({ activity: detail })),
    /invalid activity response/u,
  );
});

test("activity API client preserves the public API error message", async () => {
  await assert.rejects(
    () => readActivitiesListResponse(jsonResponse({
      error: { code: "UNAVAILABLE", message: "Activities are temporarily unavailable", details: [] },
    }, 503)),
    /Activities are temporarily unavailable/u,
  );
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
