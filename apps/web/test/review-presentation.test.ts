import assert from "node:assert/strict";
import test from "node:test";
import { reviewStatusLabel, reviewStatusMessage } from "../components/activities/review-presentation.ts";

for (const [status, label, message] of [
  ["not_requested", "No review requested", /No review has been requested/],
  ["queued", "Review queued", /Waiting for your local computer/],
  ["processing", "Review in progress", /preparing feedback/],
  ["retry_wait", "Review delayed", /waiting to retry/],
  ["attention", "Review needs attention", /needs attention/],
] as const) {
  test(`review presenter keeps ${status} distinct`, () => {
    assert.equal(reviewStatusLabel(status), label);
    assert.match(reviewStatusMessage(status), message);
  });
}

test("review presenter distinguishes a ready response without review content", () => {
  assert.equal(reviewStatusLabel("ready"), "Reviewed");
  assert.match(reviewStatusMessage("ready", false), /content is unavailable/);
  assert.match(reviewStatusMessage("ready", true), /saved review is available/);
});
