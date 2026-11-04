import { ApiHttpError } from "./api-response.ts";
export function milestoneHomeEnabled(
  source: Readonly<Record<string, string | undefined>> = process.env,
) {
  return source.RACEPREDICTOR_MILESTONE_HOME_ENABLED === "true";
}
export function milestoneRecognitionEnabled(
  source: Readonly<Record<string, string | undefined>> = process.env,
) {
  return milestoneHomeEnabled(source) && source.RACEPREDICTOR_MILESTONE_RECOGNITION_ENABLED !== "false";
}
export function assertMilestoneHomeEnabled() {
  if (!milestoneHomeEnabled())
    throw new ApiHttpError(
      404,
      "NOT_FOUND",
      "Milestone image management is unavailable",
    );
}
