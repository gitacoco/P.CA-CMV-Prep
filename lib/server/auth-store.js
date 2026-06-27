import { delKey, getJSON, setJSON, storageEnabled } from "./redis";

const CHALLENGE_TTL_SECONDS = 5 * 60;

function userKey(userId) {
  return `cadl:user:${userId}`;
}

function userCredentialsKey(userId) {
  return `cadl:user:${userId}:credentials`;
}

function credentialKey(credentialId) {
  return `cadl:credential:${credentialId}`;
}

function challengeKey(challengeId) {
  return `cadl:challenge:${challengeId}`;
}

function progressKey(userId) {
  return `cadl:user:${userId}:progress`;
}

export { storageEnabled };

export async function saveChallenge(challengeId, value) {
  await setJSON(challengeKey(challengeId), value, {
    ttlSeconds: CHALLENGE_TTL_SECONDS,
  });
}

export async function getChallenge(challengeId) {
  if (!challengeId) return null;
  return getJSON(challengeKey(challengeId));
}

export async function deleteChallenge(challengeId) {
  if (!challengeId) return;
  await delKey(challengeKey(challengeId));
}

export async function saveUser(user) {
  await setJSON(userKey(user.id), user);
}

export async function getUser(userId) {
  if (!userId) return null;
  return getJSON(userKey(userId));
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    createdAt: user.createdAt,
  };
}

export async function getUserCredentialIds(userId) {
  return (await getJSON(userCredentialsKey(userId))) || [];
}

export async function saveCredential(credential) {
  await setJSON(credentialKey(credential.id), credential);
  const ids = await getUserCredentialIds(credential.userId);
  if (!ids.includes(credential.id)) {
    await setJSON(userCredentialsKey(credential.userId), [...ids, credential.id]);
  }
}

export async function getCredential(credentialId) {
  if (!credentialId) return null;
  return getJSON(credentialKey(credentialId));
}

export async function updateCredentialAfterLogin(credentialId, updates) {
  const credential = await getCredential(credentialId);
  if (!credential) return null;
  const next = { ...credential, ...updates, lastUsedAt: Date.now() };
  await setJSON(credentialKey(credentialId), next);
  return next;
}

export async function getUserProgress(userId) {
  if (!userId) return null;
  return getJSON(progressKey(userId));
}

export async function saveUserProgress(userId, progress) {
  await setJSON(progressKey(userId), progress);
}
