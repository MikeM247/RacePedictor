import {
  activitiesListResponseSchema,
  activityDetailResponseSchema,
} from "../../../packages/core/src/contracts/activity.ts";

type ResponseSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false };
};

export function readActivitiesListResponse(response: Response) {
  return readApiData(response, activitiesListResponseSchema);
}

export function readActivityDetailResponse(response: Response) {
  return readApiData(response, activityDetailResponseSchema);
}

async function readApiData<T>(response: Response, schema: ResponseSchema<T>): Promise<T> {
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = asRecord(asRecord(body).error).message;
    throw new Error(typeof message === "string" ? message : "The request could not be completed.");
  }

  const parsed = schema.safeParse(asRecord(body).data);
  if (!parsed.success) {
    throw new Error("The server returned an invalid activity response.");
  }
  return parsed.data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
