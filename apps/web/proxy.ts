import { NextResponse, type NextRequest } from "next/server.js";
import { sensitiveBoundaryDenial } from "./lib/server/route-security.ts";

export async function proxy(request: NextRequest) {
  const denial = await sensitiveBoundaryDenial(request);
  if (denial?.status === 401 && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return denial ?? NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/v1/:path*"],
};
