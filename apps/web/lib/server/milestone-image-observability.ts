import { ApiHttpError } from "./api-response.ts";
export async function imageOperation<T>(
  operation: string,
  work: () => Promise<T>,
): Promise<T> {
  try {
    const result = await work();
    console.info("milestone_image_operation", { operation, outcome: "saved", ...(result && typeof result === "object" && "revision" in result && typeof result.revision === "number" ? {revision:result.revision} : {}) });
    return result;
  } catch (error) {
    console.warn("milestone_image_operation", {
      operation,
      outcome: "failed",
      code: error instanceof ApiHttpError ? error.code : "INTERNAL_ERROR",
    });
    throw error;
  }
}
