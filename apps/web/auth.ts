import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
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
      return updateOwnerAuthToken(token, account);
    },
    session({ session, token }) {
      return projectOwnerSession(session, token);
    },
  },
});
