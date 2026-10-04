import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function args(argv) {
  const [command, ...parts] = argv;
  if (!["inspect", "publish"].includes(command)) throw new Error("Use inspect or publish");
  const options = {};
  for (let i = 0; i < parts.length; i += 2) {
    if (!["--repo", "--feedback", "--approved-sha256"].includes(parts[i]) || !parts[i + 1]) throw new Error("Expected --repo, --feedback, and publish hash");
    options[parts[i]] = parts[i + 1];
  }
  if (!options["--repo"] || !options["--feedback"] || (command === "publish" && !options["--approved-sha256"])) throw new Error("Expected --repo, --feedback, and publish hash");
  return { command, repo: path.resolve(options["--repo"]), feedbackPath: path.resolve(options["--feedback"]), approvedHash: options["--approved-sha256"] };
}

async function request(url, token, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`RacePredictor request failed (${response.status}; ${payload?.error?.code ?? "unknown"})`);
  return payload;
}

const { command, repo, feedbackPath, approvedHash } = args(process.argv.slice(2));
const contracts = await import(pathToFileURL(path.join(repo, "packages", "core", "src", "contracts", "activity-review.ts")).href);
const service = await import(pathToFileURL(path.join(repo, "packages", "core", "src", "services", "activity-athlete-feedback.ts")).href);
const bytes = await readFile(feedbackPath);
const hash = createHash("sha256").update(bytes).digest("hex");
const envelope = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
if (!envelope || Object.keys(envelope).sort().join(",") !== "feedback,expectedActivityRevision,expectedFeedbackRevision") throw new Error("Feedback file must contain feedback and expected revisions");
const feedback = service.validateAthleteFeedbackArtifact(envelope.feedback);
if (feedback.expectedActivityRevision !== envelope.expectedActivityRevision || feedback.expectedFeedbackRevision !== envelope.expectedFeedbackRevision) throw new Error("Feedback envelope revisions do not match the artifact");
if (command === "inspect") {
  process.stdout.write(`Validated ${feedback.activityId}; headline: ${feedback.headline}\nSHA-256: ${hash}\n`);
  process.exit(0);
}
if (approvedHash !== hash) throw new Error("Approved file hash does not match; inspect and reapprove the final content");
if (!process.env.LOCALAPPDATA) throw new Error("LOCALAPPDATA is required for the paired-device credential");
const appData = path.join(process.env.LOCALAPPDATA, "RacePredictor");
const config = JSON.parse(await readFile(path.join(appData, "local-sync-config.json"), "utf8"));
const { WindowsDpapiCredentialStore } = await import(pathToFileURL(path.join(repo, "packages", "db", "src", "device-credential-store.js")).href);
const store = new WindowsDpapiCredentialStore({ credentialPath: path.join(appData, "device-credential.dpapi") });
const token = await store.load();
if (!token) throw new Error("This computer has no paired-device credential");
const saved = await request(new URL("/api/v1/sync/device/athlete-feedback/publish", config.cloudUrl), token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(feedback) });
contracts.activityAthleteFeedbackSchema.parse(saved?.data?.feedback);
process.stdout.write(`Published ${feedback.activityId}: ${feedback.headline}\n`);
