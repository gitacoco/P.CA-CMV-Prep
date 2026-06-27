"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clearLocal,
  emptyProgress,
  loadLocal,
  pullCloud,
  pushCloud,
} from "../lib/sync";
import {
  getAuthState,
  loginWithPasskey,
  logoutAccount,
  registerWithPasskey,
} from "../lib/passkey-client";

const OPTION_KEYS = ["A", "B", "C", "D"];

// Per-module accent + glyph. Glyphs are plain unicode (no icon font dep).
const MOD_META = {
  signs: { glyph: "▲", c: "#d85a30" },
  signals: { glyph: "◐", c: "#bA7517" },
  rightofway: { glyph: "⤳", c: "#1d9e75" },
  speed: { glyph: "◆", c: "#378add" },
  turns: { glyph: "↰", c: "#7f77dd" },
  sharing: { glyph: "⇄", c: "#1d9e75" },
  safe: { glyph: "◉", c: "#378add" },
  alcohol: { glyph: "✦", c: "#d4537e" },
  laws: { glyph: "§", c: "#5f5e5a" },
  basics: { glyph: "▣", c: "#5f5e5a" },
};

export default function Page() {
  const [questions, setQuestions] = useState(null);
  const [modules, setModules] = useState(null);
  const [progress, setProgress] = useState(emptyProgress());
  const [view, setView] = useState("path"); // path | module | wrong
  const [activeMod, setActiveMod] = useState(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [accountName, setAccountName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [qd, md] = await Promise.all([
          fetch("/data/questions-all.json").then((r) => {
            if (!r.ok) throw new Error("questions failed");
            return r.json();
          }),
          fetch("/data/modules.json").then((r) => {
            if (!r.ok) throw new Error("modules failed");
            return r.json();
          }),
        ]);
        if (cancelled) return;
        setQuestions(qd);
        setModules(md);

        const localProgress = loadLocal();
        setProgress(localProgress);

        try {
          const auth = await getAuthState();
          if (cancelled) return;
          setAuthEnabled(auth.enabled);
          setUser(auth.user);

          if (auth.user) {
            const { progress: accountProgress } = await pullCloud();
            if (cancelled) return;
            setProgress(accountProgress);
          } else if (auth.enabled) {
            clearLocal();
            setProgress(emptyProgress());
            setShowSettings(true);
          }
        } catch {
          if (!cancelled) setAuthEnabled(false);
        }
      } catch {
        if (!cancelled) {
          setInitError("Could not load question data.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Questions grouped by module, in file order.
  const byModule = useMemo(() => {
    const m = {};
    (questions || []).forEach((q) => {
      (m[q.module] = m[q.module] || []).push(q);
    });
    return m;
  }, [questions]);

  // The active list of questions for the current quiz view.
  const list = useMemo(() => {
    if (view === "module" && activeMod) return byModule[activeMod] || [];
    if (view === "wrong") {
      return (questions || []).filter(
        (q) => progress.wrong[q.id] && !progress.cleared[q.id]
      );
    }
    return [];
  }, [view, activeMod, byModule, questions, progress.wrong, progress.cleared]);

  const q = list[idx] || null;

  // Reveal automatically if this question was already answered in PATH.
  // In wrong-set, always start fresh (it's a separate review session).
  useEffect(() => {
    if (!q) return;
    if (view === "module" && progress.answered[q.id]) setRevealed(true);
    else setRevealed(false);
  }, [q?.id, view]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(next) {
    const merged = { ...next, updatedAt: Date.now() };
    setProgress(merged);
    pushCloud(merged);
  }

  function choose(key) {
    if (!q || revealed) return;
    const correct = key === q.answer;

    if (view === "module") {
      // Path mode: record answer + feed wrong-set. Does NOT touch cleared.
      const next = {
        ...progress,
        answered: { ...progress.answered, [q.id]: key },
        wrong: { ...progress.wrong },
        modPos: { ...progress.modPos, [activeMod]: idx },
      };
      if (!correct) {
        next.wrong[q.id] = true;
        // a fresh mistake re-enters the wrong-set
        if (next.cleared[q.id]) {
          next.cleared = { ...progress.cleared };
          delete next.cleared[q.id];
        }
      }
      setRevealed(true);
      commit(next);
    } else if (view === "wrong") {
      // Wrong-set mode: decoupled from path. Right answer clears it from the set.
      const next = { ...progress, cleared: { ...progress.cleared } };
      if (correct) next.cleared[q.id] = true;
      setRevealed(true);
      commit(next);
    }
  }

  function toggleFav() {
    if (!q) return;
    const fav = { ...progress.favorite };
    if (fav[q.id]) delete fav[q.id];
    else fav[q.id] = true;
    commit({ ...progress, favorite: fav });
  }

  function go(delta) {
    const ni = idx + delta;
    if (ni < 0 || ni >= list.length) return;
    setIdx(ni);
    if (view === "module" && activeMod) {
      commit({ ...progress, modPos: { ...progress.modPos, [activeMod]: ni } });
    }
  }

  function openModule(mid) {
    setActiveMod(mid);
    setView("module");
    const resume = progress.modPos[mid];
    const len = (byModule[mid] || []).length;
    setIdx(resume != null && resume < len ? resume : 0);
    setRevealed(false);
    window.scrollTo(0, 0);
  }

  function openWrong() {
    setView("wrong");
    setIdx(0);
    setRevealed(false);
    window.scrollTo(0, 0);
  }

  function backToPath() {
    setView("path");
    setActiveMod(null);
    window.scrollTo(0, 0);
  }

  async function refreshAccountProgress() {
    const result = await pullCloud();
    setAuthEnabled(result.enabled);
    setProgress(result.progress);
  }

  async function createAccount() {
    setAuthBusy(true);
    setAuthError("");
    try {
      const nextUser = await registerWithPasskey(accountName);
      setUser(nextUser);
      await refreshAccountProgress();
      setShowSettings(false);
    } catch (err) {
      setAuthError(err.message || "Could not create passkey.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signIn() {
    setAuthBusy(true);
    setAuthError("");
    try {
      const nextUser = await loginWithPasskey();
      setUser(nextUser);
      await refreshAccountProgress();
      setShowSettings(false);
    } catch (err) {
      setAuthError(err.message || "Could not sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await logoutAccount();
      setUser(null);
      clearLocal();
      setProgress(emptyProgress());
      setShowSettings(true);
    } catch (err) {
      setAuthError(err.message || "Could not sign out.");
    } finally {
      setAuthBusy(false);
    }
  }

  if (initError) {
    return (
      <div className="wrap">
        <div className="empty">{initError}</div>
      </div>
    );
  }

  if (!ready || !questions || !modules) {
    return (
      <div className="wrap">
        <div className="empty">Loading…</div>
      </div>
    );
  }

  const total = questions.length;
  const answeredCount = Object.keys(progress.answered).length;
  const wrongCount = (questions || []).filter(
    (x) => progress.wrong[x.id] && !progress.cleared[x.id]
  ).length;
  const pathPct = total ? Math.round((answeredCount / total) * 100) : 0;
  const syncOn = authEnabled && Boolean(user);
  const syncLabel = syncOn ? "Synced" : authEnabled ? "Sign in" : "Local";

  // Per-module stats.
  function modStats(mid) {
    const qs = byModule[mid] || [];
    const done = qs.filter((x) => progress.answered[x.id]).length;
    const correct = qs.filter(
      (x) => progress.answered[x.id] === x.answer
    ).length;
    return { done, correct, total: qs.length, complete: done === qs.length };
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <button
            className="topbar-title-btn"
            onClick={backToPath}
            aria-label="Home"
          >
            CA DL Prep
          </button>
          <span className="topbar-meta">
            <button
              className={`wrong-pill ${view === "wrong" ? "active" : ""}`}
              onClick={openWrong}
              title="错题集"
            >
              <svg
                className="wrong-icon"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              错题集
              {wrongCount > 0 && (
                <span className="wrong-badge">{wrongCount}</span>
              )}
            </button>
            <span className={`sync-dot ${syncOn ? "sync-on" : "sync-off"}`} />
            {syncLabel}
            {" · "}
            <button className="link" onClick={() => setShowSettings((s) => !s)}>
              {showSettings ? "close" : "settings"}
            </button>
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pathPct}%` }} />
        </div>
      </div>

      <div className="wrap">
        {showSettings && (
          <SettingsPanel
            accountName={accountName}
            setAccountName={setAccountName}
            authEnabled={authEnabled}
            user={user}
            busy={authBusy}
            error={authError}
            onRegister={createAccount}
            onLogin={signIn}
            onLogout={signOut}
            stats={{ answeredCount, wrongCount, total }}
          />
        )}

        {view === "path" && (
          <PathView
            modules={modules}
            modStats={modStats}
            pathPct={pathPct}
            answeredCount={answeredCount}
            total={total}
            onOpenModule={openModule}
          />
        )}

        {(view === "module" || view === "wrong") && (
          <QuizView
            view={view}
            activeMod={activeMod}
            modules={modules}
            q={q}
            list={list}
            idx={idx}
            revealed={revealed}
            progress={progress}
            onBack={backToPath}
            onChoose={choose}
          />
        )}
      </div>

      {(view === "module" || view === "wrong") && q && (
        <div className="nav">
          <div className="nav-inner">
            <button className="btn" onClick={() => go(-1)} disabled={idx === 0}>
              ← Prev
            </button>
            <button
              className={`btn btn-icon ${
                progress.favorite[q.id] ? "active" : ""
              }`}
              onClick={toggleFav}
              title="Bookmark"
            >
              {progress.favorite[q.id] ? "★" : "☆"}
            </button>
            <div className="spacer" />
            {idx >= list.length - 1 ? (
              <button className="btn btn-primary" onClick={backToPath}>
                Done ✓
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => go(1)}>
                Next →
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Path overview ---------- */
function PathView({
  modules,
  modStats,
  pathPct,
  answeredCount,
  total,
  onOpenModule,
}) {
  return (
    <div>
      <div className="path-head">
        <h1 className="path-title">Your path</h1>
        <p className="path-sub">
          {answeredCount} / {total} questions seen · {pathPct}%
        </p>
      </div>

      <div className="path-list">
        {modules.map((m, i) => {
          const s = modStats(m.id);
          const meta = MOD_META[m.id] || { glyph: "●", c: "#888" };
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <button
              key={m.id}
              className="mod-row"
              onClick={() => onOpenModule(m.id)}
            >
              <span className="mod-step">
                <span
                  className="mod-glyph"
                  style={{ color: meta.c }}
                  aria-hidden="true"
                >
                  {s.complete ? "✓" : meta.glyph}
                </span>
              </span>
              <span className="mod-main">
                <span className="mod-name">
                  {m.en}
                  <span className="mod-name-zh">{m.zh}</span>
                </span>
                <span className="mod-bar-track">
                  <span
                    className="mod-bar-fill"
                    style={{ width: `${pct}%`, background: meta.c }}
                  />
                </span>
                <span className="mod-stat">
                  {s.done}/{s.total}
                  {s.done > 0 && (
                    <span className="mod-acc">
                      {" · "}
                      {Math.round((s.correct / Math.max(s.done, 1)) * 100)}%
                      correct
                    </span>
                  )}
                </span>
              </span>
              <span className="mod-arrow">→</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Quiz (module or wrong-set) ---------- */
function QuizView({
  view,
  activeMod,
  modules,
  q,
  list,
  idx,
  revealed,
  progress,
  onBack,
  onChoose,
}) {
  const modLabel =
    view === "wrong"
      ? "Wrong-answer set"
      : (modules.find((m) => m.id === activeMod) || {}).en;
  const modLabelZh =
    view === "wrong"
      ? "错题集"
      : (modules.find((m) => m.id === activeMod) || {}).zh;

  if (!q) {
    return (
      <div>
        <button className="crumb" onClick={onBack}>
          ← Path
        </button>
        <div className="empty">
          {view === "wrong"
            ? "No questions to review. 全部清空了 🎉"
            : "No questions in this module."}
        </div>
      </div>
    );
  }

  const chosen = view === "module" ? progress.answered[q.id] : undefined;

  return (
    <div>
      <button className="crumb" onClick={onBack}>
        ← Path
      </button>

      <div className="qmeta">
        <span className="qcat">
          {modLabel}
          <span className="qcat-zh"> · {modLabelZh}</span>
        </span>
        <span className="qnum">
          {idx + 1} / {list.length}
        </span>
      </div>

      <div className="qtext-en">{q.question.en}</div>
      <div className="qtext-zh">{q.question["zh-Hans"]}</div>

      {q.imageUrl && <img className="qimage" src={q.imageUrl} alt="sign" />}

      <div className="options">
        {OPTION_KEYS.filter((k) => q.options[k]).map((k) => {
          let cls = "option";
          if (revealed) {
            if (k === q.answer) cls += " correct";
            else if (k === chosen) cls += " wrong";
          }
          return (
            <button
              key={k}
              className={cls}
              disabled={revealed}
              onClick={() => onChoose(k)}
            >
              <span className="option-key">{k}</span>
              <span className="option-body">
                <span className="option-en">{q.options[k].en}</span>
                <span className="option-zh">{q.options[k]["zh-Hans"]}</span>
              </span>
            </button>
          );
        })}
      </div>

      {revealed && q.explanation && (
        <div className="explain">
          <p className="explain-en">{q.explanation.en}</p>
          <p className="explain-zh">{q.explanation["zh-Hans"]}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Settings ---------- */
function SettingsPanel({
  accountName,
  setAccountName,
  authEnabled,
  user,
  busy,
  error,
  onRegister,
  onLogin,
  onLogout,
  stats,
}) {
  const signedIn = Boolean(user);

  return (
    <div className="panel">
      <h3>Passkey account</h3>
      {!authEnabled && (
        <p>Cloud account storage is not configured. Progress is local only.</p>
      )}
      {authEnabled && signedIn && (
        <p>
          Signed in as <strong>{user.name}</strong>. Progress is saved to this
          account.
        </p>
      )}
      {authEnabled && !signedIn && (
        <>
          <p>Create or open an account with Face ID, Touch ID, Windows Hello, or a security key.</p>
          <input
            className="input"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && accountName.trim() && !busy) onRegister();
            }}
            placeholder="Account name"
            autoComplete="username webauthn"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
          />
        </>
      )}

      {authEnabled && (
        <div className="row auth-row">
          {signedIn ? (
            <button className="btn" onClick={onLogout} disabled={busy}>
              Sign out
            </button>
          ) : (
            <>
              <button
                className="btn btn-primary"
                onClick={onRegister}
                disabled={busy || !accountName.trim()}
              >
                Create Passkey
              </button>
              <button className="btn" onClick={onLogin} disabled={busy}>
                Sign in
              </button>
            </>
          )}
          <span className="sync-status">
            <span className={`sync-dot ${signedIn ? "sync-on" : "sync-off"}`} />
            {signedIn ? "Cloud sync active" : "Not signed in"}
          </span>
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-num">{stats.answeredCount}</div>
          <div className="stat-label">Seen</div>
        </div>
        <div className="stat">
          <div className="stat-num">{stats.wrongCount}</div>
          <div className="stat-label">In wrong-set</div>
        </div>
        <div className="stat">
          <div className="stat-num">{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>
    </div>
  );
}
