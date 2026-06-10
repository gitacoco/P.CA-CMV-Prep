import { Redis } from "@upstash/redis";
import crypto from "crypto";

// Cloud sync is enabled only when Upstash env vars are present.
// Vercel's Upstash integration provides KV_REST_API_URL / KV_REST_API_TOKEN
// (older) or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (newer).
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const APP_SECRET = process.env.APP_SECRET || "ca-dl-prep-default-salt";

const redis =
  REDIS_URL && REDIS_TOKEN
    ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
    : null;

// Derive a storage key from the passphrase so the raw passphrase is never stored.
function keyFor(passphrase) {
  const h = crypto
    .createHmac("sha256", APP_SECRET)
    .update(String(passphrase).trim().toLowerCase())
    .digest("hex");
  return `cadl:progress:${h}`;
}

export async function GET(request) {
  if (!redis) {
    return Response.json({ enabled: false });
  }
  const pass = request.nextUrl.searchParams.get("p");
  if (!pass) {
    return Response.json({ error: "missing passphrase" }, { status: 400 });
  }
  const data = await redis.get(keyFor(pass));
  return Response.json({ enabled: true, data: data || null });
}

export async function POST(request) {
  if (!redis) {
    return Response.json({ enabled: false }, { status: 200 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const { passphrase, data } = body || {};
  if (!passphrase) {
    return Response.json({ error: "missing passphrase" }, { status: 400 });
  }
  // Last-write-wins, with a server timestamp so clients can detect freshness.
  const payload = { ...data, updatedAt: Date.now() };
  await redis.set(keyFor(passphrase), payload);
  return Response.json({ enabled: true, data: payload });
}
