import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import {
  deleteChallenge,
  getChallenge,
  getCredential,
  publicUser,
  saveCredential,
  saveUser,
  storageEnabled,
} from "../../../../../lib/server/auth-store";
import { createSessionCookie } from "../../../../../lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!storageEnabled()) {
    return Response.json({ enabled: false }, { status: 200 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const pending = await getChallenge(body?.challengeId);
  if (!pending || pending.type !== "registration") {
    return Response.json({ error: "registration challenge expired" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.credential,
      expectedChallenge: pending.challenge,
      expectedOrigin: pending.origin,
      expectedRPID: pending.rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    console.error("Passkey registration verification failed", err);
    return Response.json({ error: "registration failed" }, { status: 400 });
  }

  if (!verification.verified) {
    return Response.json({ error: "registration not verified" }, { status: 400 });
  }

  const {
    credential,
    credentialDeviceType,
    credentialBackedUp,
  } = verification.registrationInfo;

  if (await getCredential(credential.id)) {
    await deleteChallenge(body.challengeId);
    return Response.json({ error: "passkey already registered" }, { status: 409 });
  }

  const now = Date.now();
  const user = {
    id: pending.userId,
    name: pending.name,
    webAuthnUserID: pending.webAuthnUserID,
    createdAt: now,
    updatedAt: now,
  };
  const passkey = {
    id: credential.id,
    userId: user.id,
    webAuthnUserID: pending.webAuthnUserID,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports || [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    createdAt: now,
    lastUsedAt: now,
  };

  await saveUser(user);
  await saveCredential(passkey);
  await deleteChallenge(body.challengeId);

  return Response.json(
    { enabled: true, user: publicUser(user) },
    { headers: { "Set-Cookie": createSessionCookie(user.id) } }
  );
}
