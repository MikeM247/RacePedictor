import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { WindowsDpapiCredentialStore } from "./device-credential-store.js";
import { LocalCloudSyncAgent } from "./local-sync-agent.js";
import { RacePredictorSyncClient } from "./local-sync-client.js";
import { LocalSyncProjectionRepository } from "./local-sync-projection.js";

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
  if (!databasePath || !vaultPath || !baseUrl) {
    throw new Error("RACEPREDICTOR_DATABASE_PATH, RACEPREDICTOR_OBSIDIAN_VAULT_PATH, and RACEPREDICTOR_CLOUD_URL are required");
  }
  const projection = new LocalSyncProjectionRepository({ databasePath });
  const agent = new LocalCloudSyncAgent({
    athleteId,
    credentialStore,
    client: new RacePredictorSyncClient({ baseUrl }),
    projection,
    notePath: path.join(vaultPath, "Dashboards", "RacePredictor Cloud Sync.md"),
  });
  if (command === "sync") {
    const result = await agent.sync();
    process.stdout.write(`Local sync complete at cursor ${result.cursor ?? "empty"}; ${result.applied} change(s) applied.\n`);
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
    const result = await agent.publishApprovedPlan(plan);
    process.stdout.write(`Approved plan ${result.data.plan.id} published.\n`);
  } else {
    throw new Error("Expected enroll, sync, publish-context, or publish-plan command");
  }
}
