import { z } from "zod";

const providerIdSchema = z.string().regex(/^\d+$/).max(32);
const nonNegativeNumber = z.number().finite().nonnegative();
const nonNegativeInteger = z.number().int().nonnegative();
const dateTimeSchema = z.string().datetime({ offset: true });

const stravaAthleteReferenceSchema = z.object({ id: providerIdSchema }).strict();
const stravaMapSchema = z.object({ summary_polyline: z.string().max(100_000).nullable() }).strict();

export const stravaSplitMetricSchema = z.object({
  split: z.number().int().positive(),
  distance: nonNegativeNumber,
  elapsed_time: nonNegativeInteger,
  moving_time: nonNegativeInteger,
  elevation_difference: z.number().finite(),
  average_speed: nonNegativeNumber,
}).strict();

export const stravaActivityDetailSchema = z.object({
  id: providerIdSchema,
  athlete: stravaAthleteReferenceSchema,
  name: z.string().trim().min(1).max(200),
  distance: nonNegativeNumber,
  moving_time: nonNegativeInteger,
  elapsed_time: nonNegativeInteger,
  total_elevation_gain: nonNegativeNumber,
  sport_type: z.string().trim().min(1).max(80),
  start_date: dateTimeSchema,
  start_date_local: dateTimeSchema,
  timezone: z.string().trim().min(1).max(100).optional(),
  trainer: z.boolean(),
  manual: z.boolean(),
  private: z.boolean(),
  elev_high: z.number().finite().optional(),
  elev_low: z.number().finite().optional(),
  average_heartrate: nonNegativeNumber.optional(),
  max_heartrate: nonNegativeNumber.optional(),
  average_cadence: nonNegativeNumber.optional(),
  calories: nonNegativeNumber.optional(),
  average_watts: nonNegativeNumber.optional(),
  max_watts: nonNegativeNumber.optional(),
  map: stravaMapSchema.nullable().optional(),
  splits_metric: z.array(stravaSplitMetricSchema).max(2_000),
}).strict();

export const stravaLapSchema = z.object({
  id: providerIdSchema,
  lap_index: z.number().int().positive(),
  elapsed_time: nonNegativeInteger,
  moving_time: nonNegativeInteger,
  distance: nonNegativeNumber,
  start_index: nonNegativeInteger,
  end_index: nonNegativeInteger,
  total_elevation_gain: nonNegativeNumber,
  average_speed: nonNegativeNumber,
  average_cadence: nonNegativeNumber.optional(),
}).strict().refine((lap) => lap.end_index >= lap.start_index, {
  path: ["end_index"],
  message: "Lap end index must not precede its start index",
});

export const stravaLapsSchema = z.array(stravaLapSchema).max(2_000);

const streamMetadata = {
  original_size: nonNegativeInteger,
  resolution: z.enum(["low", "medium", "high"]),
  series_type: z.enum(["distance", "time"]),
};

function streamSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    ...streamMetadata,
    data: z.array(data).max(100_000),
  }).strict().superRefine((stream, ctx) => {
    if (stream.original_size < stream.data.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["original_size"],
        message: "Stream original size cannot be smaller than returned data",
      });
    }
  });
}

const latLngSchema = z.tuple([
  z.number().finite().min(-90).max(90),
  z.number().finite().min(-180).max(180),
]);

export const STRAVA_CANONICAL_STREAM_KEYS = [
  "time",
  "distance",
  "latlng",
  "altitude",
  "heartrate",
  "cadence",
] as const;

export const stravaStreamSetSchema = z.object({
  time: streamSchema(nonNegativeInteger).optional(),
  distance: streamSchema(nonNegativeNumber).optional(),
  latlng: streamSchema(latLngSchema).optional(),
  altitude: streamSchema(z.number().finite()).optional(),
  heartrate: streamSchema(nonNegativeInteger).optional(),
  cadence: streamSchema(nonNegativeNumber).optional(),
}).strict();

export const stravaActivitySummarySchema = z.object({
  id: providerIdSchema,
  athlete: stravaAthleteReferenceSchema,
  distance: nonNegativeNumber,
  moving_time: nonNegativeInteger,
  elapsed_time: nonNegativeInteger,
  total_elevation_gain: nonNegativeNumber,
  sport_type: z.string().trim().min(1).max(80),
  start_date: dateTimeSchema,
  private: z.boolean(),
}).strict();

export const stravaActivitySummaryPageSchema = z.array(stravaActivitySummarySchema).max(100);

export const stravaIngestionEventSchema = z.object({
  providerActivityId: providerIdSchema,
  aspect: z.enum(["create", "update", "delete"]),
  source: z.enum(["webhook", "backfill", "reconciliation"]),
  occurredAt: dateTimeSchema,
  attempt: z.number().int().min(1).max(20).default(1),
}).strict();

const boundedWindowFields = {
  after: dateTimeSchema,
  before: dateTimeSchema,
  pageSize: z.number().int().min(1).max(50).default(30),
};

export const stravaBackfillRequestSchema = z.object({
  ...boundedWindowFields,
  maxPages: z.number().int().min(1).max(10).default(5),
  maxActivities: z.number().int().min(1).max(300).default(150),
}).strict().superRefine((request, ctx) => validateWindow(request, 366, ctx));

export const stravaReconciliationRequestSchema = z.object({
  ...boundedWindowFields,
  maxPages: z.number().int().min(1).max(4).default(2),
  maxActivities: z.number().int().min(1).max(200).default(60),
}).strict().superRefine((request, ctx) => validateWindow(request, 31, ctx));

/**
 * Internal durable work state for a bounded Strava batch. This is never an
 * HTTP request or response. It permits a job to yield at a provider-window
 * boundary without re-fetching already listed or committed activities.
 */
export const stravaBatchCheckpointSchema = z.object({
  version: z.literal(1),
  nextPage: z.number().int().min(1).max(11),
  pendingActivityIds: z.array(providerIdSchema).max(50),
  seenActivityIds: z.array(providerIdSchema).max(300),
  completedActivityIds: z.array(providerIdSchema).max(300),
  pagesFetched: z.number().int().min(0).max(10),
  activitiesDiscovered: z.number().int().min(0).max(300),
  exhausted: z.boolean(),
}).strict();

export type StravaBatchCheckpoint = z.infer<typeof stravaBatchCheckpointSchema>;

/**
 * Provider adapters retain the untouched response bytes for raw storage, then
 * project the parsed JSON through these allow-lists before returning core DTOs.
 */
export function projectStravaActivityDetail(providerPayload: unknown): StravaActivityDetail {
  const source = asRecord(providerPayload);
  const athlete = asRecord(source.athlete);
  const map = source.map === null || source.map === undefined
    ? source.map
    : { summary_polyline: asRecord(source.map).summary_polyline ?? null };
  const splits = Array.isArray(source.splits_metric)
    ? source.splits_metric.map((value) => {
        const split = asRecord(value);
        return pick(split, [
          "split",
          "distance",
          "elapsed_time",
          "moving_time",
          "elevation_difference",
          "average_speed",
        ] as const);
      })
    : source.splits_metric;
  return stravaActivityDetailSchema.parse(compact({
    ...pick(source, [
      "id",
      "name",
      "distance",
      "moving_time",
      "elapsed_time",
      "total_elevation_gain",
      "sport_type",
      "start_date",
      "start_date_local",
      "timezone",
      "trainer",
      "manual",
      "private",
      "elev_high",
      "elev_low",
      "average_heartrate",
      "max_heartrate",
      "average_cadence",
      "calories",
      "average_watts",
      "max_watts",
    ] as const),
    id: normalizeProviderId(source.id),
    athlete: { id: normalizeProviderId(athlete.id) },
    map,
    splits_metric: splits,
  }));
}

export function projectStravaLaps(providerPayload: unknown): StravaLap[] {
  if (!Array.isArray(providerPayload)) return stravaLapsSchema.parse(providerPayload);
  return stravaLapsSchema.parse(providerPayload.map((value) => {
    const source = asRecord(value);
    return {
      ...pick(source, [
        "lap_index",
        "elapsed_time",
        "moving_time",
        "distance",
        "start_index",
        "end_index",
        "total_elevation_gain",
        "average_speed",
        "average_cadence",
      ] as const),
      id: normalizeProviderId(source.id),
    };
  }));
}

export function projectStravaStreamSet(providerPayload: unknown): StravaStreamSet {
  const source = asRecord(providerPayload);
  const projected: Record<string, unknown> = {};
  for (const key of STRAVA_CANONICAL_STREAM_KEYS) {
    if (source[key] === undefined) continue;
    projected[key] = pick(asRecord(source[key]), ["original_size", "resolution", "series_type", "data"] as const);
  }
  return stravaStreamSetSchema.parse(projected);
}

export function projectStravaActivitySummaryPage(providerPayload: unknown): StravaActivitySummary[] {
  if (!Array.isArray(providerPayload)) return stravaActivitySummaryPageSchema.parse(providerPayload);
  return stravaActivitySummaryPageSchema.parse(providerPayload.map((value) => {
    const source = asRecord(value);
    const athlete = asRecord(source.athlete);
    return {
      ...pick(source, [
        "id",
        "distance",
        "moving_time",
        "elapsed_time",
        "total_elevation_gain",
        "sport_type",
        "start_date",
        "private",
      ] as const),
      id: normalizeProviderId(source.id),
      athlete: { id: normalizeProviderId(athlete.id) },
    };
  }));
}

function validateWindow(
  request: { after: string; before: string },
  maxDays: number,
  ctx: z.RefinementCtx,
) {
  const after = Date.parse(request.after);
  const before = Date.parse(request.before);
  if (before <= after) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["before"], message: "Before must be after after" });
    return;
  }
  if (before - after > maxDays * 24 * 60 * 60 * 1_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["before"],
      message: `Window must not exceed ${maxDays} days`,
    });
  }
}

export type StravaActivityDetail = z.infer<typeof stravaActivityDetailSchema>;
export type StravaLap = z.infer<typeof stravaLapSchema>;
export type StravaStreamSet = z.infer<typeof stravaStreamSetSchema>;
export type StravaActivitySummary = z.infer<typeof stravaActivitySummarySchema>;
export type StravaIngestionEvent = z.infer<typeof stravaIngestionEventSchema>;
export type StravaBackfillRequest = z.input<typeof stravaBackfillRequestSchema>;
export type StravaReconciliationRequest = z.input<typeof stravaReconciliationRequestSchema>;
export type StravaBackfillWindow = z.output<typeof stravaBackfillRequestSchema>;
export type StravaReconciliationWindow = z.output<typeof stravaReconciliationRequestSchema>;
export type StravaCanonicalStreamKey = typeof STRAVA_CANONICAL_STREAM_KEYS[number];
export type StravaRawObjectKind = "detail" | "laps" | "streams";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pick<const TKeys extends readonly string[]>(source: Record<string, unknown>, keys: TKeys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

function compact(source: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

function normalizeProviderId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return value;
}
