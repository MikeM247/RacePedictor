import assert from "node:assert/strict";
import test from "node:test";
import {
  FetchStravaActivityTransport,
  stravaApiUrl,
} from "../lib/server/strava/activity-transport.ts";

test("Strava transport sends credentials only in the provider authorization header", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const transport = new FetchStravaActivityTransport({
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-usage": "1,10",
        },
      });
    },
  });

  const response = await transport.request({
    accessToken: "synthetic-access-token",
    path: "/activities/123/streams",
    query: { keys: "time,distance", key_by_type: "true" },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://www.strava.com/api/v3/activities/123/streams?keys=time%2Cdistance&key_by_type=true");
  assert.equal(new Headers(requests[0].init?.headers).get("authorization"), "Bearer synthetic-access-token");
  assert.doesNotMatch(requests[0].url, /synthetic-access-token/);
  assert.equal(response.status, 200);
  assert.deepEqual(response.headers, {
    "content-type": "application/json",
    "retry-after": undefined,
    "x-ratelimit-limit": undefined,
    "x-ratelimit-usage": "1,10",
    "x-readratelimit-limit": undefined,
    "x-readratelimit-usage": undefined,
  });
});

test("Strava transport rejects unsafe paths, query keys, tokens, and oversized bodies", async () => {
  assert.throws(() => stravaApiUrl("//attacker.invalid/path"), /path is invalid/);
  assert.throws(() => stravaApiUrl("/activities/../athlete"), /path is invalid/);
  assert.throws(() => stravaApiUrl("/activities", { "bad-key": "1" }), /query is invalid/);

  const transport = new FetchStravaActivityTransport({
    maxResponseBytes: 3,
    fetch: async () => new Response("four", { status: 200 }),
  });
  await assert.rejects(
    transport.request({ accessToken: "bad\r\ntoken", path: "/athlete/activities" }),
    /token is invalid/,
  );
  await assert.rejects(
    transport.request({ accessToken: "safe", path: "/athlete/activities" }),
    /exceeded/,
  );
});
