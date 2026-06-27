import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";

const REST_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const CONNECTION_URL =
  process.env.UPSTASH_REDIS_REST_REDIS_URL ||
  process.env.REDIS_URL ||
  process.env.KV_URL;

const restRedis =
  REST_URL && REST_TOKEN
    ? new UpstashRedis({ url: REST_URL, token: REST_TOKEN })
    : null;

let redisClientPromise = null;
const devMemoryStore =
  process.env.NODE_ENV !== "production" && !restRedis && !CONNECTION_URL
    ? (globalThis.__cadlDevMemoryStore ||= new Map())
    : null;

export function storageEnabled() {
  return Boolean(restRedis || CONNECTION_URL || devMemoryStore);
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

export async function getJSON(key) {
  if (devMemoryStore) {
    const entry = devMemoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      devMemoryStore.delete(key);
      return null;
    }
    return entry.value;
  }
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

export async function setJSON(key, value, options = {}) {
  if (devMemoryStore) {
    devMemoryStore.set(key, {
      value,
      expiresAt: options.ttlSeconds
        ? Date.now() + options.ttlSeconds * 1000
        : null,
    });
    return;
  }
  if (restRedis) {
    await restRedis.set(key, value);
    if (options.ttlSeconds) await restRedis.expire(key, options.ttlSeconds);
    return;
  }
  const client = await getRedisClient();
  if (!client) return;
  await client.set(key, JSON.stringify(value));
  if (options.ttlSeconds) await client.expire(key, options.ttlSeconds);
}

export async function delKey(key) {
  if (devMemoryStore) {
    devMemoryStore.delete(key);
    return;
  }
  if (restRedis) {
    await restRedis.del(key);
    return;
  }
  const client = await getRedisClient();
  if (!client) return;
  await client.del(key);
}
