const pooledStagingHost = "ep-tiny-band-b1j73wgx-pooler.c-5.eu-central-1.aws.neon.tech";
const directStagingHost = "ep-tiny-band-b1j73wgx.c-5.eu-central-1.aws.neon.tech";

function validate(value, expectedHost, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`ORBIT preview ${label} database URL is invalid`); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || parsed.hostname !== expectedHost
    || !parsed.username || !parsed.password
    || !["require", "verify-full"].includes(parsed.searchParams.get("sslmode"))) {
    throw new Error(`ORBIT preview ${label} database URL does not match its configured TLS endpoint`);
  }
}

/** Feature previews use a dedicated, synthetic-only Neon project pair. */
export function readOrbitFeaturePreviewDatabaseOverride(source = process.env) {
  const url = source.RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL?.trim();
  const directUrl = source.RACEPREDICTOR_ORBIT_PREVIEW_DATABASE_URL_UNPOOLED?.trim();
  const pooledHost = source.RACEPREDICTOR_ORBIT_PREVIEW_POOLED_HOST?.trim();
  const directHost = source.RACEPREDICTOR_ORBIT_PREVIEW_DIRECT_HOST?.trim();
  const variables = [url, directUrl, pooledHost, directHost];
  const isFeaturePreview = source.VERCEL === "1"
    && source.VERCEL_ENV === "preview"
    && source.VERCEL_GIT_COMMIT_REF === "codex/orbit-post-run-review";

  if (!isFeaturePreview) {
    if (variables.some(Boolean)) throw new Error("ORBIT database settings require the feature-branch Preview environment");
    return undefined;
  }
  if (variables.some((value) => !value)) throw new Error("Both ORBIT feature-preview URLs and expected hosts are required");
  if (pooledHost === directHost || pooledHost === pooledStagingHost || directHost === directStagingHost) {
    throw new Error("ORBIT feature preview requires its own isolated Neon endpoints");
  }
  if (!pooledHost.includes("-pooler.") || directHost.includes("-pooler.")) {
    throw new Error("ORBIT preview expected hosts must identify the pooled and direct endpoints separately");
  }
  validate(url, pooledHost, "pooled");
  validate(directUrl, directHost, "direct");
  return Object.freeze({ url, directUrl });
}
