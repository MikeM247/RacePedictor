import type {
  ActivityDetail,
  ActivitySplitKmDTO,
  RouteSignatureDTO,
} from "../contracts/activity.ts";
import type {
  StravaActivityDetail,
  StravaLap,
  StravaStreamSet,
} from "../contracts/strava.ts";
import type {
  ContentDigestPort,
  StravaReconciliationCandidate,
} from "../ports/strava-ingestion.ts";

export interface StravaMappingInput {
  athleteId: string;
  activityId: string;
  canonicalCreatedAt: string;
  detail: StravaActivityDetail;
  laps: readonly StravaLap[];
  streams: StravaStreamSet;
  digest: ContentDigestPort;
}

export function mapStravaSport(sportType: string, trainer: boolean): ActivityDetail["sport"] {
  if (trainer || sportType === "VirtualRun") return "treadmill_run";
  if (sportType === "TrailRun") return "trail_run";
  if (sportType === "Run") return "run";
  return "other";
}

export function createStravaReconciliationCandidate(
  athleteId: string,
  detail: StravaActivityDetail,
  digest: ContentDigestPort,
): StravaReconciliationCandidate {
  const occurredAt = new Date(detail.start_date);
  const occurredBucket = new Date(Math.floor(occurredAt.getTime() / 60_000) * 60_000).toISOString();
  const sport = mapStravaSport(detail.sport_type, detail.trainer);
  const dedupeHash = digest.sha256([
    athleteId,
    sport,
    occurredBucket,
    String(Math.round(detail.elapsed_time)),
    String(Math.round(detail.distance)),
    String(Math.round(detail.total_elevation_gain)),
  ].join("|"));
  assertSha256(dedupeHash);

  return {
    providerActivityId: detail.id,
    occurredAt: detail.start_date,
    sport,
    elapsedTimeS: detail.elapsed_time,
    distanceM: detail.distance,
    elevationGainM: detail.total_elevation_gain,
    dedupeHash,
  };
}

export function mapStravaActivity(input: StravaMappingInput): ActivityDetail {
  const { athleteId, activityId, canonicalCreatedAt, detail, laps, streams, digest } = input;
  const candidate = createStravaReconciliationCandidate(athleteId, detail, digest);
  const occurredAt = new Date(detail.start_date);
  const endedAt = new Date(occurredAt.getTime() + detail.elapsed_time * 1_000).toISOString();
  const altitude = streams.altitude?.data ?? [];
  const heartrate = streams.heartrate?.data ?? [];
  const cadence = streams.cadence?.data ?? [];
  const routeSignature = mapRouteSignature({ athleteId, activityId, detail, streams, canonicalCreatedAt, digest });

  return {
    id: activityId,
    athleteId,
    title: detail.name,
    occurredAt: occurredAt.toISOString(),
    localOccurredAt: detail.start_date_local,
    sport: candidate.sport,
    distanceM: detail.distance,
    elapsedTimeS: detail.elapsed_time,
    avgPaceSecPerKm: pacePerKilometre(detail.moving_time || detail.elapsed_time, detail.distance),
    elevationGainM: detail.total_elevation_gain,
    hrAvailable: heartrate.length > 0 || detail.average_heartrate !== undefined,
    cadenceAvailable: cadence.length > 0 || detail.average_cadence !== undefined,
    sourceType: "strava",
    sourceActivityId: detail.id,
    endedAt,
    movingTimeS: detail.moving_time,
    elevationLossM: elevationLoss(altitude),
    avgHrBpm: detail.average_heartrate ?? mean(heartrate),
    maxHrBpm: detail.max_heartrate ?? maximum(heartrate),
    minHrBpm: minimum(heartrate),
    avgCadenceSpm: detail.average_cadence ?? mean(cadence),
    maxCadenceSpm: maximum(cadence),
    calories: detail.calories,
    avgPowerW: detail.average_watts,
    maxPowerW: detail.max_watts,
    lapCount: laps.length,
    minElevationM: detail.elev_low ?? minimum(altitude),
    maxElevationM: detail.elev_high ?? maximum(altitude),
    dedupeHash: candidate.dedupeHash,
    createdAt: canonicalCreatedAt,
    splits: mapSplits({ athleteId, activityId, createdAt: canonicalCreatedAt, detail }),
    routeSignature,
  };
}

function mapSplits(input: {
  athleteId: string;
  activityId: string;
  createdAt: string;
  detail: StravaActivityDetail;
}): ActivitySplitKmDTO[] {
  let offset = 0;
  return input.detail.splits_metric.map((split, index) => {
    const startOffsetS = offset;
    offset += split.elapsed_time;
    return {
      id: `${input.activityId}_split_${index + 1}`,
      activityId: input.activityId,
      athleteId: input.athleteId,
      splitIndex: index,
      startOffsetS,
      endOffsetS: offset,
      durationS: split.elapsed_time,
      distanceM: split.distance,
      paceSecPerKm: pacePerKilometre(split.moving_time || split.elapsed_time, split.distance),
      elevGainM: Math.max(0, split.elevation_difference),
      elevLossM: Math.max(0, -split.elevation_difference),
      createdAt: input.createdAt,
    };
  });
}

function mapRouteSignature(input: {
  athleteId: string;
  activityId: string;
  canonicalCreatedAt: string;
  detail: StravaActivityDetail;
  streams: StravaStreamSet;
  digest: ContentDigestPort;
}): RouteSignatureDTO | null {
  const coordinates = input.streams.latlng?.data ?? [];
  if (coordinates.length < 2) return null;

  const latitudes = coordinates.map(([latitude]) => latitude);
  const longitudes = coordinates.map(([, longitude]) => longitude);
  const sampledCoordinates = downsample(coordinates, 128)
    .map(([latitude, longitude]) => [round(latitude, 5), round(longitude, 5)]);
  const routeHash = input.digest.sha256(JSON.stringify(sampledCoordinates));
  assertSha256(routeHash);

  return {
    id: `${input.activityId}_route`,
    activityId: input.activityId,
    athleteId: input.athleteId,
    startLat: coordinates[0][0],
    startLon: coordinates[0][1],
    endLat: coordinates[coordinates.length - 1][0],
    endLon: coordinates[coordinates.length - 1][1],
    bboxMinLat: minimum(latitudes)!,
    bboxMinLon: minimum(longitudes)!,
    bboxMaxLat: maximum(latitudes)!,
    bboxMaxLon: maximum(longitudes)!,
    polyline: input.detail.map?.summary_polyline ?? null,
    elevProfile: downsample(input.streams.altitude?.data ?? [], 128),
    routeHash,
    createdAt: input.canonicalCreatedAt,
  };
}

function pacePerKilometre(durationSeconds: number, distanceMetres: number) {
  return distanceMetres > 0 ? durationSeconds / (distanceMetres / 1_000) : 0;
}

function elevationLoss(altitude: readonly number[]) {
  let loss = 0;
  for (let index = 1; index < altitude.length; index += 1) {
    loss += Math.max(0, altitude[index - 1] - altitude[index]);
  }
  return loss;
}

function mean(values: readonly number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function minimum(values: readonly number[]) {
  if (values.length === 0) return undefined;
  let result = values[0];
  for (let index = 1; index < values.length; index += 1) result = Math.min(result, values[index]);
  return result;
}

function maximum(values: readonly number[]) {
  if (values.length === 0) return undefined;
  let result = values[0];
  for (let index = 1; index < values.length; index += 1) result = Math.max(result, values[index]);
  return result;
}

function downsample<T>(values: readonly T[], maximumPoints: number): T[] {
  if (values.length <= maximumPoints) return [...values];
  const sampled: T[] = [];
  for (let index = 0; index < maximumPoints; index += 1) {
    sampled.push(values[Math.round(index * (values.length - 1) / (maximumPoints - 1))]);
  }
  return sampled;
}

function round(value: number, decimalPlaces: number) {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}

function assertSha256(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Digest port must return a lowercase SHA-256 digest");
}
