import { milestoneChangeRequestSchema, type MilestoneChangeRequest } from "../../../packages/core/src/services/milestone-management.ts";

const key = (athleteId: string) => `racepredictor:milestone-change:v1:${athleteId}`;

export function milestoneChangeExists(storage: Pick<Storage, "getItem">, athleteId: string): boolean {
  return storage.getItem(key(athleteId)) !== null;
}

export function readMilestoneChange(storage: Pick<Storage, "getItem">, athleteId: string): MilestoneChangeRequest | null {
  const value = storage.getItem(key(athleteId));
  if (!value) return null;
  const request = milestoneChangeRequestSchema.parse(JSON.parse(value));
  if (request.athleteId !== athleteId) throw new Error("This prepared change belongs to another athlete.");
  return request;
}

export function storeMilestoneChange(storage: Pick<Storage, "setItem">, request: MilestoneChangeRequest) {
  const validated = milestoneChangeRequestSchema.parse(request);
  storage.setItem(key(validated.athleteId), JSON.stringify(validated));
}

export function discardMilestoneChange(storage: Pick<Storage, "removeItem">, athleteId: string) {
  storage.removeItem(key(athleteId));
}
