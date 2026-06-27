import crypto from "crypto";

export const SESSION_COOKIE = "cadl_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const APP_SECRET = process.env.APP_SECRET || "ca-dl-prep-default-salt";

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", APP_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf("=");
        if (eq === -1) return [part, ""];
        return [part.slice(0, eq), decodeURIComponent(part.slice(eq + 1))];
      })
  );
}

function serializeCookie(name, value, options = {}) {
  const attrs = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) attrs.push(`Max-Age=${options.maxAge}`);
  if (options.path) attrs.push(`Path=${options.path}`);
  if (options.httpOnly) attrs.push("HttpOnly");
  if (options.sameSite) attrs.push(`SameSite=${options.sameSite}`);
  if (options.secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function createSessionCookie(userId) {
  const payload = {
    userId,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const encodedPayload = encodePayload(payload);
  const value = `${encodedPayload}.${signPayload(encodedPayload)}`;
  return serializeCookie(SESSION_COOKIE, value, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

export function getSession(request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;

  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = signPayload(encodedPayload);
  if (!timingSafeEqualString(signature, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
    if (!payload.userId || !payload.exp || payload.exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getSessionUserId(request) {
  return getSession(request)?.userId || null;
}
