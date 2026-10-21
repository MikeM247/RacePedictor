import { NextResponse, type NextRequest } from "next/server.js";
import { sensitiveBoundaryDenial } from "./lib/server/route-security.ts";

export async function proxy(request: NextRequest) {
  const configuredAuthUrl = process.env.AUTH_URL?.trim();
  const signInUrl = new URL("/login", configuredAuthUrl || request.url);
  if (request.nextUrl.pathname === "/login") {
    // Next may normalize nextUrl to its internal server origin in development.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    if (configuredAuthUrl && `${protocol}://${host}` !== signInUrl.origin) {
      // Host-only PKCE cookies must be created where the OAuth callback returns.
      // A POST from an old alias starts over with a GET instead of replaying it.
      return NextResponse.redirect(signInUrl, 303);
    }
    return NextResponse.next();
  }
  const denial = await sensitiveBoundaryDenial(request);
  if (denial?.status === 401 && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(signInUrl);
  }
  return denial ?? NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/api/v1/:path*"],
};
