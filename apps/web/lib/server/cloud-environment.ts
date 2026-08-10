import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("cloud-environment");

export type RuntimeEnvironment = "development" | "test" | "production";
export type CloudMode = "disabled" | "enabled";

export class CloudEnvironmentError extends Error {
  readonly code = "CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "CloudEnvironmentError";
  }
}

export interface CloudEnvironment {
  runtime: RuntimeEnvironment;
  cloudMode: CloudMode;
  features: {
    stravaIngestion: boolean;
    secondBrainSync: boolean;
  };
  /**
   * M8 replaces the fail-closed adapter with a real identity-provider adapter.
   * This value is intentionally configuration status, not proof of a session.
   */
  ownerAuthConfigured: boolean;
  release: string | null;
}

export interface PublicCloudEnvironmentStatus {
  runtime: RuntimeEnvironment;
  cloudMode: CloudMode;
  features: CloudEnvironment["features"];
  ownerAuthConfigured: boolean;
  release: string | null;
}

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function parseRuntime(value: string | undefined): RuntimeEnvironment {
  if (value === "production") return "production";
  if (value === "test") return "test";
  return "development";
}

function parseMode(value: string | undefined): CloudMode {
  if (!value || value === "disabled") return "disabled";
  if (value === "enabled") return "enabled";
  throw new CloudEnvironmentError("RACEPREDICTOR_CLOUD_MODE must be 'disabled' or 'enabled'");
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new CloudEnvironmentError(`${name} must be 'true' or 'false'`);
}

function parseRelease(value: string | undefined) {
  const release = value?.trim();
  if (!release) return null;
  return release.slice(0, 40);
}

/**
 * Reads only non-secret configuration. Credentials remain in provider/storage
 * adapters and are never returned by this module's public status projection.
 */
export function readCloudEnvironment(source: EnvironmentSource = process.env): CloudEnvironment {
  const cloudMode = parseMode(source.RACEPREDICTOR_CLOUD_MODE);
  const runtime = parseRuntime(source.NODE_ENV);

  return {
    runtime,
    cloudMode,
    features: {
      stravaIngestion: cloudMode === "enabled"
        && parseBoolean("RACEPREDICTOR_STRAVA_INGESTION_ENABLED", source.RACEPREDICTOR_STRAVA_INGESTION_ENABLED, false),
      secondBrainSync: cloudMode === "enabled"
        && parseBoolean("RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED", source.RACEPREDICTOR_SECOND_BRAIN_SYNC_ENABLED, false),
    },
    // This is a declaration for the future composition root only. It does not
    // enable an actor resolver and cannot weaken the fail-closed default.
    ownerAuthConfigured: parseBoolean(
      "RACEPREDICTOR_OWNER_AUTH_CONFIGURED",
      source.RACEPREDICTOR_OWNER_AUTH_CONFIGURED,
      false,
    ),
    release: parseRelease(source.VERCEL_GIT_COMMIT_SHA ?? source.RACEPREDICTOR_RELEASE),
  };
}

export function publicCloudEnvironmentStatus(environment: CloudEnvironment): PublicCloudEnvironmentStatus {
  return {
    runtime: environment.runtime,
    cloudMode: environment.cloudMode,
    features: environment.features,
    ownerAuthConfigured: environment.ownerAuthConfigured,
    release: environment.release,
  };
}
