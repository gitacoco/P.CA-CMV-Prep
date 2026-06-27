import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import {
  deleteChallenge,
  getChallenge,
  getCredential,
  getUser,
  publicUser,
  storageEnabled,
  updateCredentialAfterLogin,
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
  if (!pending || pending.type !== "authentication") {
    return Response.json({ error: "login challenge expired" }, { status: 400 });
  }

  const storedCredential = await getCredential(body?.credential?.id);
  if (!storedCredential) {
    return Response.json({ error: "unknown passkey" }, { status: 404 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.credential,
      expectedChallenge: pending.challenge,
      expectedOrigin: pending.origin,
      expectedRPID: pending.rpID,
      credential: {
        id: storedCredential.id,
        publicKey: isoBase64URL.toBuffer(storedCredential.publicKey),
        counter: storedCredential.counter || 0,
        transports: storedCredential.transports || [],
      },
      requireUserVerification: false,
    });
  } catch (err) {
    console.error("Passkey login verification failed", err);
    return Response.json({ error: "login failed" }, { status: 400 });
  }

  if (!verification.verified) {
    return Response.json({ error: "login not verified" }, { status: 400 });
  }

  await updateCredentialAfterLogin(storedCredential.id, {
    counter: verification.authenticationInfo.newCounter,
    deviceType: verification.authenticationInfo.credentialDeviceType,
    backedUp: verification.authenticationInfo.credentialBackedUp,
  });
  await deleteChallenge(body.challengeId);

  const user = await getUser(storedCredential.userId);
  if (!user) {
    return Response.json({ error: "account not found" }, { status: 404 });
  }

  return Response.json(
    { enabled: true, user: publicUser(user) },
    { headers: { "Set-Cookie": createSessionCookie(user.id) } }
  );
}
