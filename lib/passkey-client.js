"use client";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

async function readJSON(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function postJSON(url, body = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJSON(res);
  if (!res.ok) {
    throw new Error(json.error || "Request failed");
  }
  if (json.enabled === false) {
    throw new Error("Cloud account storage is not configured.");
  }
  return json;
}

export async function getAuthState() {
  const res = await fetch("/api/auth/me");
  const json = await readJSON(res);
  return {
    enabled: Boolean(json.enabled),
    user: json.user || null,
  };
}

export async function registerWithPasskey(name) {
  if (!browserSupportsWebAuthn()) {
    throw new Error("This browser does not support passkeys.");
  }
  const begin = await postJSON("/api/auth/register/options", { name });
  const credential = await startRegistration({ optionsJSON: begin.options });
  const verified = await postJSON("/api/auth/register/verify", {
    challengeId: begin.challengeId,
    credential,
  });
  return verified.user;
}

export async function loginWithPasskey() {
  if (!browserSupportsWebAuthn()) {
    throw new Error("This browser does not support passkeys.");
  }
  const begin = await postJSON("/api/auth/login/options");
  const credential = await startAuthentication({ optionsJSON: begin.options });
  const verified = await postJSON("/api/auth/login/verify", {
    challengeId: begin.challengeId,
    credential,
  });
  return verified.user;
}

export async function logoutAccount() {
  await fetch("/api/auth/logout", { method: "POST" });
}
