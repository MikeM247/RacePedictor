import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { GET as getToday } from "../app/api/v1/coaching/today/route.ts";
import { PUT as putReminders } from "../app/api/v1/coaching/reminder-preferences/route.ts";

const responseBody = async (response: Response) => response.json() as Promise<Record<string, any>>;

test("Today route returns no-plan safely and validates dates and configured timezones", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-today-route-"));
  process.env.RACEPREDICTOR_DATABASE_PATH = path.join(directory, "state", "racepredictor.sqlite");
  process.env.RACEPREDICTOR_COACH_EXCHANGE_PATH = path.join(directory, "Coach Exchange");
  process.env.RACEPREDICTOR_ATHLETE_ID = "test_athlete";

  try {
    const noPlanResponse = await getToday(new Request("http://localhost/api/v1/coaching/today"));
    assert.equal(noPlanResponse.status, 200);
    const noPlan = (await responseBody(noPlanResponse)).data;
    assert.equal(noPlan.state, "no-plan");
    assert.equal(noPlan.plan, null);
    assert.equal(noPlan.timezone, "Africa/Johannesburg");

    const invalidDate = await getToday(new Request("http://localhost/api/v1/coaching/today?date=2026-02-30"));
    assert.equal(invalidDate.status, 400);
    assert.equal((await responseBody(invalidDate)).error.code, "VALIDATION_ERROR");

    const invalidTimezone = await putReminders(new Request("http://localhost/api/v1/coaching/reminder-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone: "UTC+2" }),
    }));
    assert.equal(invalidTimezone.status, 400);
    const invalidTimezoneBody = await responseBody(invalidTimezone);
    assert.equal(invalidTimezoneBody.error.code, "VALIDATION_ERROR");
    assert.equal(invalidTimezoneBody.error.details.some((detail: { path?: string[] }) => detail.path?.includes("timezone")), true);
  } finally {
    delete process.env.RACEPREDICTOR_DATABASE_PATH;
    delete process.env.RACEPREDICTOR_COACH_EXCHANGE_PATH;
    delete process.env.RACEPREDICTOR_ATHLETE_ID;
  }
});
