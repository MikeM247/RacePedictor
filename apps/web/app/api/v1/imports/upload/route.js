import { NextResponse } from "next/server";

import { handleUploadRequest } from "./handler";

export async function POST(request) {
  const result = await handleUploadRequest(request);
  return NextResponse.json(result.body, { status: result.status });
}
