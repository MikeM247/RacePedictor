import { raceHistoryRecordSchema, raceHistoryResponseSchema, type RaceHistoryRecord } from "../../../packages/core/src/contracts/race-history.ts";

export class MilestoneWriteError extends Error {
  constructor(message: string, readonly conflict = false) { super(message); }
}
export async function saveMilestoneRecord(record: RaceHistoryRecord, revision: number) {
  const response = await fetch("/api/v1/coaching/race-history", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ record, expectedRevision: revision }) });
  if (response.status === 409) throw new MilestoneWriteError("This milestone changed in another session. Reload the saved milestone and review it before saving.", true);
  if (!response.ok) throw new MilestoneWriteError("The milestone could not be saved. Your inputs are kept; retry when the service is available.");
  return raceHistoryRecordSchema.parse((await response.json()).data);
}
export async function removeMilestoneRecord(record: RaceHistoryRecord) {
  const response = await fetch(`/api/v1/coaching/race-history?id=${encodeURIComponent(record.id)}&revision=${record.revision ?? 1}`, { method: "DELETE" });
  if (response.status === 409) throw new MilestoneWriteError("This milestone changed in another session. Reload and review it before deciding again.", true);
  if (!response.ok) throw new MilestoneWriteError("The milestone could not be removed. Retry, or keep the milestone.");
}
export async function loadMilestoneRecords() {
  const response = await fetch("/api/v1/coaching/race-history", { cache: "no-store" });
  if (!response.ok) throw new Error("Saved history could not be loaded. Retry before making another change.");
  return raceHistoryResponseSchema.parse(await response.json()).data.items;
}
