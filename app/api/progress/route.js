import { Redis as UpstashRedis } from "@upstash/redis";
import crypto from "crypto";
import { createClient } from "redis";

export const dynamic = "force-dynamic";

// Support both REST-style Upstash credentials and connection-string style
// variables injected by newer Vercel Redis integrations/custom prefixes.
const REST_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const CONNECTION_URL =
  process.env.UPSTASH_REDIS_REST_REDIS_URL ||
  process.env.REDIS_URL ||
  process.env.KV_URL;
const APP_SECRET = process.env.APP_SECRET || "ca-dl-prep-default-salt";

const restRedis =
  REST_URL && REST_TOKEN
    ? new UpstashRedis({ url: REST_URL, token: REST_TOKEN })
    : null;

let redisClientPromise = null;

function cloudEnabled() {
  return Boolean(restRedis || CONNECTION_URL);
}

async function getRedisClient() {
  if (!CONNECTION_URL) return null;
  if (!redisClientPromise) {
    const client = createClient({ url: CONNECTION_URL });
    client.on("error", (err) => {
      console.error("Redis client error", err);
    });
    redisClientPromise = client.connect().then(() => client);
  }
  return redisClientPromise;
}

async function readProgress(key) {
  if (restRedis) return restRedis.get(key);
  const client = await getRedisClient();
  if (!client) return null;
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeProgress(key, value) {
  if (restRedis) {
    await restRedis.set(key, value);
    return;
  }
  const client = await getRedisClient();
  if (!client) return;
  await client.set(key, JSON.stringify(value));
}

// Derive a storage key from the passphrase so the raw passphrase is never stored.
function keyFor(passphrase) {
  const h = crypto
    .createHmac("sha256", APP_SECRET)
    .update(String(passphrase).trim().toLowerCase())
    .digest("hex");
  return `cadl:progress:${h}`;
}

export async function GET(request) {
  if (!cloudEnabled()) {
    return Response.json({ enabled: false });
  }
  const pass = request.nextUrl.searchParams.get("p");
  if (!pass) {
    return Response.json({ error: "missing passphrase" }, { status: 400 });
  }
  const data = await readProgress(keyFor(pass));
  return Response.json({ enabled: true, data: data || null });
}

export async function POST(request) {
  if (!cloudEnabled()) {
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
  await writeProgress(keyFor(passphrase), payload);
  return Response.json({ enabled: true, data: payload });
}
