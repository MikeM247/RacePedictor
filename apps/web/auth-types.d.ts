import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string };
    runReviewLoginId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    authSubject?: string;
    runReviewLoginId?: string;
  }
}
