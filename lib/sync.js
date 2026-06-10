// Progress sync layer.
// Shape of progress state:
// {
//   answered: { [id]: "A"|"B"|"C" },   // chosen option per question (path)
//   wrong:    { [id]: true },           // questions answered wrong at least once (feeds wrong-set)
//   cleared:  { [id]: true },           // questions removed from wrong-set (got right in review)
//   favorite: { [id]: true },           // bookmarked questions
//   modPos:   { [moduleId]: number },   // last question index per module (resume)
//   updatedAt: number
// }

const LS_KEY = "cadl_progress_v2";
const PASS_KEY = "cadl_passphrase";

export function emptyProgress() {
  return {
    answered: {},
    wrong: {},
    cleared: {},
    favorite: {},
    modPos: {},
    updatedAt: 0,
  };
}

export function getPassphrase() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PASS_KEY) || "";
}

export function setPassphrase(p) {
  if (typeof window === "undefined") return;
  if (p) window.localStorage.setItem(PASS_KEY, p);
  else window.localStorage.removeItem(PASS_KEY);
}

export function loadLocal() {
  if (typeof window === "undefined") return emptyProgress();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? { ...emptyProgress(), ...JSON.parse(raw) } : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveLocal(progress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(progress));
}

// Merge two progress states. Union of sets, newest modPos/updatedAt wins.
export function mergeProgress(a, b) {
  if (!a) return b || emptyProgress();
  if (!b) return a;
  const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  return {
    answered: { ...a.answered, ...b.answered },
    wrong: { ...a.wrong, ...b.wrong },
    cleared: { ...a.cleared, ...b.cleared },
    favorite: { ...a.favorite, ...b.favorite },
    modPos: { ...a.modPos, ...b.modPos, ...newer.modPos },
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
  };
}

// Pull cloud progress (if enabled) and merge with local.
export async function pullCloud(passphrase) {
  if (!passphrase) return { enabled: false, progress: loadLocal() };
  try {
    const res = await fetch(`/api/progress?p=${encodeURIComponent(passphrase)}`);
    const json = await res.json();
    if (!json.enabled) return { enabled: false, progress: loadLocal() };
    const cloud = json.data || emptyProgress();
    const merged = mergeProgress(loadLocal(), cloud);
    saveLocal(merged);
    return { enabled: true, progress: merged };
  } catch {
    return { enabled: false, progress: loadLocal() };
  }
}

// Push progress to cloud (best-effort). Always writes localStorage first.
let pushTimer = null;
export function pushCloud(passphrase, progress) {
  saveLocal(progress);
  if (!passphrase) return;
  // Debounce network writes.
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase, data: progress }),
    }).catch(() => {});
  }, 600);
}
