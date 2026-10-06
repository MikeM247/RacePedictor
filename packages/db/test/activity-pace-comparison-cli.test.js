import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { activity, artifact, source } from "../../core/test/fixtures/pace-comparison.ts";
import { validatePaceArtifact } from "../../core/src/services/activity-pace-comparison.ts";
const cli = fileURLToPath(new URL("../src/activity-pace-comparison-cli.js", import.meta.url));
test("CLI validation cannot approve or publish; approval seals exactly reviewed content", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rp-pace-cli-"));
  const draftPath = path.join(directory, "draft.json"), contextPath = path.join(directory, "context.json"), output = path.join(directory, "approved.json");
  const { artifactId, artifactHash, approvedAt, ...draft } = artifact();
  writeFileSync(draftPath, JSON.stringify(draft));
  writeFileSync(contextPath, JSON.stringify({ activity, source, activityRevision: 3, comparisonRevision: 0 }));
  const run = (...args) => spawnSync(process.execPath, ["--experimental-strip-types", cli, ...args], { encoding: "utf8" });
  const args = ["--draft", draftPath, "--context", contextPath, "--out", output];
  assert.equal(run("validate", ...args).status, 0); assert.equal(existsSync(output), false);
  assert.equal(run("approve", ...args).status, 1); assert.equal(existsSync(output), false);
  assert.equal(run("approve", ...args, "--owner-approved").status, 0);
  const sealed = JSON.parse(readFileSync(output, "utf8"));
  assert.doesNotThrow(() => validatePaceArtifact(sealed, activity, source));
  assert.deepEqual(sealed.blocks, draft.blocks);
  // A changed artifact is rejected before loading credentials or touching the network.
  writeFileSync(output, JSON.stringify({ ...sealed, blocks: [] }));
  const rejected = run("publish", "--artifact", output);
  assert.equal(rejected.status, 1); assert.match(rejected.stderr, /artifact changed/);
});
