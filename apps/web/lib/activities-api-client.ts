import {
  activitiesListResponseSchema,
  activityDetailResponseSchema,
} from "../../../packages/core/src/contracts/activity.ts";
import {
  activityCoachReviewResponseDataSchema,
  activityCoachReviewSummaryListResponseDataSchema,
  activityReviewRequestResponseDataSchema,
} from "../../../packages/core/src/contracts/activity-review.ts";

type ResponseSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false };
};

/** A safe, task-level classification for UI recovery; never expose raw response bodies. */
export class ActivityApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ActivityApiError";
    this.status = status;
    this.code = code;
  }
}

export function readActivitiesListResponse(response: Response) {
  return readApiData(response, activitiesListResponseSchema);
}

export function readActivityDetailResponse(response: Response) {
  return readApiData(response, activityDetailResponseSchema);
}

export function readActivityCoachReviewResponse(response: Response) {
  return readApiData(response, activityCoachReviewResponseDataSchema);
}

export async function readActivityCoachReviewForActivityResponse(response: Response, activityId: string) {
  const data = await readActivityCoachReviewResponse(response);
  if (data.activityId !== activityId || (data.review && data.review.activityId !== activityId)) {
    throw new ActivityApiError("The server returned feedback for a different activity.", response.status, "MALFORMED_RESPONSE");
  }
  return data;
}

export function readActivityCoachReviewSummaryListResponse(response: Response) {
  return readApiData(response, activityCoachReviewSummaryListResponseDataSchema);
}

export function readActivityReviewRequestResponse(response: Response) {
  return readApiData(response, activityReviewRequestResponseDataSchema);
}

async function readApiData<T>(response: Response, schema: ResponseSchema<T>): Promise<T> {
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const error = asRecord(asRecord(body).error);
    const message = error.message;
    const code = error.code;
    throw new ActivityApiError(
      typeof message === "string" ? message : "The request could not be completed.",
      response.status,
      typeof code === "string" ? code : undefined,
    );
  }

  const record = asRecord(body);
  const payload = Object.prototype.hasOwnProperty.call(record, "data")
    ? record.data
    : body;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ActivityApiError("The server returned an invalid activity response.", response.status, "MALFORMED_RESPONSE");
  }
  return parsed.data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
