import { getServerAuth } from "../../../../../lib/server/composition.ts";
import { failure, success } from "../../../../../lib/server/api-response.ts";

export const dynamic = "force-dynamic";

/** Returns safe actor/session state only; identity-provider tokens never leave the server. */
export async function GET(request: Request) {
  try {
    return success(await getServerAuth().getSessionStatus(request));
  } catch (error) {
    return failure(error);
  }
}
