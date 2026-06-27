import { generateRegistrationOptions } from "@simplewebauthn/server";
import crypto from "crypto";
import { saveChallenge, storageEnabled } from "../../../../../lib/server/auth-store";
import { getWebAuthnConfig } from "../../../../../lib/server/webauthn";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!storageEnabled()) {
    return Response.json({ enabled: false }, { status: 200 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) {
    return Response.json({ error: "missing account name" }, { status: 400 });
  }

  const { rpName, rpID, origin } = getWebAuthnConfig(request);
  const userId = crypto.randomUUID();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: name,
    userDisplayName: name,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });

  const challengeId = crypto.randomBytes(16).toString("base64url");
  await saveChallenge(challengeId, {
    type: "registration",
    challenge: options.challenge,
    userId,
    name,
    webAuthnUserID: options.user.id,
    rpID,
    origin,
    createdAt: Date.now(),
  });

  return Response.json({ enabled: true, challengeId, options });
}
