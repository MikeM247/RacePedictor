import { expect, test } from "@playwright/test";

test("online coach provider/model selection saves and survives reload", async ({ page }) => {
  let saved = { provider: "openai", modelId: "gpt-5-mini", revision: 0, credentials: { openai: true, openrouter: true } };
  let saveBody: Record<string, unknown> | null = null;
  await page.route("**/api/v1/coaching/ai-settings", async (route) => {
    if (route.request().method() === "PUT") {
      saveBody = route.request().postDataJSON() as Record<string, unknown>;
      saved = { ...saved, provider: String(saveBody.provider), modelId: String(saveBody.modelId), revision: saved.revision + 1 };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: saved }) });
  });
  await page.route("**/api/v1/coaching/ai-models**", async (route) => {
    const provider = new URL(route.request().url()).searchParams.get("provider");
    const models = provider === "openrouter" ? [{ id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" }] : [{ id: "gpt-5-mini", name: "GPT-5 mini" }, { id: "gpt-5", name: "GPT-5" }];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { provider, models, stale: false } }) });
  });
  await page.goto("/dashboard/settings?section=coach");
  const panel = page.locator("details.settings-group").filter({ hasText: "AI coach" });
  await expect(panel).toHaveAttribute("open", "");
  await expect(panel.getByRole("heading", { name: "AI coach" })).toBeVisible();
  await panel.getByLabel("Provider").selectOption("openrouter");
  await panel.getByLabel("Search models").fill("claude-sonnet");
  await expect(panel.getByRole("combobox", { name: "Model", exact: true }).getByRole("option")).toContainText(["Choose a model", "Claude Sonnet 4 · anthropic/claude-sonnet-4"]);
  await panel.getByRole("combobox", { name: "Model", exact: true }).selectOption("anthropic/claude-sonnet-4");
  await panel.getByRole("button", { name: "Save coach settings" }).click();
  await expect(panel.getByText("Saved for new feedback attempts.")).toBeVisible();
  expect(saveBody).toMatchObject({ provider: "openrouter", modelId: "anthropic/claude-sonnet-4", expectedRevision: 0 });
  await page.reload();
  await expect(panel.getByLabel("Provider")).toHaveValue("openrouter");
  await expect(panel.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("anthropic/claude-sonnet-4");
});


test("online review regeneration sends its revision and keeps published feedback on failure", async ({ page }) => {
  const activityId = "activity-online-coach";
  const summary = { id: activityId, athleteId: "athlete-a", title: "Online easy run", occurredAt: "2026-08-27T02:48:00.000Z", localOccurredAt: "2026-08-27T04:48:00.000+02:00", sport: "run", distanceM: 8200, elapsedTimeS: 2890, avgPaceSecPerKm: 352, elevationGainM: 70, hrAvailable: false, cadenceAvailable: false };
  const activity = { ...summary, endedAt: "2026-08-27T03:36:10.000Z", sourceType: "strava", elevationLossM: 62, dedupeHash: "c".repeat(64), createdAt: "2026-08-27T05:00:00.000Z", splits: [], routeSignature: null };
  const review = { id: "review-online-coach", athleteId: "athlete-a", activityId, revision: 1, inputFingerprint: "a".repeat(64), headline: "Published aerobic review", assessment: "The activity delivered steady aerobic work.", nextStep: "Keep the next run easy.", comparison: { matchState: "suggested", planId: "plan-a", sessionId: "session-a", planVersion: 1, sessionTitle: "Easy run", plannedDurationMinutes: 45, actualDurationMinutes: 48, plannedDistanceMeters: 8000, actualDistanceMeters: 8200, plannedIntensityRpe: 3, actualPerceivedEffort: null, interpretation: "The activity stayed close to its planned duration." }, evidence: [{ source: "activity", label: "Recorded distance and duration" }], limitations: [], generatedAt: "2026-08-27T05:00:00.000Z", publishedAt: "2026-08-27T05:00:00.000Z", model: "anthropic/claude-sonnet-4", provider: "openrouter", requestedModel: "anthropic/claude-sonnet-4", configurationRevision: 1, promptVersion: "activity-coach-review.cloud-metrics.v1", provenance: "cloud_metrics_plan" };
  let regenerationStarted = false;
  let expectedRevision: number | undefined;
  await page.route("**/api/v1/activities**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const value = path === `/api/v1/activities/${activityId}` ? { activity } : { items: [summary] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: value }) });
  });
  await page.route(`**/api/v1/activities/${activityId}/coach-review`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { regenerate?: boolean; expectedReviewRevision?: number };
      expect(body.regenerate).toBe(true);
      expectedRevision = body.expectedReviewRevision;
      regenerationStarted = true;
      return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ data: { activityId, requestId: "review-request-a", status: "queued", reused: false, updatedAt: "2026-08-27T05:01:00.000Z" } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { activityId, status: regenerationStarted ? "retry_wait" : "ready", review, requestId: "review-request-a", updatedAt: "2026-08-27T05:00:00.000Z", readRevision: null } }) });
  });
  await page.goto("/dashboard/activities");
  await expect(page.getByRole("button", { name: /Online easy run/ })).toBeVisible();
  await page.getByRole("button", { name: /Online easy run/ }).click();
  await expect(page.getByRole("heading", { name: "Published aerobic review" })).toBeVisible();
  await page.getByRole("button", { name: "Regenerate feedback" }).click();
  expect(expectedRevision).toBe(1);
  await page.getByRole("button", { name: "Check for updated feedback" }).last().click();
  await expect(page.getByRole("heading", { name: "Published aerobic review" })).toBeVisible();
  await expect(page.getByText(/retry when ready/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate feedback" })).toBeEnabled();
});
