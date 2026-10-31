import { ApiHttpError } from "./api-response.ts";
export function milestoneHomeEnabled(
  source: Readonly<Record<string, string | undefined>> = process.env,
) {
  return source.RACEPREDICTOR_MILESTONE_HOME_ENABLED === "true";
}
export function assertMilestoneHomeEnabled() {
  if (!milestoneHomeEnabled())
    throw new ApiHttpError(
      404,
      "NOT_FOUND",
      "Milestone image management is unavailable",
    );
}
