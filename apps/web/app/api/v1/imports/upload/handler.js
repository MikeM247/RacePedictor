import { handleImportUpload } from "../../../../../lib/import-upload-service.js";

function buildValidationPayload(message) {
  return {
    status: 400,
    body: {
      error: {
        code: "VALIDATION_ERROR",
        message,
        details: [],
      },
    },
  };
}

export async function handleUploadRequest(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return buildValidationPayload("Content-Type must be multipart/form-data.");
  }

  try {
    const formData = await request.formData();
    const result = await handleImportUpload(formData);
    return { status: 200, body: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid upload request.";
    return buildValidationPayload(message);
  }
}
