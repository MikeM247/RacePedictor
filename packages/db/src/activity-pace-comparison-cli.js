import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WindowsDpapiCredentialStore } from "./device-credential-store.js";
import { RacePredictorSyncClient } from "./local-sync-client.js";
import { cachePaceComparison } from "./local-activity-pace-comparison.js";
import { paceContextSchema, paceDraftSchema, paceArtifactSchema } from "../../core/src/contracts/activity-pace-comparison.ts";
import { paceHash, splitFingerprint, validatePaceArtifact } from "../../core/src/services/activity-pace-comparison.ts";

const [command, ...args] = process.argv.slice(2);
const option = name => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : undefined; };
const required = name => { const value = option(name); if (!value || value.startsWith("--")) throw new Error(`--${name} is required`); return value; };
const read = async name => JSON.parse(await readFile(required(name), "utf8"));
const save = (filename, value) => writeFile(filename, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
async function connection() {
  const credentialPath = path.join(process.env.LOCALAPPDATA || required("credential-root"), "RacePredictor", "device-credential.dpapi");
  const token = await new WindowsDpapiCredentialStore({ credentialPath }).load();
  return { token, client: new RacePredictorSyncClient({ baseUrl: process.env.RACEPREDICTOR_CLOUD_URL || required("cloud-url") }) };
}
try {
  if (command === "prepare") {
    const { client, token } = await connection();
    const context = paceContextSchema.parse((await client.getPaceComparisonContext(token, { activityId: required("activity"), planId: required("plan"), sessionId: required("session"), sessionRevision: option("session-revision") })).data);
    const draft = paceDraftSchema.parse({ schema: "activity-pace-comparison.v1", athleteId: context.activity.athleteId, activityId: context.activity.id, splitFingerprint: splitFingerprint(context.activity), source: context.source, blocks: [], expectedActivityRevision: context.activityRevision, expectedComparisonRevision: context.comparisonRevision });
    await save(required("out") + ".context.json", context);
    await save(required("out"), draft);
    process.stdout.write("Draft and source context saved. Fill the pace blocks from the prescription, then review with the owner; nothing was published.\n");
  } else if (command === "validate" || command === "approve") {
    const draft = paceDraftSchema.parse(await read("draft")), context = paceContextSchema.parse(await read("context"));
    if (draft.expectedActivityRevision !== context.activityRevision || draft.expectedComparisonRevision !== context.comparisonRevision) throw new Error("Draft revisions differ from the reviewed context");
    const content = { ...draft, artifactId: `pace_${randomUUID()}`, approvedAt: new Date().toISOString() };
    const artifact = { ...content, artifactHash: paceHash(content) };
    validatePaceArtifact(artifact, context.activity, context.source);
    if (command === "approve") {
      if (!args.includes("--owner-approved")) throw new Error("Approve requires --owner-approved after the owner has reviewed these exact blocks");
      await save(required("out"), artifact);
      process.stdout.write("Approved artifact saved. No cloud write performed.\n");
    } else process.stdout.write("Draft is valid against the supplied context. No approval or publication performed.\n");
  } else if (command === "publish") {
    const artifact = paceArtifactSchema.parse(await read("artifact"));
    const { artifactHash, ...content } = artifact;
    if (paceHash(content) !== artifactHash) throw new Error("Approved artifact changed; review again");
    const { client, token } = await connection();
    const result = await client.publishPaceComparison(token, artifact);
    // Keep the cloud receipt separately: if caching fails, retrying publish is idempotent.
    if (process.env.RACEPREDICTOR_DATABASE_PATH) cachePaceComparison({ databasePath: process.env.RACEPREDICTOR_DATABASE_PATH, comparison: result.data.comparison });
    process.stdout.write(`Published comparison revision ${result.data.comparison.revision}.\n`);
  } else throw new Error("Expected prepare, validate, approve, or publish; see docs/plans/ACTIVITY_SPLIT_COMPARISON.md");
} catch (error) {
  process.stderr.write(`Pace comparison: ${error instanceof Error ? error.message : "operation failed"}\n`);
  process.exitCode = 1;
}
