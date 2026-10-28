import { handlers } from "../../../../auth.ts";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const response = await handlers.GET(request);
  if (new URL(request.url).pathname !== "/api/auth/session") return response;
  const session = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (session) delete session.runReviewLoginId;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return Response.json(session, { status: response.status, statusText: response.statusText, headers });
}

export const POST = handlers.POST;
