import { generateAuthenticationOptions } from "@simplewebauthn/server";
import crypto from "crypto";
import { saveChallenge, storageEnabled } from "../../../../../lib/server/auth-store";
import { getWebAuthnConfig } from "../../../../../lib/server/webauthn";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!storageEnabled()) {
    return Response.json({ enabled: false }, { status: 200 });
  }

  const { rpID, origin } = getWebAuthnConfig(request);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  const challengeId = crypto.randomBytes(16).toString("base64url");
  await saveChallenge(challengeId, {
    type: "authentication",
    challenge: options.challenge,
    rpID,
    origin,
    createdAt: Date.now(),
  });

  return Response.json({ enabled: true, challengeId, options });
}
