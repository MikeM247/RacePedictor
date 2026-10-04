import test from "node:test";
import assert from "node:assert/strict";
import { isDashboardPageCurrent } from "../components/dashboard/dashboard-navigation-state.ts";

test("Home and Calendar are independent destinations; supporting URLs stay valid", () => {
  assert.equal(isDashboardPageCurrent("home", "/dashboard"), true);
  assert.equal(isDashboardPageCurrent("home", "/dashboard/activities"), false);
  assert.equal(isDashboardPageCurrent("training", "/dashboard/activities"), true);
  assert.equal(isDashboardPageCurrent("training", "/dashboard/activities/123"), true);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/plan"), true);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/calendar"), false);
  assert.equal(isDashboardPageCurrent("calendar", "/dashboard/calendar"), true);
});

test("secondary routes do not claim a primary destination", () => {
  assert.equal(isDashboardPageCurrent("data-quality", "/dashboard/data-quality"), true);
  assert.equal(isDashboardPageCurrent("settings", "/dashboard/settings"), true);
  assert.equal(isDashboardPageCurrent("home", "/dashboard/data-quality"), false);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/settings"), false);
});

test("calendar fallback uses Calendar when pathname is not available", () => {
  assert.equal(isDashboardPageCurrent("plan", null, "calendar"), false);
  assert.equal(isDashboardPageCurrent("calendar", null, "calendar"), true);
});
