import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  importUploadApiErrorResponseSchema,
  importUploadApiResponseSchema,
} from "../../../packages/core/src/contracts/imports.ts";
import { POST } from "../app/api/v1/imports/upload/route.ts";

const validGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="route-test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Long route</name><trkseg>
    <trkpt lat="-29.8000" lon="31.0000"><ele>10</ele><time>2026-08-02T05:00:00Z</time></trkpt>
    <trkpt lat="-29.7700" lon="31.0000"><ele>20</ele><time>2026-08-02T05:15:00Z</time></trkpt>
    <trkpt lat="-29.7400" lon="31.0000"><ele>15</ele><time>2026-08-02T05:30:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

const requestWithFile = (file: File) => {
  const form = new FormData();
  form.set("file", file);
  return new Request("http://localhost/api/v1/imports/upload", { method: "POST", body: form });
};

test("multipart upload imports GPX, refreshes analytics, and uses standard errors", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "racepredictor-upload-route-"));
  const databasePath = path.join(directory, "state", "racepredictor.sqlite");
  const snapshotPath = path.join(directory, "state", "dashboard-overview.json");
  process.env.RACEPREDICTOR_DATABASE_PATH = databasePath;
  process.env.RACEPREDICTOR_DASHBOARD_SNAPSHOT = snapshotPath;
  process.env.RACEPREDICTOR_VAULT_PATH = path.join(directory, "vault");

  try {
    const response = await POST(requestWithFile(new File([validGpx], "run.gpx", { type: "application/gpx+xml" })));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(importUploadApiResponseSchema.safeParse(body).success, true);
    assert.equal(body.data.sourceType, "gpx");
    assert.equal(body.data.normalizedCount, 1);
    assert.equal(body.data.analyticsRefreshed, true);
    assert.equal(JSON.parse(await readFile(snapshotPath, "utf8")).fetchStatus, "success");

    const missing = await POST(new Request("http://localhost/api/v1/imports/upload", {
      method: "POST",
      body: new FormData(),
    }));
    assert.equal(missing.status, 400);
    const missingBody = await missing.json();
    assert.equal(importUploadApiErrorResponseSchema.safeParse(missingBody).success, true);
    assert.deepEqual(missingBody, {
      error: { code: "VALIDATION_ERROR", message: "Multipart field 'file' is required", details: [] },
    });

    process.env.RACEPREDICTOR_IMPORT_MAX_BYTES = "10";
    const oversized = await POST(requestWithFile(new File([validGpx], "run.gpx", { type: "application/gpx+xml" })));
    assert.equal(oversized.status, 413);
    const oversizedBody = await oversized.json();
    assert.equal(oversizedBody.error.code, "VALIDATION_ERROR");
  } finally {
    delete process.env.RACEPREDICTOR_DATABASE_PATH;
    delete process.env.RACEPREDICTOR_DASHBOARD_SNAPSHOT;
    delete process.env.RACEPREDICTOR_VAULT_PATH;
    delete process.env.RACEPREDICTOR_IMPORT_MAX_BYTES;
  }
});
