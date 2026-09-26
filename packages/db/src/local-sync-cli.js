import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { WindowsDpapiCredentialStore } from "./device-credential-store.js";
import { LocalCloudSyncAgent } from "./local-sync-agent.js";
import { RacePredictorSyncClient } from "./local-sync-client.js";
import { LocalSyncProjectionRepository } from "./local-sync-projection.js";
import { readSelectedSecondBrainSource } from "./obsidian-selected-context.js";
import { runCloudActivityReviewBatch } from "./local-activity-review-cloud-worker.js";
import { buildVerifiedLocalPlanGoalContextFromDatabase } from "./local-plan-goal-context.js";

const command = process.argv[2];
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error("LOCALAPPDATA is required for protected device credentials");
const databasePath = process.env.RACEPREDICTOR_DATABASE_PATH;
const vaultPath = process.env.RACEPREDICTOR_OBSIDIAN_VAULT_PATH;
const baseUrl = process.env.RACEPREDICTOR_CLOUD_URL;
const athleteId = process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001";
const credentialStore = new WindowsDpapiCredentialStore({
  credentialPath: path.join(localAppData, "RacePredictor", "device-credential.dpapi"),
});

if (command === "enroll") {
  if (process.stdin.isTTY) throw new Error("Pipe the one-time device token to stdin; it is never accepted as an argument");
  let token = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) token += chunk;
  await credentialStore.save(token.trim());
  process.stdout.write("Device credential stored in the Windows user credential boundary.\n");
} else {
  const requiresVault = command === "sync" || command === "sync-and-publish" || command === "publish-context";
  if (!databasePath || !baseUrl || (requiresVault && !vaultPath)) {
    throw new Error(requiresVault
      ? "RACEPREDICTOR_DATABASE_PATH, RACEPREDICTOR_OBSIDIAN_VAULT_PATH, and RACEPREDICTOR_CLOUD_URL are required"
      : "RACEPREDICTOR_DATABASE_PATH and RACEPREDICTOR_CLOUD_URL are required");
  }
  const projection = new LocalSyncProjectionRepository({ databasePath });
  const agent = new LocalCloudSyncAgent({
    athleteId,
    credentialStore,
    client: new RacePredictorSyncClient({ baseUrl }),
    projection,
    notePath: path.join(vaultPath ?? process.cwd(), "Dashboards", "RacePredictor Cloud Sync.md"),
  });
  if (command === "sync") {
    const result = await agent.sync();
    process.stdout.write(`Local sync complete at cursor ${result.cursor ?? "empty"}; ${result.applied} change(s) applied.\n`);
  } else if (command === "sync-and-publish") {
    const result = await agent.syncAndPublish(() => readSelectedSecondBrainSource({ vaultPath }));
    if (result.sync.status === "fulfilled") {
      process.stdout.write(`Local sync complete at cursor ${result.sync.value.cursor ?? "empty"}; ${result.sync.value.applied} change(s) applied.\n`);
    }
    if (result.publication.status === "fulfilled") {
      const snapshot = result.publication.value.snapshot;
      process.stdout.write(snapshot
        ? `Selected Second Brain revision ${snapshot.revision} published.\n`
        : "Selected Second Brain context is unchanged.\n");
    }
    if (result.sync.status === "fulfilled" && result.publication.status === "fulfilled" && process.env.OPENAI_API_KEY) {
      const reviewResult = await runCloudActivityReviewBatch({
        databasePath,
        athleteId,
        token: await credentialStore.load(),
        client: new RacePredictorSyncClient({ baseUrl }),
      });
      process.stdout.write(`Activity coach review job: ${JSON.stringify(reviewResult)}\n`);
    }
    if (result.sync.status === "rejected" || result.source.status === "rejected" || result.publication.status === "rejected") {
      throw new Error("Local sync-and-publish did not complete; inspect the local sync status for the failed direction");
    }
  } else if (command === "publish-context") {
    const inputPath = process.argv[3];
    if (!inputPath) throw new Error("publish-context requires one explicit structured JSON input path");
    const input = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
    const result = await agent.publishSelectedSecondBrain(input);
    process.stdout.write(`Selected Second Brain revision ${result.snapshot.revision} published.\n`);
  } else if (command === "publish-plan") {
    const inputPath = process.argv[3];
    if (!inputPath) throw new Error("publish-plan requires one explicit approved plan JSON path");
    const plan = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
    const verified = buildVerifiedLocalPlanGoalContextFromDatabase({ databasePath, athleteId, planId: plan?.id, expectedPlan: plan });
    const result = await agent.publishApprovedPlan(plan, verified.state === "verified" ? verified.value : null);
    process.stdout.write(`Approved plan ${result.data.plan.id} published.\n`);
    process.stdout.write(result.goalContext.state === "ready"
      ? `Approved goal context ${result.goalContext.contextHash} published.\n`
      : result.goalContext.state === "pending"
        ? `Goal context remains pending (${result.goalContext.reasonCode}); retry with publish-plan-goal-context ${plan.id}.\n`
        : `Goal context remains unavailable because the local approved source could not be verified (${verified.reasonCode ?? "source_unverifiable"}).\n`);
  } else if (command === "publish-plan-goal-context") {
    const planId = process.argv[3];
    if (!planId) throw new Error("publish-plan-goal-context requires one approved plan ID");
    const verified = buildVerifiedLocalPlanGoalContextFromDatabase({ databasePath, athleteId, planId });
    if (verified.state !== "verified") {
      process.stdout.write(`Goal context remains unavailable (${verified.reasonCode}); no projection was published.\n`);
    } else {
      const result = await agent.publishPlanGoalContext(verified.value);
      process.stdout.write(`Approved goal context ${result.data.contextHash} published for plan ${planId}.\n`);
    }
  } else {
    throw new Error("Expected enroll, sync, sync-and-publish, publish-context, publish-plan, or publish-plan-goal-context command");
  }
}
