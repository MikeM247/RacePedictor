const pooledHost = "ep-tiny-band-b1j73wgx-pooler.c-5.eu-central-1.aws.neon.tech";
const directHost = "ep-tiny-band-b1j73wgx.c-5.eu-central-1.aws.neon.tech";

function validateUrl(value, expectedHost) {
  let parsed;
  try { parsed = new URL(value); } catch {
    throw new Error("V2 preview database connection is invalid");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || parsed.hostname !== expectedHost
    || !parsed.username || !parsed.password
    || !["require", "verify-full"].includes(parsed.searchParams.get("sslmode"))) {
    throw new Error("V2 preview database connection does not match the isolated TLS endpoint");
  }
}

/** Dedicated names survive the Neon integration's deployment-time DATABASE_URL injection. */
export function readPreviewDatabaseOverride(source = process.env) {
  const url = source.RACEPREDICTOR_V2_DATABASE_URL?.trim();
  const directUrl = source.RACEPREDICTOR_V2_DATABASE_URL_UNPOOLED?.trim();
  const workPreview = source.VERCEL_ENV === "preview" && source.VERCEL_GIT_COMMIT_REF === "work";
  if (!workPreview) {
    if (url || directUrl) throw new Error("V2 database overrides require Preview Git branch work");
    return undefined;
  }
  if (!url || !directUrl) throw new Error("Both isolated V2 preview database connections are required");
  validateUrl(url, pooledHost);
  validateUrl(directUrl, directHost);
  return Object.freeze({ url, directUrl });
}
