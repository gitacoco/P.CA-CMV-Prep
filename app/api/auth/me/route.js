import {
  getUser,
  publicUser,
  storageEnabled,
} from "../../../../lib/server/auth-store";
import { getSessionUserId } from "../../../../lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!storageEnabled()) {
    return Response.json({ enabled: false, user: null }, { status: 200 });
  }

  const user = await getUser(getSessionUserId(request));
  return Response.json({ enabled: true, user: publicUser(user) });
}
