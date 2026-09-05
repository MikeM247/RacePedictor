import { expect, test, type Page } from "@playwright/test";

const localDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const dashboard = {
  fetchStatus: "success",
  stale: { isStale: false },
  data: {
    predictionSummary: { athleteId: "athlete-a", targetDistanceM: 10_000, predictedTimeS: 3000, predictedPaceSecPerKm: 300, bandLowS: 2940, bandHighS: 3060, modelVersion: "cloud-live", generatedAt: "2026-08-10T12:00:00.000Z" },
    predictionOptions: [],
    driverContributions: [{ key: "distance", label: "Recent distance", contributionPct: 12, direction: "positive", confidence: 0.8 }],
    featureTrendPoints: [{ weekStart: "2026-08-03", featureKey: "distance", featureLabel: "Distance", value: 28, unit: "km" }],
    importProgress: { importId: "cloud-workouts", status: "completed", stagedCount: 3, normalizedCount: 3, duplicateCount: 0, rejectedCount: 0, updatedAt: "2026-08-10T12:00:00.000Z" },
  },
};

const status = {
  athleteId: "athlete-a",
  providerConnection: { state: "current", lastSuccessfulAt: "2026-08-10T11:00:00.000Z", staleAfter: null, provider: "strava", displayStatus: "connected", lastProviderContactAt: "2026-08-10T11:00:00.000Z" },
  ingestion: { state: "current", lastSuccessfulAt: "2026-08-10T11:05:00.000Z", staleAfter: null, lastEventAt: "2026-08-10T11:00:00.000Z", lastCanonicalUpdateAt: "2026-08-10T11:05:00.000Z", pendingJobs: 0, failedJobs: 0 },
  activityData: { state: "current", lastSuccessfulAt: "2026-08-10T11:05:00.000Z", staleAfter: null, latestActivityAt: "2026-08-10T10:00:00.000Z", lastCanonicalUpdateAt: "2026-08-10T11:05:00.000Z" },
  localDevice: { state: "stale", lastSuccessfulAt: "2026-08-01T10:00:00.000Z", staleAfter: "2026-08-02T10:00:00.000Z", deviceName: "Home computer", deviceStatus: "active", pairedAt: "2026-07-30T10:00:00.000Z", lastSeenAt: "2026-08-01T10:00:00.000Z", lastErrorCode: null },
  secondBrain: { state: "stale", lastSuccessfulAt: "2026-08-01T09:00:00.000Z", staleAfter: "2026-08-03T09:00:00.000Z", latestRevision: 7, publishedAt: "2026-08-01T09:00:00.000Z" },
  updatedAt: "2026-08-10T12:00:00.000Z",
};

const plan = {
  id: "plan-a", athleteId: "athlete-a", goalId: "goal-a", goalRevision: 1, routineRevision: 1,
  version: 2, revision: 2, startsOn: "2026-08-10", endsOn: "2026-08-16", timezone: "Africa/Johannesburg",
  weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Safe aerobic consistency", sessionIds: ["run-a"] }],
  workouts: [{ id: "run-a", kind: "run", scheduledDate: "2026-08-10", title: "Cloud easy run", purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30 }],
  contextArtifactId: "context-a", createdAt: "2026-08-09T08:00:00.000Z",
  approval: { goalRationale: "Approved goal", rationale: "Version 1.1.0 approved safe start", summary: "Approved plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64) },
  status: "active", activatedAt: "2026-08-09T09:00:00.000Z", activatedBy: "user",
};

const previousPlan = {
  ...plan,
  id: "plan-previous",
  version: 1,
  revision: 2,
  workouts: [{ ...plan.workouts[0], id: "run-previous", title: "Previous easy run" }],
  weeklyStructure: [{ ...plan.weeklyStructure[0], sessionIds: ["run-previous"] }],
  approval: { ...plan.approval, rationale: "Version 1.0.0 initial approved plan", contentHash: "c".repeat(64) },
  status: "retired",
  retiredAt: "2026-08-09T09:00:00.000Z",
  activatedAt: undefined,
  activatedBy: undefined,
};

async function mockDashboard(page: Page, overview = dashboard) {
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: status }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {
    athleteId: "athlete-a", date: "2026-08-10", sessionId: "run-a", message: "Follow the approved session as written; the online dashboard has not adapted it.", source: "fallback", generatedAt: "2026-08-10T12:00:00.000Z", idempotencyKey: "cloud-today:athlete-a:2026-08-10:run-a", timezone: "Africa/Johannesburg", state: "upcoming", status: "upcoming", goal: null, plan: { id: "plan-a", version: 1, startsOn: "2026-08-10", endsOn: "2026-08-16" }, planVersion: 1, session: null, localCue: "Read-only approved plan.", scheduleWarnings: [], stale: { isStale: false, reason: null }, links: { plan: "/dashboard/plan", calendar: "/dashboard/calendar", session: null },
  } }) }));
}

test("online dashboard stays useful while the local device and Second Brain are stale", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Independent freshness signals" })).toBeVisible();
  await expect(page.getByText("Workout data").locator("..").getByText("Current", { exact: true })).toBeVisible();
  await expect(page.getByText("Local sync device").locator("..").getByText("Stale", { exact: true })).toBeVisible();
  await expect(page.getByText("Second Brain context").locator("..").getByText("Stale", { exact: true })).toBeVisible();
  await expect(page.getByText("Local sync can be offline while cloud workouts remain current.")).toBeVisible();
  await expect(page.getByText("Workout ingestion does not imply an AI review or a training-plan change.")).toBeVisible();
  await expect(page.getByText("50:00")).toBeVisible();
});

test("online dashboard exposes a recoverable service error", async ({ page }) => {
  await page.route("**/api/v1/dashboard/overview", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Unavailable", details: [] } }) }));
  await page.route("**/api/v1/sync/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: status }) }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Unable to load online data" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("online Activities renders cloud-enveloped Strava data without a client crash", async ({ page }) => {
  const browserErrors: Error[] = [];
  page.on("pageerror", (error) => browserErrors.push(error));
  const activity = {
    id: "activity-a", athleteId: "athlete-a", title: "Morning Strava Run",
    occurredAt: "2026-08-11T04:00:00.000Z", localOccurredAt: "2026-08-11T06:00:00.000+02:00",
    sport: "run", distanceM: 10_000, elapsedTimeS: 3_000, avgPaceSecPerKm: 300,
    elevationGainM: 100, hrAvailable: true, cadenceAvailable: true,
  };
  await page.route("**/api/v1/activities**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/v1/activities/activity-a"
      ? { data: { activity: {
        ...activity, endedAt: "2026-08-11T04:50:00.000Z", sourceType: "strava",
        sourceActivityId: "strava-a", elevationLossM: 90, dedupeHash: "a".repeat(64),
        createdAt: "2026-08-11T05:00:00.000Z", splits: [], routeSignature: null,
      } } }
      : { data: { items: [activity] } };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/dashboard/activities");
  await expect(page.getByRole("heading", { name: "Recent activities" })).toBeVisible();
  await expect(page.getByText("Morning Strava Run")).toBeVisible();
  await page.getByRole("button", { name: /Morning Strava Run/u }).click();
  await expect(page.getByRole("heading", { name: "Morning Strava Run" })).toBeVisible();
  await expect(page.getByText("No split data was included in this imported activity.")).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("online Activities handles a malformed success envelope as a recoverable error", async ({ page }) => {
  const browserErrors: Error[] = [];
  page.on("pageerror", (error) => browserErrors.push(error));
  await page.route("**/api/v1/activities**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {} }),
  }));

  await page.goto("/dashboard/activities");
  await expect(page.getByRole("heading", { name: "Unable to load activities" })).toBeVisible();
  await expect(page.getByText("The server returned an invalid activity response.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("online Plan selects an approved version while Calendar remains prescription-safe", async ({ page }) => {
  let active: Record<string, unknown> = plan;
  let history: Record<string, unknown>[] = [plan, previousPlan];
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: active }) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { plans: history } }) }));
  await page.route("**/api/v1/coaching/plans/plan-previous/activate", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ expectedActivePlanId: "plan-a" });
    const { retiredAt: _retiredAt, ...previousBody } = previousPlan;
    const { activatedAt: _activatedAt, activatedBy: _activatedBy, ...activeBody } = plan;
    const selected = { ...previousBody, revision: 3, status: "active", activatedAt: "2026-08-10T13:00:00.000Z", activatedBy: "user" };
    const retired = { ...activeBody, revision: 3, status: "retired", retiredAt: "2026-08-10T13:00:00.000Z" };
    active = selected;
    history = [retired, selected];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { activePlan: selected, retiredPlan: retired, reused: false } }) });
  });
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { stale: { isStale: false } } }) }));
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { from: "2026-08-10", to: "2026-08-16", sessions: [{ ...plan.workouts[0], prescribedDate: "2026-08-10", effectiveDate: "2026-08-10", originalDate: "2026-08-10", status: "upcoming", revision: 2, warnings: [] }] } }) }));

  await page.goto("/dashboard/plan");
  await expect(page.getByText("Online plan control")).toBeVisible();
  await expect(page.getByText("Coaching version 1.1.0").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cloud easy run" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create a plan/u })).toHaveCount(0);
  await page.getByText("Coaching version 1.0.0").click();
  await page.getByRole("button", { name: "Make this approved plan active" }).click();
  await expect(page.getByRole("heading", { name: "Make coaching version 1.0.0 active?" })).toBeVisible();
  await page.getByRole("button", { name: "Make active" }).click();
  await expect(page.getByText("Coaching version 1.0.0 is now active. Today and Calendar use this approved version.")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/calendar?date=2026-08-10");
  await expect(page.getByRole("heading", { name: "Cloud easy run" })).toBeVisible();
  await expect(page.getByText("Past and current-day sessions are read-only. Future changes belong in Calendar.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review move" })).toHaveCount(0);
});

test("online Calendar saves a reasoned amendment to a future owner session", async ({ page }) => {
  const today = localDate();
  const futureDate = addDays(today, 2);
  const planEnd = addDays(today, 14);
  const original = {
    id: "run-future", kind: "run", scheduledDate: futureDate, title: "Cloud future run",
    purpose: "Build aerobic consistency.", prescription: "Run easily for 40 minutes.",
    cautions: [], durationMinutes: 40, distanceMeters: 6500, intensityRpe: 3,
  };
  let session = {
    ...original, prescribedDate: futureDate, effectiveDate: futureDate, originalDate: futureDate,
    status: "upcoming", revision: 1, warnings: [], original, amendments: [],
  } as Record<string, unknown>;

  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { ...plan, startsOn: today, endsOn: planEnd, timezone: "Africa/Johannesburg" } }),
  }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { stale: { isStale: false } } }),
  }));
  await page.route("**/api/v1/coaching/calendar**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        operation: "amend", expectedRevision: 1,
        reason: "Work travel requires a shorter treadmill session.",
        changes: { prescription: "Run easily for 30 minutes on the treadmill." },
      });
      const amendment = {
        id: "amendment-online", operation: "amend", reason: body.reason,
        changedAt: new Date().toISOString(), changedFields: ["prescription"], resultingRevision: 2,
      };
      session = { ...session, prescription: body.changes.prescription, revision: 2, amendments: [amendment] };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session, operation: "amend" } }) });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ data: { from: today, to: planEnd, sessions: [session] } }),
    });
  });

  await page.goto(`/dashboard/calendar?date=${futureDate}`);
  const card = page.getByRole("article").filter({ hasText: "Cloud future run" });
  await card.getByRole("button", { name: "Amend session" }).click();
  const dialog = page.getByRole("dialog", { name: "Amend future session" });
  await expect(dialog.getByRole("button", { name: "Save reasoned amendment" })).toBeDisabled();
  await dialog.getByLabel("Prescription").fill("Run easily for 30 minutes on the treadmill.");
  await dialog.getByLabel("Reason for this amendment").fill("Work travel requires a shorter treadmill session.");
  await dialog.getByRole("button", { name: "Save reasoned amendment" }).click();

  await expect(page.getByRole("status").filter({ hasText: "approved source and your reason are preserved" })).toBeVisible();
  await expect(card).toContainText("Current prescription: Run easily for 30 minutes on the treadmill.");
  await card.getByText("Change history (1)").click();
  await expect(card).toContainText("Work travel requires a shorter treadmill session.");
  await expect(card).toContainText("No AI review is claimed");
});

test("online Calendar records a past session as skipped without changing its approved source", async ({ page }) => {
  const today = localDate();
  const pastDate = addDays(today, -1);
  const original = {
    id: "run-past", kind: "run", scheduledDate: pastDate, title: "Thursday hilly run",
    purpose: "Build controlled climbing strength.", prescription: "Run the approved hilly route.",
    cautions: [], durationMinutes: 60, distanceMeters: 8500, intensityRpe: 6,
  };
  let session = {
    ...original, prescribedDate: pastDate, effectiveDate: pastDate, originalDate: pastDate,
    status: "upcoming", revision: 2, warnings: [], original, amendments: [],
  } as Record<string, unknown>;

  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { ...plan, startsOn: pastDate, endsOn: addDays(today, 14), timezone: "Africa/Johannesburg" } }),
  }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { stale: { isStale: false } } }),
  }));
  await page.route("**/api/v1/coaching/calendar**", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toMatchObject({
        operation: "skip", expectedRevision: 2, reason: "Skipped by athlete.",
      });
      const amendment = {
        id: "past-skip", operation: "skip", reason: "Skipped by athlete.",
        changedAt: new Date().toISOString(), changedFields: ["status"], resultingRevision: 3,
      };
      session = { ...session, status: "skipped", revision: 3, amendments: [amendment] };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session, operation: "skip" } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { sessions: [session] } }) });
  });

  await page.goto(`/dashboard/calendar?date=${pastDate}`);
  const card = page.getByRole("article").filter({ hasText: "Thursday hilly run" });
  await expect(card.getByText("Past sessions can only be recorded as skipped.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Amend session" })).toHaveCount(0);
  await card.getByRole("button", { name: "Record skipped" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Confirm skip" });
  await dialog.getByLabel("Reason for this change").fill("Skipped by athlete.");
  await dialog.getByRole("button", { name: "Confirm change" }).click();

  await expect(card).toContainText("run · skipped");
  await expect(card.getByText("Approved source prescription")).toBeVisible();
  await card.getByText("Change history (1)").click();
  await expect(card).toContainText("Skipped by athlete.");
  await expect(card.getByRole("button", { name: "Record skipped" })).toHaveCount(0);
});

test("online Settings connects and disconnects Strava, pairs once, reports status, and revokes only local sync", async ({ page }) => {
  const existing = {
    id: "device_existing", athleteId: "athlete-a", displayName: "Old computer", status: "active" as "active" | "revoked",
    lastAcknowledgedCursor: "12" as string | null, lastSeenAt: "2026-08-01T10:00:00.000Z" as string | null,
    createdAt: "2026-07-30T10:00:00.000Z", revokedAt: null as string | null,
  };
  let current = existing;
  let stravaState: "disconnected" | "connected" = "disconnected";
  let backfillCalls = 0;
  let failNextBackfill = true;
  const stravaConnection = () => ({
    athleteId: "athlete-a", provider: "strava", status: stravaState,
    displayStatus: stravaState, connectedAt: stravaState === "connected" ? "2026-08-10T12:00:00.000Z" : null,
    lastSuccessfulProviderContactAt: stravaState === "connected" ? "2026-08-10T12:01:00.000Z" : null,
    lastSuccessfulSyncAt: null, lastEventReceivedAt: null, lastErrorCode: null,
    updatedAt: "2026-08-10T12:01:00.000Z",
  });
  const oneTimeToken = "rpd1.device_new.abcdefghijklmnopqrstuvwxyz_1234567890-ABCDE";
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { authenticated: true, actor: { activeAthleteId: "athlete-a", userId: "owner-a", credentialKind: "session" }, reason: null } }),
  }));
  await page.route("**/api/v1/sync/devices", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.athleteId).toBe("athlete-a");
      current = { ...existing, id: "device_new", displayName: body.displayName, lastAcknowledgedCursor: null, lastSeenAt: null, createdAt: "2026-08-10T12:00:00.000Z" };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { device: current, deviceToken: oneTimeToken } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { devices: [current] } }) });
  });
  await page.route("**/api/v1/sync/devices/device_new", (route) => {
    current = { ...current, status: "revoked", revokedAt: "2026-08-10T12:05:00.000Z" };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { device: current } }) });
  });
  await page.route("**/api/v1/providers/strava/status", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { connection: stravaConnection() } }),
  }));
  await page.route("**/api/v1/providers/strava/connect", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ athleteId: "athlete-a", returnTo: "/dashboard/settings" });
    stravaState = "connected";
    const origin = new URL(route.request().url()).origin;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: {
      authorizationUrl: `${origin}/dashboard/settings?provider=strava&connection=connected`,
      expiresAt: "2026-08-10T12:10:00.000Z",
    } }) });
  });
  await page.route("**/api/v1/providers/strava/disconnect", async (route) => {
    expect(route.request().method()).toBe("POST");
    stravaState = "disconnected";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {
      connection: stravaConnection(), providerRevocationConfirmed: true,
    } }) });
  });
  await page.route("**/api/v1/providers/strava/backfill", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON() as {
      after: string;
      before: string;
      pageSize: number;
      maxPages: number;
      maxActivities: number;
    };
    expect(body.pageSize).toBe(30);
    expect(body.maxPages).toBe(5);
    expect(body.maxActivities).toBe(150);
    expect(Date.parse(body.before) - Date.parse(body.after)).toBe(90 * 24 * 60 * 60 * 1_000);
    backfillCalls += 1;
    if (failNextBackfill) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: {
        code: "UNAVAILABLE", message: "Strava history is temporarily unavailable", details: [],
      } }) });
      return;
    }
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ data: {
      jobId: "backfill-a", reused: false, status: "queued", bounds: body,
    } }) });
  });
  await page.route("**/api/v1/operations/status", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: {
      state: "warning", processingAllowed: true,
      signals: [{ metric: "providerRequests15Minutes", label: "Provider requests (15 minutes)", value: 70, planningCeiling: 100, warningAt: 70, hardStopAt: 85, state: "warning", ownerAction: "Review usage before enabling additional work." }],
      disclaimer: "Planning ceilings must be revalidated before production.",
    } }),
  }));

  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Automatic workouts from Strava" })).toBeVisible();
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  await Promise.all([
    page.waitForURL(/connection=connected/u),
    page.getByRole("button", { name: "Connect Strava" }).click(),
  ]);
  const stravaPanel = page.getByRole("region", { name: "Automatic workouts from Strava" });
  await expect(stravaPanel.locator(".status-chip")).toHaveText("Connected");
  await expect(page.getByText("Completed workouts will be imported automatically.")).toBeVisible();
  await page.getByRole("button", { name: "Import last 90 days" }).click();
  await expect(page.getByText("Strava history is temporarily unavailable")).toBeVisible();
  failNextBackfill = false;
  await page.getByRole("button", { name: "Import last 90 days" }).click();
  await expect(page.getByText("Recent Strava history is queued. It may take a moment to appear in Activities.")).toBeVisible();
  expect(backfillCalls).toBe(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Disconnect Strava" }).click();
  await expect(page.getByText("Strava disconnected. Existing workouts and raw history were preserved.")).toBeVisible();
  await expect(stravaPanel.locator(".status-chip")).toHaveText("Disconnected");

  await expect(page.getByRole("heading", { name: "Paired computer" })).toBeVisible();
  await expect(page.getByText("Stale · computer has not synced recently")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Only selected structured context leaves your computer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operations guardrails" })).toBeVisible();
  await expect(page.getByText("Review usage before enabling additional work.")).toBeVisible();

  await page.getByLabel("Computer name").fill("Race workstation");
  await page.getByRole("button", { name: "Replace paired computer" }).click();
  await expect(page.getByRole("heading", { name: "Save the device credential" })).toBeVisible();
  await expect(page.getByLabel("One-time device credential")).toHaveValue(oneTimeToken);
  await expect(page.getByText("Get-Clipboard | npm run sync:local -- enroll")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Revoke device" }).click();
  await expect(page.getByText("Device revoked. Strava and your browser session are unchanged.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke device" })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(page.getByLabel("One-time device credential")).toHaveCount(0);
});
