import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import {
  milestoneHomeTimeline,
  milestoneHomeImages,
  milestoneHomeTraining,
} from "./milestone-home-fixture.ts";
const root = fileURLToPath(new URL("../../..", import.meta.url));
async function fixture(page: Page) {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.route("**/api/v1/coaching/milestones*", (route) =>
    route.fulfill({ json: { data: milestoneHomeTimeline } }),
  );
  await page.route("**/api/v1/coaching/milestone-images", (route) =>
    route.fulfill({ json: { data: milestoneHomeImages } }),
  );
  await page.route("**/api/v1/dashboard/training-summary", (route) =>
    route.fulfill({ json: { data: milestoneHomeTraining } }),
  );
  await page.route("**/api/v1/dashboard/appearance", (route) =>
    route.fulfill({
      json: { data: { heroImageUrl: "/road-to-comrades-v2.webp" } },
    }),
  );
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Oldies 10 km." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Morning run", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator(".option-nine-home img")
    .evaluateAll((images) =>
      Promise.all(images.map((x) => (x as HTMLImageElement).decode())),
    );
}
test("four milestones, responsive order, truthful states, and accessible details", async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.locator(".hybrid-timeline .achievement-stop-copy h3"),
  ).toHaveText([
    "21 km PB",
    "Oldies 10 km",
    "Best of the Best Marathon",
    "Comrades Sub-11",
  ]);
  for (const width of [320, 390, 760, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const cards = await page.locator(".training-summary").evaluateAll((xs) =>
      xs.map((x) => {
        const r = x.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    expect(Math.abs(cards[0].w - cards[1].w)).toBeLessThan(1);
    if (width > 760) expect(Math.abs(cards[0].y - cards[1].y)).toBeLessThan(1);
    else expect(cards[1].y).toBeGreaterThanOrEqual(cards[0].y + cards[0].h);
  }
  await page
    .getByRole("button", { name: "View next goal", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "View next goal", exact: true }),
  ).toBeFocused();
});
test("actual Home matches option 09 geometry and pixels with equivalent content", async ({
  page,
  context,
}, testInfo) => {
  await fixture(page);
  const reference = await context.newPage();
  const folder = path.join(root, "docs/plans/references/milestone-home");
  await reference.route("http://milestone-reference.test/**", async (route) => {
    const file = decodeURIComponent(
      new URL(route.request().url()).pathname.slice(1),
    );
    const contentType = file.endsWith(".css")
      ? "text/css"
      : file.endsWith(".html")
        ? "text/html"
        : file.endsWith(".js")
          ? "application/javascript"
          : file.endsWith(".webp")
            ? "image/webp"
            : file.endsWith(".png")
              ? "image/png"
              : "font/ttf";
    await route.fulfill({
      body: await readFile(path.join(folder, file)),
      contentType,
    });
  });
  await reference.goto(
    "http://milestone-reference.test/09-last-next-training.html",
  );
  await reference.evaluate(() => document.fonts.ready);
  await reference
    .locator("img")
    .evaluateAll((xs) =>
      Promise.all(xs.map((x) => (x as HTMLImageElement).decode())),
    );
  // The source has no sponsor/subtype fields; use equivalent verified fixture content.
  await reference.locator(".race-subtitle").evaluate((x) => {
    x.textContent = "Sunday, 1 November 2026";
  });
  await reference
    .locator(".achievement-stop--final .achievement-target")
    .evaluate((x) => {
      x.textContent = "Sub-11:00";
    });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1200 });
    await reference.setViewportSize({ width, height: 1200 });
    for (const selector of [
      ".topnav",
      ".page-head",
      ".spotlight-hero",
      ".spotlight-coach",
      ".hybrid-timeline",
      ".training-summary--last",
      ".training-summary--next",
    ]) {
      const actual = (await page.locator(selector).boundingBox())!,
        expected = (await reference.locator(selector).boundingBox())!;
      for (const key of ["x", "y", "width", "height"] as const)
        expect(
          Math.abs(actual[key] - expected[key]),
          `${width}: ${selector} ${key}`,
        ).toBeLessThanOrEqual(1);
    }
    await page.addStyleTag({
      content: ".home-management-link{visibility:hidden!important}",
    });
    await reference.addStyleTag({
      content:
        ".milestone-heading p{visibility:hidden!important}.demo-note{display:none!important}",
    });
    const actualPng = await page.screenshot({ fullPage: true }),
      referencePng = await reference.screenshot({ fullPage: true });
    await testInfo.attach(`actual-${width}`, {
      body: actualPng,
      contentType: "image/png",
    });
    await testInfo.attach(`reference-${width}`, {
      body: referencePng,
      contentType: "image/png",
    });
    const actual = await sharp(actualPng)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      expected = await sharp(referencePng)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    expect(actual.info).toEqual(expected.info);
    let changed = 0;
    for (let i = 0; i < actual.data.length; i += 4) {
      if (
        Math.max(
          ...[0, 1, 2].map((c) =>
            Math.abs(actual.data[i + c] - expected.data[i + c]),
          ),
        ) > 16
      )
        changed++;
    }
    expect(
      changed / (actual.info.width * actual.info.height),
    ).toBeLessThanOrEqual(0.005);
  }
  await reference.close();
});
test("Settings persists images, cancels drafts, validates uploads and rejects stale writes", async ({
  page,
  request,
}) => {
  await page.goto("/dashboard/settings?section=milestones");
  const manage = page.getByRole("button", {
    name: "Manage image for 21 km PB",
  });
  await manage.click();
  let dialog = page.locator("dialog[open]");
  await dialog
    .getByRole("button", { name: "Oldies 10 km · Durban North", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save image", exact: true }).click();
  await expect(
    page.getByText("Milestone image saved.", { exact: true }),
  ).toBeVisible();
  const state = (
    await (await request.get("/api/v1/coaching/milestone-images")).json()
  ).data;
  expect(state.state.bindings[0].choice.id).toBe("oldies");
  await manage.click();
  dialog = page.locator("dialog[open]");
  await dialog
    .getByRole("button", { name: "Comrades Marathon", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  expect(
    (await (await request.get("/api/v1/coaching/milestone-images")).json()).data
      .revision,
  ).toBe(state.revision);
  await manage.click();
  await page
    .getByLabel("Upload milestone image")
    .setInputFiles(
      path.join(
        root,
        "apps/web/public/milestone-images/best-of-the-best-2027-logo.png",
      ),
    );
  await expect(
    page.getByText("Uploading or saving image…", { exact: true }),
  ).toBeHidden();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Save image", exact: true })
    .click();
  await expect(
    page.getByText("Milestone image saved.", { exact: true }),
  ).toBeVisible();
  const next = (
    await (await request.get("/api/v1/coaching/milestone-images")).json()
  ).data;
  expect(next.state.bindings[0].choice.kind).toBe("upload");
  expect(
    (
      await request.get(
        "/api/v1/coaching/milestone-images/assets/" +
          next.state.bindings[0].choice.id,
      )
    ).ok(),
  ).toBe(true);
  const view = (await (await request.get("/api/v1/coaching/milestones")).json())
    .data;
  expect(
    (
      await request.put("/api/v1/coaching/milestone-images", {
        data: {
          entryId: "achievement:pb",
          expectedRevision: state.revision,
          sourceVersion: view.sourceVersion,
          choice: null,
        },
      })
    ).status(),
  ).toBe(409);
});
test("partial source failures preserve the other card and overflow opens a vertical dialog", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/v1/dashboard/training-summary", (route) =>
    route.fulfill({
      json: {
        data: { ...milestoneHomeTraining, lastRun: { status: "unavailable" } },
      },
    }),
  );
  const many = structuredClone(milestoneHomeTimeline);
  for (let i = 0; i < 3; i++) {
    const target = structuredClone(
      many.entries.find((e) => e.target && !e.target.mainGoal)!,
    );
    target.id = `target:extra-${i}`;
    target.title = `Extra checkpoint ${i}`;
    target.target!.id = `extra-${i}`;
    target.date = target.target!.date = `2027-0${i + 1}-15`;
    target.sources = [{ kind: "target", id: `extra-${i}` }];
    many.entries.push(target);
  }
  await page.route("**/api/v1/coaching/milestones*", (route) =>
    route.fulfill({ json: { data: many } }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Easy run · Keep it comfortable",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".training-summary--last")).toContainText(
    "Training summary unavailable",
  );
  await page.getByRole("button", { name: "View all milestones (7)" }).click();
  await expect(page.locator("dialog[open] .achievement-stop")).toHaveCount(7);
  const positions = await page
    .locator("dialog[open] .achievement-stop")
    .evaluateAll((xs) => xs.map((x) => x.getBoundingClientRect().y));
  expect(positions.every((y, i) => i === 0 || y > positions[i - 1])).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "View all milestones (7)" }),
  ).toBeFocused();
});
test("Home accessibility and long titles remain usable", async ({ page }) => {
  await fixture(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator(".race-name").evaluate((x) => {
    x.textContent =
      "A long race name with several words and a demanding next milestone";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.locator("dialog[open]").getByRole("link", { name: "Settings" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
});

test('next-session navigation selects the saved session and returns focus to Home',async({page})=>{
 await fixture(page);
 await page.route('**/api/v1/coaching/calendar?*',route=>{const url=new URL(route.request().url());return route.fulfill({json:{data:{from:url.searchParams.get('from'),to:url.searchParams.get('to'),timezone:'Africa/Johannesburg',sessions:[{id:'next',kind:'run',scheduledDate:'2026-10-31',effectiveDate:'2026-10-31',prescribedDate:'2026-10-31',originalDate:'2026-10-31',title:'Easy run · Keep it comfortable',purpose:'Synthetic session navigation check',prescription:'40 minutes at an easy effort',durationMinutes:40,cautions:[],status:'upcoming',revision:1,warnings:[],amendments:[]}],historicalSessions:[],activities:[],activitiesReadStatus:'available'}}});});
 await page.clock.setSystemTime(new Date());
 await page.getByRole('link',{name:'View session',exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/calendar\?date=2026-10-31&session=next&recovery=/);await expect(page.getByRole('link',{name:'Return to Home',exact:true})).toBeVisible();await expect(page.locator('p:visible').filter({hasText:'40 minutes at an easy effort'}).first()).toBeVisible();await page.getByRole('button',{name:'Close details',exact:true}).click();await page.getByRole('link',{name:'Return to Home',exact:true}).click();await expect(page.getByRole('link',{name:'View session',exact:true})).toBeFocused();
});
