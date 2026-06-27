import { setJSON, storageEnabled } from "../../../../lib/server/redis";

export const dynamic = "force-dynamic";

const KEEPALIVE_TTL_SECONDS = 60 * 60 * 24 * 30;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!storageEnabled()) {
    return Response.json({ ok: false, enabled: false });
  }

  await setJSON(
    "cadl:keepalive",
    { touchedAt: Date.now(), source: "vercel-cron" },
    { ttlSeconds: KEEPALIVE_TTL_SECONDS }
  );

  return Response.json({ ok: true, enabled: true });
}
