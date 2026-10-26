import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLocalCoachingService, calculatePlanProposalContentHash } from "../lib/local-coaching-service.ts";
import { e2eDatabasePath, e2eExchangePath, e2eVaultPath } from "./fixture-paths.ts";

/** Synthetic approved sources used only by the isolated milestone test database. */
export async function seedApprovedMilestonePlan() {
  await mkdir(e2eExchangePath, { recursive: true }); await mkdir(e2eVaultPath, { recursive: true });
  const now = new Date("2026-10-21T07:00:00Z");
  const service = createLocalCoachingService({ databasePath: e2eDatabasePath, exchangePath: e2eExchangePath, vaultPath: e2eVaultPath, athleteId: "e2e_athlete", clock: () => now });
  try {
    if (service.getActivePlan()) return;
    service.saveProfile({ displayName: "Synthetic athlete", timezone: "Africa/Johannesburg", units: "metric", why: "A purposeful journey", experience: "intermediate", constraints: [] });
    const routine = service.saveRoutine({ timezone: "Africa/Johannesburg", desiredSessionsPerWeek: 1, preferredLongRunDay: "sunday",
      days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => ({ day, available: true, startTime: "06:00", endTime: "08:00", maxDurationMinutes: 120, allowedKinds: ["run"] })) } as Parameters<typeof service.saveRoutine>[0]);
    const goal = service.settleGoal(service.createGoal({ title: "My marathon goal", why: "A purposeful journey", target: { kind: "performance", targetDate: "2027-02-28", distanceMeters: 42195, targetTimeSeconds: 16200 } }).id);
    const envelope = await service.publishCoachingContext();
    const proposal = {
      id: "milestone-plan", athleteId: "e2e_athlete", goalId: goal.id, goalRevision: goal.revision, routineRevision: routine.revision,
      proposedGoal: { id: goal.id, athleteId: goal.athleteId, revision: goal.revision, title: goal.title, why: goal.why, target: goal.target, status: "draft", createdAt: goal.createdAt, updatedAt: goal.updatedAt },
      goalRationale: "The synthetic goal defines this fixture.", version: 1, revision: 1, startsOn: "2026-09-01", endsOn: "2027-02-28", timezone: "Africa/Johannesburg",
      weeklyStructure: [{ weekStartsOn: "2026-10-26", focus: "Synthetic training", sessionIds: ["fixture-easy"] }],
      workouts: [{ id: "fixture-easy", kind: "run", scheduledDate: "2026-10-26", startTime: "06:00", title: "Easy run", purpose: "Fixture", prescription: "Easy effort", cautions: [], durationMinutes: 30, distanceMeters: 5000, intensityRpe: 3 }],
      milestones: [{ id: "spring", title: "Spring 10 km", targetDate: "2026-10-04", distanceMeters: 10000, targetTimeSeconds: 3600 }, { id: "summer", title: "Summer half marathon", targetDate: "2026-11-22", distanceMeters: 21100, targetTimeSeconds: 7500 }],
      contextArtifactId: envelope.artifact.id, createdAt: now.toISOString(), status: "proposed", rationale: "Synthetic test plan", summary: "Fixture", assumptions: [], cautions: [], sourceHistoryFingerprint: envelope.fingerprint, contentHash: "0".repeat(64),
    };
    proposal.contentHash = calculatePlanProposalContentHash(proposal);
    const file = path.join(e2eExchangePath, "milestone-fixture.v2.json");
    await writeFile(file, JSON.stringify({ schema: "coaching-plan-proposal.v2", proposal }));
    const imported = await service.importPlanProposal(file);
    service.activatePlan({ planId: imported.id, expectedRevision: imported.revision, approvedByUser: true });
  } finally { service.close(); }
}
