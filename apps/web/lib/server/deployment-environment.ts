export type DeploymentEnvironment = "Production" | "Staging" | "Preview" | "Development" | "Unknown";

/** NODE_ENV describes the build mode, not the deployment's destination. */
export function readDeploymentEnvironment(
  source: Record<string, string | undefined> = process.env,
): DeploymentEnvironment {
  const target = source.VERCEL_TARGET_ENV || source.VERCEL_ENV;
  if (target === "production") return "Production";
  if (target === "staging") return "Staging";
  if (target === "preview") {
    return source.VERCEL_GIT_COMMIT_REF === "work" ? "Staging" : "Preview";
  }
  if (target === "development" || (!target && source.NODE_ENV === "development")) return "Development";
  return "Unknown";
}
