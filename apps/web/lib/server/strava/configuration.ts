import { assertServerRuntime } from "../server-runtime.ts";

assertServerRuntime("strava/configuration");

export interface StravaConnectionConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: string;
  tokenEncryptionKeyVersion: string;
}

export type StravaConfigurationSource = Readonly<Record<string, string | undefined>>;

export class StravaConfigurationError extends Error {
  readonly code = "CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "StravaConfigurationError";
  }
}

function required(source: StravaConfigurationSource, name: string) {
  const value = source[name]?.trim();
  if (!value) throw new StravaConfigurationError(`${name} is required`);
  return value;
}

function validateRedirectUri(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new StravaConfigurationError("STRAVA_REDIRECT_URI must be an absolute URL");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
      || url.username
      || url.password
      || url.search
      || url.hash
      || url.pathname !== "/api/v1/providers/strava/callback") {
    throw new StravaConfigurationError("STRAVA_REDIRECT_URI must use the fixed HTTPS callback path");
  }
  return url.toString();
}

function validateEncryptionKey(raw: string) {
  const key = Buffer.from(raw, "base64");
  if (key.byteLength !== 32) {
    throw new StravaConfigurationError("RACEPREDICTOR_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return raw;
}

export function readStravaConnectionConfiguration(
  source: StravaConfigurationSource = process.env,
): StravaConnectionConfiguration {
  const clientId = required(source, "STRAVA_CLIENT_ID");
  if (!/^\d+$/u.test(clientId)) {
    throw new StravaConfigurationError("STRAVA_CLIENT_ID must be numeric");
  }
  const clientSecret = required(source, "STRAVA_CLIENT_SECRET");
  if (clientSecret.length > 512) {
    throw new StravaConfigurationError("STRAVA_CLIENT_SECRET is invalid");
  }
  const tokenEncryptionKeyVersion = source.RACEPREDICTOR_TOKEN_ENCRYPTION_KEY_VERSION?.trim() || "v1";
  if (!/^[A-Za-z0-9._-]{1,40}$/u.test(tokenEncryptionKeyVersion)) {
    throw new StravaConfigurationError("RACEPREDICTOR_TOKEN_ENCRYPTION_KEY_VERSION is invalid");
  }

  return Object.freeze({
    clientId,
    clientSecret,
    redirectUri: validateRedirectUri(required(source, "STRAVA_REDIRECT_URI")),
    tokenEncryptionKey: validateEncryptionKey(required(source, "RACEPREDICTOR_TOKEN_ENCRYPTION_KEY")),
    tokenEncryptionKeyVersion,
  });
}
