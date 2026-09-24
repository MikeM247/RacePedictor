import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export type RecordedApplicationWrite = {
  method: string;
  path: string;
  body: string | null;
};

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Records only application API mutations. Browser telemetry and framework
 * requests are deliberately excluded so a zero-write assertion describes the
 * runner-visible contract rather than implementation noise.
 */
export function recordApplicationWrites(page: Page) {
  const writes: RecordedApplicationWrite[] = [];
  page.on("request", (request) => {
    if (!writeMethods.has(request.method())) return;
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    writes.push({ method: request.method(), path: `${url.pathname}${url.search}`, body: request.postData() });
  });
  return writes;
}

export function expectNoApplicationWrites(writes: RecordedApplicationWrite[]) {
  expect(writes).toEqual([]);
}

export async function expectAxeClean(page: Page, state: string) {
  const result = await new AxeBuilder({ page }).analyze();
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
  }));
  expect(violations, `Accessibility violations in ${state}`).toEqual([]);
}

/**
 * Initial local Training rows are server rendered. Focused browser tests must
 * deliberately request their intercepted client fixture instead of relying on
 * any data left behind by another journey.
 */
export async function loadInterceptedTrainingHistory(page: Page) {
  const disclosure = page.locator(".activity-filter-disclosure");
  if (!await disclosure.evaluate((element) => element.hasAttribute("open"))) {
    await disclosure.locator("summary").click();
  }
  const response = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return candidate.request().method() === "GET" && url.pathname === "/api/v1/activities";
  });
  await page.getByRole("button", { name: "Apply filters" }).click();
  expect((await response).ok()).toBe(true);
}

export async function openDetailDisclosures(page: Page, count: number) {
  for (let index = 0; index < count; index += 1) {
    const disclosure = page.locator("details.detail-disclosure").nth(index);
    if (!await disclosure.evaluate((element) => element.hasAttribute("open"))) {
      await disclosure.locator("summary").click();
    }
  }
}
