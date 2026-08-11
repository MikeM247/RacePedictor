import { expect, test, type Page } from "@playwright/test";

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
  version: 1, revision: 2, startsOn: "2026-08-10", endsOn: "2026-08-16", timezone: "Africa/Johannesburg",
  weeklyStructure: [{ weekStartsOn: "2026-08-10", focus: "Safe aerobic consistency", sessionIds: ["run-a"] }],
  workouts: [{ id: "run-a", kind: "run", scheduledDate: "2026-08-10", title: "Cloud easy run", purpose: "Aerobic base", prescription: "Run easily for 30 minutes.", cautions: [], durationMinutes: 30 }],
  contextArtifactId: "context-a", createdAt: "2026-08-09T08:00:00.000Z",
  approval: { goalRationale: "Approved goal", rationale: "Approved safe start", summary: "Approved plan", assumptions: [], cautions: [], sourceHistoryFingerprint: "a".repeat(64), contentHash: "b".repeat(64) },
  status: "active", activatedAt: "2026-08-09T09:00:00.000Z", activatedBy: "user",
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

test("online Plan and Calendar are read-only at desktop and mobile widths", async ({ page }) => {
  await page.route("**/api/v1/coaching/plans/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: plan }) }));
  await page.route("**/api/v1/coaching/plans/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { plans: [plan] } }) }));
  await page.route("**/api/v1/coaching/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { stale: { isStale: false } } }) }));
  await page.route("**/api/v1/coaching/calendar**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { from: "2026-08-10", to: "2026-08-16", sessions: [{ ...plan.workouts[0], prescribedDate: "2026-08-10", effectiveDate: "2026-08-10", originalDate: "2026-08-10", status: "upcoming", revision: 2, warnings: [] }] } }) }));

  await page.goto("/dashboard/plan");
  await expect(page.getByText("Online read-only")).toBeVisible();
  await expect(page.getByText("Cloud easy run")).toBeVisible();
  await expect(page.getByRole("button", { name: /Create a plan/u })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/calendar?date=2026-08-10");
  await expect(page.getByText("Cloud easy run")).toBeVisible();
  await expect(page.getByText("Schedule changes remain available in the local coaching workflow and will appear here after sync.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review move" })).toHaveCount(0);
});

test("online Settings connects and disconnects Strava, pairs once, reports status, and revokes only local sync", async ({ page }) => {
  const existing = {
    id: "device_existing", athleteId: "athlete-a", displayName: "Old computer", status: "active" as "active" | "revoked",
    lastAcknowledgedCursor: "12" as string | null, lastSeenAt: "2026-08-01T10:00:00.000Z" as string | null,
    createdAt: "2026-07-30T10:00:00.000Z", revokedAt: null as string | null,
  };
  let current = existing;
  let stravaState: "disconnected" | "connected" = "disconnected";
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
