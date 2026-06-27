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

const LS_KEY = "cadl_progress_v3";

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

export function clearLocal() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_KEY);
}

// Pull account progress. Authenticated cloud state is authoritative.
export async function pullCloud() {
  try {
    const res = await fetch("/api/progress");
    const json = await res.json();
    if (!json.enabled) {
      return {
        enabled: false,
        authenticated: false,
        progress: loadLocal(),
      };
    }
    if (!res.ok || !json.authenticated) {
      clearLocal();
      return {
        enabled: true,
        authenticated: false,
        progress: emptyProgress(),
      };
    }
    const progress = json.data || emptyProgress();
    saveLocal(progress);
    return { enabled: true, authenticated: true, progress };
  } catch {
    return {
      enabled: false,
      authenticated: false,
      progress: loadLocal(),
    };
  }
}

// Push progress to the signed-in account (best-effort). Always writes localStorage first.
let pushTimer = null;
export function pushCloud(progress) {
  saveLocal(progress);
  // Debounce network writes.
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: progress }),
    }).catch(() => {});
  }, 600);
}
