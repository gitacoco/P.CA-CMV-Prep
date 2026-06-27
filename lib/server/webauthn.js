function firstHeaderValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

export function getWebAuthnConfig(request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(
    request.headers.get("x-forwarded-proto")
  );
  const host = forwardedHost || requestUrl.host;
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  const origin = (process.env.WEBAUTHN_ORIGIN || `${protocol}://${host}`).replace(
    /\/$/,
    ""
  );
  const rpID = process.env.WEBAUTHN_RP_ID || new URL(origin).hostname;

  return {
    rpName: process.env.WEBAUTHN_RP_NAME || "CA DL Prep",
    rpID,
    origin,
  };
}
