import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { randomUUID } from "node:crypto";
import {
  isConfiguredOwnerAccount,
  projectOwnerSession,
  updateOwnerAuthToken,
} from "./lib/server/github-owner-configuration.ts";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub({ authorization: { params: { scope: "read:user" } } })],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ account }) {
      return isConfiguredOwnerAccount(account);
    },
    jwt({ token, account }) {
      const updated = updateOwnerAuthToken(token, account);
      if (account && isConfiguredOwnerAccount(account)) updated.runReviewLoginId = randomUUID();
      else if (account) delete updated.runReviewLoginId;
      return updated;
    },
    session({ session, token }) {
      return projectOwnerSession(session, token);
    },
  },
});
