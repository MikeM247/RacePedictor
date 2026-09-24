import test from "node:test";
import assert from "node:assert/strict";
import { isDashboardPageCurrent } from "../components/dashboard/dashboard-navigation-state.ts";

test("dashboard navigation maps Home, Training, and Plan to existing routes", () => {
  assert.equal(isDashboardPageCurrent("home", "/dashboard"), true);
  assert.equal(isDashboardPageCurrent("home", "/dashboard/activities"), false);
  assert.equal(isDashboardPageCurrent("training", "/dashboard/activities"), true);
  assert.equal(isDashboardPageCurrent("training", "/dashboard/activities/123"), true);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/plan"), true);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/calendar"), true);
});

test("secondary routes do not claim a primary destination", () => {
  assert.equal(isDashboardPageCurrent("data-quality", "/dashboard/data-quality"), true);
  assert.equal(isDashboardPageCurrent("settings", "/dashboard/settings"), true);
  assert.equal(isDashboardPageCurrent("home", "/dashboard/data-quality"), false);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/settings"), false);
});

test("calendar fallback uses Plan when pathname is not available", () => {
  assert.equal(isDashboardPageCurrent("plan", null, "calendar"), true);
  assert.equal(isDashboardPageCurrent("calendar", null, "calendar"), true);
});
