import test from "node:test";
import assert from "node:assert/strict";
import { isDashboardPageCurrent } from "../components/dashboard/dashboard-navigation-state.ts";
import { destinationForPath, readMenuMode, dashboardDestinations } from "../components/dashboard/dashboard-destinations.ts";

test("shared destinations distinguish nested routes and fall back to Home", () => {
  assert.equal(destinationForPath("/dashboard/coach/history").page, "coach");
  assert.equal(destinationForPath("/dashboard/activities/123").page, "training");
  assert.equal(destinationForPath("/dashboard/calendar-extra").page, "home");
  assert.deepEqual(dashboardDestinations.filter(item => item.primary).map(item => item.label), ["Home", "Coach", "Calendar", "Readiness", "Settings"]);
});
test("invalid or unavailable menu preferences retain the icon default", () => {
  assert.equal(readMenuMode(null), "icons");
  assert.equal(readMenuMode("invalid"), "icons");
  assert.equal(readMenuMode("expanded"), "expanded");
});

test("Home and Coach are independent destinations; supporting URLs stay valid", () => {
  assert.equal(isDashboardPageCurrent("home", "/dashboard"), true);
  assert.equal(isDashboardPageCurrent("coach", "/dashboard/coach"), true);
  assert.equal(isDashboardPageCurrent("coach", "/dashboard/coach/settings"), true);
  assert.equal(isDashboardPageCurrent("home", "/dashboard/coach"), false);
  assert.equal(isDashboardPageCurrent("home", "/dashboard/activities"), false);
  assert.equal(isDashboardPageCurrent("training", "/dashboard/activities"), true);
  assert.equal(isDashboardPageCurrent("training", "/dashboard/activities/123"), true);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/plan"), true);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/calendar"), false);
  assert.equal(isDashboardPageCurrent("calendar", "/dashboard/calendar"), true);
  assert.equal(isDashboardPageCurrent("coach", "/dashboard/calendar"), false);
  assert.equal(isDashboardPageCurrent("readiness", "/dashboard/readiness"), true);
  assert.equal(isDashboardPageCurrent("readiness", "/dashboard/readiness/details"), true);
  assert.equal(isDashboardPageCurrent("home", "/dashboard/readiness"), false);
});

test("secondary routes do not claim a primary destination", () => {
  assert.equal(isDashboardPageCurrent("data-quality", "/dashboard/data-quality"), true);
  assert.equal(isDashboardPageCurrent("settings", "/dashboard/settings"), true);
  assert.equal(isDashboardPageCurrent("home", "/dashboard/data-quality"), false);
  assert.equal(isDashboardPageCurrent("plan", "/dashboard/settings"), false);
  assert.equal(isDashboardPageCurrent("readiness", "/dashboard/settings"), false);
});

test("calendar fallback uses Calendar when pathname is not available", () => {
  assert.equal(isDashboardPageCurrent("plan", null, "calendar"), false);
  assert.equal(isDashboardPageCurrent("calendar", null, "calendar"), true);
});
