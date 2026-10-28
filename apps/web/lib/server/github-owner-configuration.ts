import { assertServerRuntime } from "./server-runtime.ts";

assertServerRuntime("github-owner-configuration");

export type OwnerAuthEnvironmentSource = Readonly<Record<string, string | undefined>>;
export type OwnerAuthConfiguration = Readonly<{ authSubject: string }>;

const githubSubjectPattern = /^github:[1-9][0-9]{0,19}$/u;

export function readOwnerAuthConfiguration(
  source: OwnerAuthEnvironmentSource = process.env,
): OwnerAuthConfiguration | null {
  const required = [source.AUTH_SECRET, source.AUTH_GITHUB_ID, source.AUTH_GITHUB_SECRET];
  const authSubject = source.RACEPREDICTOR_OWNER_AUTH_SUBJECT?.trim();
  if (required.some((value) => !value?.trim()) || !authSubject) return null;
  if (!githubSubjectPattern.test(authSubject)) return null;
  return Object.freeze({ authSubject });
}

export function githubSubjectFromAccount(account: {
  provider?: string | null;
  providerAccountId?: string | null;
} | null | undefined): string | null {
  if (account?.provider !== "github" || !/^[1-9][0-9]{0,19}$/u.test(account.providerAccountId ?? "")) {
    return null;
  }
  return `github:${account.providerAccountId}`;
}

export function isConfiguredOwnerAccount(
  account: Parameters<typeof githubSubjectFromAccount>[0],
  source: OwnerAuthEnvironmentSource = process.env,
) {
  const configuration = readOwnerAuthConfiguration(source);
  return Boolean(configuration && githubSubjectFromAccount(account) === configuration.authSubject);
}

export function updateOwnerAuthToken<T extends { authSubject?: string }>(
  token: T,
  account: Parameters<typeof githubSubjectFromAccount>[0],
  source: OwnerAuthEnvironmentSource = process.env,
): T {
  const signedInSubject = githubSubjectFromAccount(account);
  if (signedInSubject) token.authSubject = signedInSubject;
  const expected = readOwnerAuthConfiguration(source)?.authSubject;
  if (!expected || token.authSubject !== expected) delete token.authSubject;
  return token;
}

export function projectOwnerSession<T extends { user?: unknown }>(
  session: T,
  token: Readonly<{ authSubject?: string; runReviewLoginId?: string }>,
  source: OwnerAuthEnvironmentSource = process.env,
): T {
  const user = session.user as { id?: string } | null | undefined;
  if (user) {
    const expected = readOwnerAuthConfiguration(source)?.authSubject;
    user.id = token.authSubject === expected ? expected : "";
    if (token.authSubject === expected && token.runReviewLoginId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(token.runReviewLoginId)) {
      Object.assign(session, { runReviewLoginId: token.runReviewLoginId });
    }
  }
  return session;
}
