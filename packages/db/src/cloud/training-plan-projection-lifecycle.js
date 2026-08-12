import { trainingPlanSchema } from "../../../core/src/contracts/coaching.ts";

export function parsePlanProjection(row, athleteId) {
  const parsed = trainingPlanSchema.safeParse(row?.plan);
  if (!parsed.success) throw new Error("Approved plan projection is invalid");
  const plan = parsed.data;
  if (row.athleteId !== athleteId
    || plan.athleteId !== athleteId
    || plan.id !== row.planId
    || plan.version !== row.planVersion
    || plan.status !== row.planStatus
    || plan.approval.contentHash !== row.contentHash
    || row.active !== (plan.status === "active")) {
    throw new Error("Approved plan projection is inconsistent");
  }
  return plan;
}

export function retireApprovedPlan(plan, occurredAt) {
  const { activatedAt: _activatedAt, activatedBy: _activatedBy, retiredAt: _retiredAt, ...body } = plan;
  return trainingPlanSchema.parse({
    ...body,
    revision: plan.revision + 1,
    status: "retired",
    retiredAt: occurredAt.toISOString(),
  });
}

export function activateApprovedPlan(plan, occurredAt) {
  const { activatedAt: _activatedAt, activatedBy: _activatedBy, retiredAt: _retiredAt, ...body } = plan;
  return trainingPlanSchema.parse({
    ...body,
    revision: plan.revision + 1,
    status: "active",
    activatedAt: occurredAt.toISOString(),
    activatedBy: "user",
  });
}

export async function appendPlanSyncChanges(transaction, athleteId, plans, occurredAt, includeWorkoutsForPlanId) {
  let cursor = await nextCursor(transaction, athleteId);
  for (const plan of plans) {
    await transaction.syncChange.create({ data: {
      athleteId,
      cursor,
      entityType: "plan",
      entityId: plan.id,
      operation: "upsert",
      entityVersion: plan.revision,
      selectedFields: plan,
      occurredAt,
    } });
    if (plan.id === includeWorkoutsForPlanId) {
      for (const workout of plan.workouts) {
        cursor += 1n;
        await transaction.syncChange.create({ data: {
          athleteId,
          cursor,
          entityType: "calendar_session",
          entityId: workout.id,
          operation: "upsert",
          entityVersion: plan.revision,
          selectedFields: workout,
          occurredAt,
        } });
      }
    }
    cursor += 1n;
  }
}

async function nextCursor(transaction, athleteId) {
  const latest = await transaction.syncChange.aggregate({ where: { athleteId }, _max: { cursor: true } });
  return (latest._max.cursor ?? 0n) + 1n;
}
