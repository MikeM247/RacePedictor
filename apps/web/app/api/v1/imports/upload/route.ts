import { ActivityImportError, importUploadedActivity } from "../../../../../lib/local-activity-import-service.ts";
import { withSensitiveRoute } from "../../../../../lib/server/route-security.ts";
import { importUploadRequestSchema } from "../../../../../../../packages/core/src/contracts/imports.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(status: number, code: string, message: string, details: unknown[] = []) {
  return Response.json({ error: { code, message, details } }, { status });
}

async function uploadActivity(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Request must be multipart form data with a file field");
  }
  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) {
    return errorResponse(400, "VALIDATION_ERROR", "Multipart field 'file' is required");
  }
  const metadata = importUploadRequestSchema.safeParse({
    name: uploaded.name,
    type: uploaded.type,
    size: uploaded.size,
  });
  if (!metadata.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Uploaded file metadata is invalid", metadata.error.issues.map((issue) => ({
      path: issue.path.map(String),
      message: issue.message,
    })));
  }

  try {
    return Response.json({ data: await importUploadedActivity(uploaded) }, { status: 200 });
  } catch (error) {
    if (error instanceof ActivityImportError) {
      return errorResponse(error.httpStatus, error.code, error.message, error.details);
    }
    return errorResponse(500, "INTERNAL_ERROR", "Activity import failed");
  }
}

export const POST = withSensitiveRoute((_security, request) => uploadActivity(request));
