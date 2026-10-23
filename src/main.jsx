import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileQuestion,
  Headphones,
  LayoutGrid,
  LogOut,
  Menu,
  Mic,
  Pause,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trophy,
  Users,
  X,
  Zap,
  Pencil,
  Trash2,
  CalendarDays,
  LockKeyhole,
} from "lucide-react";
import "./styles.css";
const API = import.meta.env.VITE_API_URL || "";
let token = sessionStorage.getItem("chao-token") || "";
async function api(url, options = {}) {
  const response = await fetch(`${API}/api${url}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== "/login")
      window.dispatchEvent(new Event("chao-session-expired"));
    throw new Error(data.error || "Request failed.");
  }
  return data;
}
const send = (url, data, method = "POST") =>
  api(url, {
    method,
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
const date = (s) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const time = (n) =>
  `${String(Math.floor(Math.max(0, n) / 60)).padStart(2, "0")}:${String(Math.max(0, n) % 60).padStart(2, "0")}`;
const initials = (s) =>
  s
    .split(" ")
    .map((v) => v[0])
    .slice(0, 2)
    .join("");
function Badge({ status }) {
  return (
    <span className={`badge ${status}`}>
      {status === "approved" ? (
        <Check size={12} />
      ) : status === "rejected" ? (
        <X size={12} />
      ) : (
        <Clock3 size={12} />
      )}{" "}
      {status === "approved"
        ? "Approved"
        : status === "rejected"
          ? "Needs changes"
          : "In review"}
    </span>
  );
}
function Modal({ title, description, children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const old = document.activeElement;
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll(
          "button,input,textarea,select,a[href]",
        );
        const items = [...nodes].filter((n) => !n.disabled);
        if (!items.length) return;
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <button className="icon close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="eyebrow">CHAO WORKSPACE</div>
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
        {children}
      </section>
    </div>
  );
}
function AudioPlayer({ file }) {
  const [src, setSrc] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!file) return;
    let url,
      active = true;
    fetch(`${API}/api/audio/${file}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw Error("Recording unavailable.");
        return r.blob();
      })
      .then((b) => {
        url = URL.createObjectURL(b);
        if (active) setSrc(url);
        else URL.revokeObjectURL(url);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  return file ? (
    <div className="audio-player">
      {error ? (
        <small className="error">{error}</small>
      ) : src ? (
        <audio src={src} controls preload="metadata" />
      ) : (
        <small>Loading recording…</small>
      )}
    </div>
  ) : (
    <small className="muted">Sample question · no recording</small>
  );
}
function Recorder({ value, onChange, optional = false }) {
  const [recording, setRecording] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState("");
  const recorder = useRef(),
    stream = useRef();
  useEffect(() => {
    if (!value) {
      setPreview("");
      return;
    }
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function start() {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "Recording needs HTTPS and a supported browser. You can upload audio below.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const r = new MediaRecorder(stream.current);
      recorder.current = r;
      let chunks = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        const type = r.mimeType || "audio/webm";
        onChange(
          new File(
            chunks,
            "recording." + (type.includes("mp4") ? "m4a" : "webm"),
            { type },
          ),
        );
        stream.current.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      r.start();
      setRecording(true);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="record-box">
      <div className="record-row">
        <span className={`record-symbol ${recording ? "recording" : ""}`}>
          <AudioLines size={23} />
        </span>
        <div>
          <strong>
            {recording
              ? "Recording your explanation…"
              : value
                ? "Recording ready"
                : "Let them hear your thinking"}
          </strong>
          <small>
            {optional
              ? "Optional voice note · up to 15 MB"
              : "Record an explanation or upload audio · up to 15 MB"}
          </small>
        </div>
        <button
          className={recording ? "btn danger" : "btn secondary"}
          type="button"
          onClick={() => (recording ? recorder.current.stop() : start())}
        >
          {recording ? <Square size={14} /> : <Mic size={15} />}{" "}
          {recording ? "Stop" : "Record"}
        </button>
      </div>
      {preview && <audio src={preview} controls />}
      <label className="upload-link">
        {value ? "Replace audio file" : "Or upload an audio file"}
        <input
          type="file"
          accept="audio/*,.webm,.m4a"
          onChange={(e) => {
            const f = e.target.files[0];
            if (f?.size > 15 * 1024 * 1024) {
              setError("Choose a file smaller than 15 MB.");
              return;
            }
            onChange(f || null);
          }}
        />
      </label>
      {error && <small className="error">{error}</small>}
    </div>
  );
}
function Login({ onLogin }) {
  const [id, setId] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await send("/login", { userId: id, password });
      token = r.token;
      sessionStorage.setItem("chao-token", token);
      onLogin(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Logo />
        <div className="login-copy">
          <span className="pill">
            <Sparkles size={14} /> A LITTLE CURIOSITY GOES A LONG WAY
          </span>
          <h1>
            Great questions.
            <br />
            Brighter minds.
          </h1>
          <p>
            A space to share what you know, discover something new, and put your
            curiosity to the test.
          </p>
          <div className="login-art">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <div className="art-core">?</div>
            <span className="art-tag tag-one">
              <Zap size={17} /> Think a little faster
            </span>
            <span className="art-tag tag-two">
              <CheckCircle2 size={17} /> Share a little wisdom
            </span>
          </div>
        </div>
        <small>MADE FOR CURIOUS MINDS. BUILT FOR EVERYONE.</small>
      </div>
      <div className="login-panel">
        <div className="login-form">
          <div className="eyebrow">YOUR NEXT CHALLENGE AWAITS</div>
          <h2>Welcome to Chao.</h2>
          <p className="muted">Sign in with the credentials assigned to you.</p>
          <form onSubmit={submit}>
            <label>
              User ID
              <input
                autoComplete="username"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="Enter your user ID"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary full" disabled={busy}>
              {busy ? "Signing in…" : "Enter your workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="login-help">
            <LockKeyhole size={14} /> Need access? Contact your administrator.
          </p>
        </div>
        <small className="login-footer">
          A good question is the beginning of a great discovery.
        </small>
      </div>
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        c<span />
      </span>
      chao<span className="logo-dot">.</span>
    </div>
  );
}
const nav = [
  ["play", "Play challenge", Zap],
  ["submit", "Submit questions", FileQuestion],
  ["review", "Review questions", ShieldCheck],
  ["users", "Manage users", Users],
  ["challenges", "Manage challenges", CalendarDays],
  ["questions", "Manage questions", LayoutGrid],
];
function App() {
  const [auth, setAuth] = useState(null),
    [loading, setLoading] = useState(!!token),
    [tab, setTab] = useState("play"),
    [menu, setMenu] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [revision, setRevision] = useState(0);
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    const expired = () => {
      token = "";
      sessionStorage.removeItem("chao-token");
      setAuth(null);
      setTab("play");
      setMenu(false);
    };
    window.addEventListener("chao-session-expired", expired);
    return () => window.removeEventListener("chao-session-expired", expired);
  }, []);
  useEffect(() => {
    if (token && revision > 0)
      api("/me")
        .then(setAuth)
        .catch(() => {});
  }, [revision]);
  useEffect(() => {
    if (token)
      api("/me")
        .then(setAuth)
        .catch(() => {
          token = "";
          sessionStorage.removeItem("chao-token");
        })
        .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  if (loading)
    return (
      <div className="loading">
        <Logo />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!auth) return <Login onLogin={setAuth} />;
  const user = auth.user;
  async function logout() {
    try {
      await send("/logout", {});
    } catch {
      // Local sign-out still succeeds when the network is unavailable.
    } finally {
      token = "";
      sessionStorage.removeItem("chao-token");
      setAuth(null);
      setTab("play");
    }
  }
  const allowed = nav.filter(
    ([id]) =>
      id === "play" ||
      id === "submit" ||
      (id === "review" && user.role !== "player") ||
      user.role === "admin",
  );
  const current = nav.find((n) => n[0] === tab);
  const props = {
    user,
    revision,
    refresh,
    notify: setToast,
    onError: setError,
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Logo />
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {allowed.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setMenu(false);
                setError("");
              }}
              className={tab === id ? "active" : ""}
            >
              <Icon size={19} />
              {label}
              {tab === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Sparkles size={20} />
          </span>
          <strong>Stay curious.</strong>
          <p>Every question is a chance to see things differently.</p>
          <div className="tiny-line" />
        </div>
        <div className="profile">
          <span className="avatar">{initials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role} account</small>
          </div>
          <button
            className="icon"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menu && <div className="sidebar-shade" onClick={() => setMenu(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{current[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <i /> Let's make it count
            </span>
            <span className="avatar small">{initials(user.name)}</span>
          </div>
        </header>
        <main>
          {auth.demo && (
            <div className="demo-banner">
              <Sparkles size={14} /> Demo workspace · sample questions and
              accounts. Use a separate database for production.
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
              <button
                className="icon"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "play" ? (
            <Challenges {...props} />
          ) : tab === "submit" ? (
            <Submissions {...props} />
          ) : tab === "review" ? (
            <Reviews {...props} />
          ) : tab === "users" ? (
            <ManageUsers {...props} />
          ) : tab === "challenges" ? (
            <ManageChallenges {...props} />
          ) : (
            <ManageQuestions {...props} />
          )}
          <footer>
            <span>
              chao. <span className="footer-divider">/</span> A little wiser,
              every day.
            </span>
            <span>
              Keep asking. Keep growing. <Sparkles size={12} />
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Heading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function useData(url, revision, onError) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    const fetchData = () =>
      api(url)
        .then((d) => active && setData(d))
        .catch((e) => active && onError(e.message));
    fetchData();
    const timer = setInterval(fetchData, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [url, revision]);
  return data;
}
function Empty({ icon: Icon = FileQuestion, title, description }) {
  return (
    <div className="empty">
      <span>
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function Challenges({ revision, refresh, notify, onError, user }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const challenges = useData("/challenges", revision, onError),
    mine = useData("/questions", revision, onError),
    [selected, setSelected] = useState(null),
    [attempt, setAttempt] = useState(null),
    [busy, setBusy] = useState(false);
  const featured =
    challenges?.find((c) => c.active && Date.parse(c.start) <= now) ||
    challenges?.find((c) => c.active);
  const chosen = selected || featured?.id || challenges?.[0]?.id;
  const board = useData(
    chosen ? `/leaderboard/${chosen}` : "/challenges",
    revision,
    onError,
  );
  async function start(c) {
    setBusy(true);
    try {
      const a = await send(`/challenges/${c.id}/start`, {});
      setAttempt(a);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const completed = challenges?.filter((c) => c.attempt?.finished).length || 0;
  return (
    <>
      <Heading
        eyebrow="THE CURIOSITY CLUB"
        title={`A little challenge. A lot of possibility.`}
        description={`Welcome back, ${user.name.split(" ")[0]}. Ready to give your mind something to play with?`}
      />
      <div className="dashboard-grid">
        <div className="dashboard-left">
          <section className="hero-card">
            <div className="hero-grid" />
            <div className="hero-content">
              <span className="hero-label">
                <i />
                {featured
                  ? Date.parse(featured.start) > now
                    ? "COMING UP NEXT"
                    : "YOUR NEXT CHALLENGE"
                  : "MAKE ROOM FOR CURIOSITY"}
              </span>
              <h2>{featured?.name || "Your next great challenge awaits."}</h2>
              <p>
                A quick mind. A ticking clock. How many answers can you find?
              </p>
              <div className="hero-meta">
                <span>
                  <Clock3 size={16} />
                  {featured
                    ? `${featured.duration / 60} minutes`
                    : "Timed challenges"}
                </span>
                <span>
                  <Zap size={16} />1 point per answer
                </span>
              </div>
              {featured ? (
                <button
                  className="btn gold"
                  disabled={busy || Date.parse(featured.start) > now}
                  onClick={() => start(featured)}
                >
                  {featured.attempt?.finished
                    ? "View your result"
                    : featured.attempt
                      ? "Continue challenge"
                      : Date.parse(featured.start) > now
                        ? date(featured.start)
                        : "Start challenge"}
                  <ArrowRight size={17} />
                </button>
              ) : (
                <span className="hero-wait">
                  Your administrator will schedule the next challenge.
                </span>
              )}
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-ring r1" />
              <div className="art-ring r2" />
              <div className="art-ring r3" />
              <span className="hero-star star1">✦</span>
              <span className="hero-star star2">✧</span>
              <div className="bolt">
                <Zap size={108} strokeWidth={1.2} fill="currentColor" />
              </div>
              <span className="art-caption">READY. SET. THINK.</span>
            </div>
          </section>
          <div className="stat-grid">
            <Stat
              icon={FileQuestion}
              label="Questions contributed"
              value={mine?.length ?? "—"}
              note="A little knowledge, shared."
            />
            <Stat
              icon={Trophy}
              label="Challenges completed"
              value={completed}
              note="Every attempt is a step forward."
            />
            <Stat
              icon={CheckCircle2}
              label="Questions approved"
              value={mine?.filter((q) => q.status === "approved").length ?? "—"}
              note="Good questions make great games."
            />
          </div>
          <section className="panel how-panel">
            <div className="section-heading">
              <h2>A small guide to a great game</h2>
              <span className="soft-icon">
                <Sparkles size={18} />
              </span>
            </div>
            <div className="steps">
              <div>
                <span className="step-number">01</span>
                <h3>Find your focus</h3>
                <p>
                  Once you start, the clock starts too. Make every second count.
                </p>
              </div>
              <div>
                <span className="step-number">02</span>
                <h3>Connect the dots</h3>
                <p>
                  Use the character count to find the exact answer. Correct?
                  Keep going.
                </p>
              </div>
              <div>
                <span className="step-number">03</span>
                <h3>See where you stand</h3>
                <p>
                  Your final score joins the leaderboard when your challenge
                  ends.
                </p>
              </div>
            </div>
            <div className="fair-play">
              <ShieldCheck size={17} />
              <span>
                A level playing field. You won’t see questions you submitted or
                reviewed.
              </span>
            </div>
          </section>
          <section className="challenge-list">
            <div className="section-heading">
              <h2>
                All challenges{" "}
                <span className="count">{challenges?.length || 0}</span>
              </h2>
              <span className="muted small-text">
                Your next opportunity to think big
              </span>
            </div>
            {!challenges ? (
              <p className="muted">Loading challenges…</p>
            ) : challenges.length === 0 ? (
              <Empty
                icon={CalendarDays}
                title="Something good is coming"
                description="New challenges will appear here when your admin creates them."
              />
            ) : (
              challenges.map((c) => (
                <div className="challenge-row" key={c.id}>
                  <span
                    className={`challenge-icon ${!c.active ? "inactive" : ""}`}
                  >
                    <Zap size={22} />
                  </span>
                  <div className="grow">
                    <h3>{c.name}</h3>
                    <p>
                      {date(c.start)} <span>·</span> {c.duration / 60} min
                    </p>
                  </div>
                  <span
                    className={`status-dot ${c.attempt?.finished ? "done" : !c.active ? "off" : Date.parse(c.start) > now ? "soon" : "live"}`}
                  >
                    {c.attempt?.finished
                      ? "Completed"
                      : !c.active
                        ? "Inactive"
                        : Date.parse(c.start) > now
                          ? "Upcoming"
                          : "Open now"}
                  </span>
                  <button
                    className="btn secondary compact"
                    disabled={
                      busy ||
                      (!c.active && !c.attempt) ||
                      Date.parse(c.start) > now
                    }
                    onClick={() => start(c)}
                  >
                    {c.attempt?.finished
                      ? "Result"
                      : c.attempt
                        ? "Resume"
                        : "Play"}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
        <aside className="dashboard-right">
          <section className="panel leaderboard">
            <div className="section-heading">
              <div className="title-icon">
                <Trophy size={19} />
                <h2>The leaderboard</h2>
              </div>
              <span className="live-tag">FINAL SCORES</span>
            </div>
            <p className="muted">A little friendly competition.</p>
            {challenges?.length > 0 && (
              <select
                aria-label="Leaderboard challenge"
                value={chosen || ""}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {challenges.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {chosen && board?.length > 0 ? (
              <div className="ranking">
                {board.map((p, i) => (
                  <div
                    className={`rank-row ${p.user_id === user.id ? "is-you" : ""}`}
                    key={p.user_id}
                  >
                    <span className={`rank rank-${i}`}>
                      {i === 0 ? (
                        <Trophy size={16} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <span className="avatar mini">{initials(p.name)}</span>
                    <div className="grow">
                      <strong>
                        {p.name}
                        {p.user_id === user.id && <small> You</small>}
                      </strong>
                      <small>Challenge completed</small>
                    </div>
                    <b>
                      {p.score}
                      <small>pts</small>
                    </b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="leader-empty">
                <span>
                  <Trophy size={31} />
                </span>
                <h3>The top spot is waiting.</h3>
                <p>Complete a challenge to put your name on the board.</p>
              </div>
            )}
            <div className="leader-footer">
              <Users size={14} /> Scores are visible to everyone in Chao.
            </div>
          </section>
          <section className="thought-card">
            <span className="quote">“</span>
            <div className="eyebrow">A THOUGHT TO TAKE WITH YOU</div>
            <p>The important thing is not to stop questioning.</p>
            <span className="quote-author">
              ALBERT EINSTEIN <span>—</span>
            </span>
            <Sparkles className="thought-spark" size={32} />
          </section>
          <div className="community-note">
            <span className="soft-icon">
              <Headphones size={21} />
            </span>
            <div>
              <h3>Knowledge has a voice.</h3>
              <p>
                Submit a question with an audio explanation. Help someone
                discover their next “aha”.
              </p>
            </div>
          </div>
        </aside>
      </div>
      {attempt && (
        <Game
          initial={attempt}
          onClose={() => {
            setAttempt(null);
            refresh();
          }}
          onError={onError}
        />
      )}
    </>
  );
}
function Stat({ icon: Icon, label, value, note }) {
  return (
    <div className="stat-card">
      <div>
        <span className="stat-icon">
          <Icon size={18} />
        </span>
        <span className="stat-value">{value}</span>
      </div>
      <h3>{label}</h3>
      <p>{note}</p>
    </div>
  );
}
function Game({ initial, onClose, onError }) {
  const [a, setA] = useState(initial),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [left, setLeft] = useState(initial.remaining);
  const deadline = useRef(Date.now() + initial.remaining * 1000),
    input = useRef();
  useEffect(() => {
    input.current?.focus();
  }, [a.question?.id]);
  useEffect(() => {
    if (a.finished) return;
    const t = setInterval(
      () =>
        setLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))),
      250,
    );
    const sync = setInterval(
      () =>
        api(`/attempts/${a.id}`)
          .then((v) => {
            setA(v);
            deadline.current = Date.now() + v.remaining * 1000;
          })
          .catch((e) => onError(e.message)),
      5000,
    );
    return () => {
      clearInterval(t);
      clearInterval(sync);
    };
  }, [a.id, a.finished]);
  useEffect(() => {
    if (left === 0 && !a.finished)
      api(`/attempts/${a.id}`)
        .then(setA)
        .catch((e) => onError(e.message));
  }, [left]);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await send(`/attempts/${a.id}/answer`, {
        answer,
        questionId: a.question.id,
      });
      setA(r);
      deadline.current = Date.now() + r.remaining * 1000;
      if (r.correct) {
        setAnswer("");
        setFeedback("");
      } else setFeedback("Not quite. Take another look and try again.");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    try {
      setA(await send(`/attempts/${a.id}/finish`, {}));
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={a.finished ? "A little wiser. Nicely played." : a.challenge.name}
      description={
        a.finished
          ? "Your score is now on the public leaderboard."
          : "Find the exact answer. Letter case and outer spaces are ignored."
      }
      onClose={onClose}
    >
      {a.finished ? (
        <div className="result">
          <span className="result-trophy">
            <Trophy size={44} />
          </span>
          <strong>{a.score}</strong>
          <p>questions answered correctly</p>
          <button className="btn primary full" onClick={onClose}>
            Back to the leaderboard
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="game-bar">
            <span>
              <Zap size={16} /> {a.score} points
            </span>
            <span className={left < 30 ? "error" : ""}>
              <Clock3 size={17} />
              {time(left)}
            </span>
          </div>
          <div className="game-question">
            <div className="eyebrow">
              QUESTION {a.score + 1} OF {a.total}
            </div>
            <h2>{a.question?.text}</h2>
            <span className="character-count">
              {a.question?.characters} characters in the answer
            </span>
          </div>
          <form onSubmit={submit}>
            <label>
              Your answer
              <input
                ref={input}
                autoComplete="off"
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setFeedback("");
                }}
                placeholder="A little thinking goes a long way…"
                required
                maxLength={100}
              />
            </label>
            {feedback && (
              <p className="error" role="status">
                {feedback}
              </p>
            )}
            <button className="btn primary full" disabled={busy || !left}>
              Check answer
              <ArrowRight size={17} />
            </button>
          </form>
          <button className="text-button" onClick={finish} disabled={busy}>
            Finish now & submit score
          </button>
          <p className="muted small-text">
            Closing this window keeps the timer running. You can resume from the
            challenge card.
          </p>
        </>
      )}
    </Modal>
  );
}
function QuestionForm({ question, onClose, onSaved, onError }) {
  const [text, setText] = useState(question?.question || ""),
    [answer, setAnswer] = useState(question?.answer || ""),
    [audio, setAudio] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      f.append("question", text);
      f.append("answer", answer);
      if (audio) f.append("audio", audio);
      await send(
        question ? `/questions/${question.id}` : "/questions",
        f,
        question ? "PUT" : "POST",
      );
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        question
          ? "Give your question another look."
          : "Every great game starts with a question."
      }
      description="Share something worth knowing. Keep the answer clear and explain the thinking behind it."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Your question
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What would you like to ask?"
            rows={3}
            minLength={5}
            maxLength={1000}
            required
          />
        </label>
        <label>
          The answer <span className="label-note">In English</span>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="One clear, exact answer"
            maxLength={100}
            required
          />
        </label>
        <label>
          Explain your answer <span className="label-note">Audio</span>
        </label>
        {question?.audio && <AudioPlayer file={question.audio} />}
        <Recorder value={audio} onChange={setAudio} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy
              ? "Submitting…"
              : question?.status === "rejected"
                ? "Resubmit for review"
                : question
                  ? "Save changes"
                  : "Submit for review"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Submissions(props) {
  const { revision, refresh, notify, onError } = props;
  const questions = useData("/questions", revision, onError),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState(null);
  const filtered = questions?.filter(
    (q) =>
      (filter === "all" || q.status === filter) &&
      q.question.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="SHARE A LITTLE WISDOM"
        title="Good questions start here."
        description="Your curiosity could be someone else’s next discovery."
      >
        <button className="btn primary" onClick={() => setEditing({})}>
          <Plus size={17} />
          New question
        </button>
      </Heading>
      <div className="stat-grid submission-stats">
        <Stat
          icon={FileQuestion}
          label="Questions submitted"
          value={questions?.length ?? "—"}
          note="Your contributions to the community"
        />
        <Stat
          icon={Clock3}
          label="Awaiting review"
          value={questions?.filter((q) => q.status === "pending").length ?? "—"}
          note="In the hands of a curious mind"
        />
        <Stat
          icon={CheckCircle2}
          label="Approved & ready"
          value={
            questions?.filter((q) => q.status === "approved").length ?? "—"
          }
          note="Locked and ready for a challenge"
        />
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Your questions</h2>
          <div className="search">
            <Search size={16} />
            <input
              aria-label="Search questions"
              placeholder="Find a question…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="filters">
          {[
            ["all", "All questions"],
            ["pending", "In review"],
            ["approved", "Approved"],
            ["rejected", "Needs changes"],
          ].map(([id, label]) => (
            <button
              className={filter === id ? "selected" : ""}
              onClick={() => setFilter(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </div>
        {!questions ? (
          <p>Loading your questions…</p>
        ) : !filtered.length ? (
          <Empty
            title="A good question is a good beginning."
            description="Submit your first question, or try another filter."
          />
        ) : (
          filtered.map((q) => (
            <article className="question-card" key={q.id}>
              <div className="question-top">
                <span className="muted small-text">
                  QUESTION #{String(q.id).padStart(3, "0")}
                </span>
                <Badge status={q.status} />
              </div>
              <h3>{q.question}</h3>
              <div className="answer-line">
                <span>Answer</span>
                <strong>{q.answer}</strong>
              </div>
              <AudioPlayer file={q.audio} />
              {q.status === "rejected" && (
                <div className="rejection">
                  <strong>A note from your reviewer</strong>
                  <p>{q.reason}</p>
                  <AudioPlayer file={q.reason_audio} />
                </div>
              )}
              <div className="question-bottom">
                <small className="muted">
                  Submitted {date(q.created + "Z")}
                </small>
                {q.status === "approved" ? (
                  <span className="locked">
                    <LockKeyhole size={13} /> Approved & locked
                  </span>
                ) : (
                  <button
                    className="btn secondary compact"
                    onClick={() => setEditing(q)}
                  >
                    <Pencil size={14} />
                    {q.status === "rejected"
                      ? "Edit & resubmit"
                      : "Edit question"}
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
      {editing && (
        <QuestionForm
          question={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
            notify(
              "Question sent to review. Thanks for sharing your curiosity!",
            );
          }}
        />
      )}
    </>
  );
}
function Reviews({ revision, refresh, notify, onError }) {
  const questions = useData("/reviews", revision, onError),
    [reject, setReject] = useState(null),
    [reason, setReason] = useState(""),
    [audio, setAudio] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function review(q, status) {
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      f.append("status", status);
      f.append("reason", reason);
      if (audio) f.append("audio", audio);
      await send(`/reviews/${q.id}`, f);
      setReject(null);
      setReason("");
      setAudio(null);
      refresh();
      notify(
        status === "approved"
          ? "Question approved and locked."
          : "Feedback sent. The author can edit and resubmit.",
      );
    } catch (e) {
      if (status === "rejected") setError(e.message);
      else onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="A SECOND PAIR OF CURIOUS EYES"
        title="Help good questions shine."
        description="Listen, check the answer, and give each question a thoughtful review."
      />
      <div className="info-strip">
        <ShieldCheck size={21} />
        <div>
          <strong>Randomly assigned. Carefully reviewed.</strong>
          <p>
            You’ll only see questions assigned to you. Approved questions are
            locked; rejected questions return to the author with your feedback.
          </p>
        </div>
        <span className="count">{questions?.length || 0} waiting</span>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Your review queue</h2>
        </div>
        {!questions ? (
          <p>Loading your queue…</p>
        ) : questions.length === 0 ? (
          <Empty
            icon={CheckCircle2}
            title="You’re all caught up."
            description="New questions will appear here when they’re assigned to you."
          />
        ) : (
          questions.map((q) => (
            <article className="question-card" key={q.id}>
              <div className="question-top">
                <span className="muted small-text">
                  QUESTION #{q.id} · BY {q.author_name || "DELETED USER"}
                </span>
                <Badge status={q.status} />
              </div>
              <h3>{q.question}</h3>
              <div className="answer-line">
                <span>Answer</span>
                <strong>{q.answer}</strong>
              </div>
              <AudioPlayer file={q.audio} />
              <div className="question-bottom">
                <small className="muted">
                  Check accuracy, clarity, and the audio explanation.
                </small>
                <div className="button-group">
                  <button
                    className="btn secondary compact"
                    disabled={busy}
                    onClick={() => {
                      setReject(q);
                      setReason("");
                      setAudio(null);
                      setError("");
                    }}
                  >
                    <X size={14} />
                    Request changes
                  </button>
                  <button
                    className="btn primary compact"
                    disabled={busy}
                    onClick={() => review(q, "approved")}
                  >
                    <Check size={14} />
                    Approve
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
      {reject && (
        <Modal
          title="A little feedback goes a long way."
          description="Explain what needs to change. You can add an audio note too."
          onClose={() => setReject(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              review(reject, "rejected");
            }}
          >
            <label>
              Reason for rejection
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={2000}
                rows={4}
                placeholder="What could make this question clearer or more accurate?"
              />
            </label>
            <Recorder value={audio} onChange={setAudio} optional />
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setReject(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                Send feedback
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function ManageUsers({ revision, refresh, notify, onError, user }) {
  const users = useData("/admin/users", revision, onError),
    [editing, setEditing] = useState(null),
    [removing, setRemoving] = useState(null),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.target);
    try {
      await send(
        editing.id ? `/admin/users/${editing.id}` : "/admin/users",
        Object.fromEntries(f),
        editing.id ? "PUT" : "POST",
      );
      setEditing(null);
      refresh();
      notify("User account saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/admin/users/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      refresh();
      notify("User account deleted.");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="PEOPLE MAKE THE COMMUNITY"
        title="A place for every curious mind."
        description="Create accounts, assign roles, and keep your community moving."
      >
        <button
          className="btn primary"
          onClick={() => {
            setEditing({});
            setError("");
          }}
        >
          <Plus size={17} />
          Create user
        </button>
      </Heading>
      <section className="panel">
        <div className="section-heading">
          <h2>
            Community members{" "}
            <span className="count">{users?.length || 0}</span>
          </h2>
          <div className="search">
            <Search size={16} />
            <input
              aria-label="Search users"
              placeholder="Search people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>User ID</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users
                ?.filter((u) =>
                  `${u.name} ${u.id}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="person">
                        <span className="avatar mini">{initials(u.name)}</span>
                        <strong>{u.name}</strong>
                      </div>
                    </td>
                    <td>
                      <code>{u.id}</code>
                    </td>
                    <td>
                      <span className={`role-tag ${u.role}`}>{u.role}</span>
                    </td>
                    <td>
                      <div className="button-group">
                        <button
                          className="icon"
                          title={`Edit ${u.name}`}
                          onClick={() => {
                            setEditing(u);
                            setError("");
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon danger-text"
                          title={`Delete ${u.name}`}
                          disabled={u.id === user.id}
                          onClick={() => setRemoving(u)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {users?.length === 0 && (
          <Empty
            icon={Users}
            title="Your community starts here."
            description="Create a user to get started."
          />
        )}
      </section>
      {editing && (
        <Modal
          title={
            editing.id
              ? "Keep their details up to date."
              : "Invite a curious mind."
          }
          description="Share these credentials with the user securely. They’ll use them on the website and mobile app."
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save}>
            <label>
              User ID
              <input
                name="id"
                defaultValue={editing.id}
                readOnly={editing.id === user.id}
                pattern="[A-Za-z0-9_.\-]{2,40}"
                required
                placeholder="e.g. jamie.parker"
              />
            </label>
            <label>
              Full name
              <input
                name="name"
                defaultValue={editing.name}
                required
                maxLength={80}
                placeholder="Their name"
              />
            </label>
            <label>
              {editing.id
                ? "New password (leave blank to keep current)"
                : "Password"}
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={10}
                required={!editing.id}
                placeholder="At least 10 characters"
              />
            </label>
            <label>
              Role
              <select name="role" defaultValue={editing.role || "player"}>
                <option value="player">Player · submit & play</option>
                <option value="reviewer">
                  Reviewer · submit, play & review
                </option>
                <option value="admin">Admin · full workspace access</option>
              </select>
            </label>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                Save user
                <Check size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          title={`Delete ${removing.name}?`}
          description="This permanently removes their account and scores. Their questions remain, with the author marked as deleted."
          onClose={() => setRemoving(null)}
        >
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setRemoving(null)}>
              Keep user
            </button>
            <button className="btn danger" onClick={remove} disabled={busy}>
              Delete user
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ManageChallenges({ revision, refresh, notify, onError }) {
  const challenges = useData("/challenges", revision, onError),
    [adding, setAdding] = useState(false),
    [deactivating, setDeactivating] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    setBusy(true);
    setError("");
    try {
      await send("/admin/challenges", {
        name: f.name,
        duration: Number(f.duration),
        start: new Date(f.start).toISOString(),
      });
      setAdding(false);
      refresh();
      notify("Challenge created. Let the thinking begin.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivate() {
    setBusy(true);
    try {
      await send(
        `/admin/challenges/${deactivating.id}`,
        { active: false },
        "PUT",
      );
      setDeactivating(null);
      refresh();
      notify("Challenge deactivated. All active attempts have ended.");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="SET THE NEXT CHALLENGE"
        title="Give curiosity a starting line."
        description="Choose a name, set the clock, and let your community take it from there."
      >
        <button
          className="btn primary"
          onClick={() => {
            setAdding(true);
            setError("");
          }}
        >
          <Plus size={17} />
          Create challenge
        </button>
      </Heading>
      <div className="info-strip">
        <Clock3 size={21} />
        <div>
          <strong>One attempt. A fair clock for everyone.</strong>
          <p>
            Each player gets the full time limit from when they start.
            Deactivating a challenge ends all active attempts.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Your challenges</h2>
        </div>
        {!challenges ? (
          <p>Loading challenges…</p>
        ) : !challenges.length ? (
          <Empty
            icon={Zap}
            title="Set something in motion."
            description="Create the first challenge for your community."
          />
        ) : (
          challenges.map((c) => (
            <div className="challenge-row" key={c.id}>
              <span className="challenge-icon">
                <Zap size={22} />
              </span>
              <div className="grow">
                <h3>{c.name}</h3>
                <p>
                  {date(c.start)} · {c.duration} seconds per player
                </p>
              </div>
              <span
                className={`status-dot ${!c.active ? "off" : Date.parse(c.start) > Date.now() ? "soon" : "live"}`}
              >
                {!c.active
                  ? "Inactive"
                  : Date.parse(c.start) > Date.now()
                    ? "Scheduled"
                    : "Open"}
              </span>
              {!!c.active && (
                <button
                  className="btn secondary compact"
                  onClick={() => setDeactivating(c)}
                >
                  <Pause size={14} />
                  Deactivate
                </button>
              )}
            </div>
          ))
        )}
      </section>
      {adding && (
        <Modal
          title="Something worth thinking about."
          description="Start date and time use your device’s local timezone."
          onClose={() => setAdding(false)}
        >
          <form onSubmit={save}>
            <label>
              Challenge name
              <input
                name="name"
                required
                maxLength={100}
                placeholder="e.g. The Friday brain sprint"
              />
            </label>
            <label>
              Time limit (seconds)
              <input
                name="duration"
                type="number"
                min={10}
                max={7200}
                step={1}
                defaultValue={180}
                required
              />
            </label>
            <label>
              Start date & time
              <input
                name="start"
                type="datetime-local"
                defaultValue={new Date(
                  Date.now() - new Date().getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                Create challenge
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deactivating && (
        <Modal
          title="Bring this challenge to a close?"
          description="Players will no longer be able to start. Running attempts will end and their scores will be published."
          onClose={() => setDeactivating(null)}
        >
          <div className="modal-actions">
            <button
              className="btn secondary"
              onClick={() => setDeactivating(null)}
            >
              Keep it open
            </button>
            <button className="btn danger" disabled={busy} onClick={deactivate}>
              Deactivate challenge
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ManageQuestions({ revision, onError }) {
  const data = useData("/admin/stats", revision, onError),
    [filter, setFilter] = useState("all");
  return (
    <>
      <Heading
        eyebrow="THE KNOWLEDGE BEHIND THE GAME"
        title="See the bigger picture."
        description="Keep an eye on contributions, review queues, and the questions bringing your community together."
      />
      <section className="panel">
        <div className="section-heading">
          <h2>Contributions by member</h2>
          <span className="soft-icon">
            <Users size={19} />
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Submitted</th>
                <th>Approved</th>
                <th>Awaiting their review</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="person">
                      <span className="avatar mini">{initials(u.name)}</span>
                      <div>
                        <strong>{u.name}</strong>
                        <small className="muted">{u.id}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`role-tag ${u.role}`}>{u.role}</span>
                  </td>
                  <td>{u.submitted}</td>
                  <td>{u.approved}</td>
                  <td>{u.role === "player" ? "—" : u.pending_reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel question-bank">
        <div className="section-heading">
          <h2>
            The question bank{" "}
            <span className="count">{data?.questions.length || 0}</span>
          </h2>
          <select
            aria-label="Filter question bank"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">In review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Needs changes</option>
          </select>
        </div>
        {data?.questions
          .filter((q) => filter === "all" || q.status === filter)
          .map((q) => (
            <details className="bank-question" key={q.id}>
              <summary>
                <span className="grow">
                  {q.question}
                  <small>
                    By {q.author_name || "Deleted user"} · Reviewer:{" "}
                    {q.reviewer_name || "Unassigned"}
                  </small>
                </span>
                <Badge status={q.status} />
                <ChevronRight size={16} />
              </summary>
              <div className="bank-detail">
                <div className="answer-line">
                  <span>Answer</span>
                  <strong>{q.answer}</strong>
                </div>
                <AudioPlayer file={q.audio} />
                {q.reason && (
                  <div className="rejection">
                    <p>{q.reason}</p>
                    <AudioPlayer file={q.reason_audio} />
                  </div>
                )}
              </div>
            </details>
          ))}
        {data?.questions.length === 0 && (
          <Empty
            title="The question bank is waiting."
            description="Your community’s questions will appear here."
          />
        )}
      </section>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
