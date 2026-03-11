import assert from "node:assert/strict";
import test from "node:test";

import { handleUploadRequest } from "./handler.js";

function buildRequest(formData) {
  return new Request("http://localhost/api/v1/imports/upload", { method: "POST", body: formData });
}

test("returns parsed upload summary for valid single-activity GPX", async () => {
  const formData = new FormData();
  formData.set("sourceType", "gpx");
  formData.set("file", new File(["<gpx><trk><name>A</name></trk></gpx>"], "activity.gpx", { type: "application/gpx+xml" }));

  const response = await handleUploadRequest(buildRequest(formData));
  const payload = response.body;

  assert.equal(response.status, 200);
  assert.equal(payload.status, "parsed");
  assert.equal(payload.stagedCount, 1);
  assert.equal(payload.rejectedCount, 0);
  assert.deepEqual(payload.parseWarnings, []);
});

test("returns warning when multipart file contains multiple activities", async () => {
  const formData = new FormData();
  formData.set("sourceType", "tcx");
  formData.set("file", new File(["<TrainingCenterDatabase><Activities><Activity/><Activity/></Activities></TrainingCenterDatabase>"], "multi.tcx", { type: "application/xml" }));

  const response = await handleUploadRequest(buildRequest(formData));
  const payload = response.body;

  assert.equal(response.status, 200);
  assert.equal(payload.stagedCount, 1);
  assert.equal(payload.parseWarnings.length, 1);
});

test("validates required multipart fields", async () => {
  const formData = new FormData();
  formData.set("sourceType", "gpx");

  const response = await handleUploadRequest(buildRequest(formData));
  const payload = response.body;

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
});

test("replays idempotent response when idempotencyKey is reused", async () => {
  const requestBody = "<gpx><trk><name>A</name></trk></gpx>";

  const formA = new FormData();
  formA.set("sourceType", "gpx");
  formA.set("idempotencyKey", "upload-123");
  formA.set("file", new File([requestBody], "activity.gpx", { type: "application/gpx+xml" }));

  const firstResponse = await handleUploadRequest(buildRequest(formA));
  const firstPayload = firstResponse.body;

  const formB = new FormData();
  formB.set("sourceType", "gpx");
  formB.set("idempotencyKey", "upload-123");
  formB.set("file", new File([requestBody], "activity.gpx", { type: "application/gpx+xml" }));

  const secondResponse = await handleUploadRequest(buildRequest(formB));
  const secondPayload = secondResponse.body;

  assert.equal(secondResponse.status, 200);
  assert.equal(secondPayload.importId, firstPayload.importId);
  assert.ok(secondPayload.parseWarnings.some((warning) => warning.includes("Idempotent retry accepted")));
});
