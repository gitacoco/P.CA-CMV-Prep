import {
  getUser,
  getUserProgress,
  saveUserProgress,
  storageEnabled,
} from "../../../lib/server/auth-store";
import { getSessionUserId } from "../../../lib/server/session";

export const dynamic = "force-dynamic";

async function requireUser(request) {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  const user = await getUser(userId);
  return user ? { user, userId } : null;
}

export async function GET(request) {
  if (!storageEnabled()) {
    return Response.json({ enabled: false });
  }

  const session = await requireUser(request);
  if (!session) {
    return Response.json(
      { enabled: true, authenticated: false, data: null },
      { status: 401 }
    );
  }

  const data = await getUserProgress(session.userId);
  return Response.json({
    enabled: true,
    authenticated: true,
    data: data || null,
  });
}

export async function POST(request) {
  if (!storageEnabled()) {
    return Response.json({ enabled: false }, { status: 200 });
  }

  const session = await requireUser(request);
  if (!session) {
    return Response.json(
      { enabled: true, authenticated: false },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const payload = { ...(body?.data || {}), updatedAt: Date.now() };
  await saveUserProgress(session.userId, payload);
  return Response.json({ enabled: true, authenticated: true, data: payload });
}
