import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const hash = (s) => createHash("sha256").update(s).digest("hex");
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
export function createApp({
  dataDir = process.env.DATA_DIR || "./data/production",
  demo = false,
  bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD,
} = {}) {
  mkdirSync(dataDir, { recursive: true });
  const uploadDir = path.resolve(dataDir, "audio");
  mkdirSync(uploadDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "chao.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('player','reviewer','admin')));
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY,author TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,question TEXT NOT NULL,answer TEXT NOT NULL,audio TEXT,reviewer TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,status TEXT NOT NULL DEFAULT 'pending',reason TEXT,reason_audio TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS seen(question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,PRIMARY KEY(question_id,user_id));
    CREATE TABLE IF NOT EXISTS challenges(id INTEGER PRIMARY KEY,name TEXT NOT NULL,duration INTEGER NOT NULL,start TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY,challenge_id INTEGER NOT NULL REFERENCES challenges(id),user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,started INTEGER NOT NULL,finished INTEGER,score INTEGER NOT NULL DEFAULT 0,queue TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0,UNIQUE(challenge_id,user_id));`);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  if (!one("SELECT id FROM users LIMIT 1")) {
    if (demo) {
      for (const [id, name, role] of [
        ["admin", "Alex Morgan", "admin"],
        ["player", "Jamie Parker", "player"],
        ["reviewer", "Sam Rivera", "reviewer"],
        ["curator", "Chao Studio", "player"],
      ])
        run(
          "INSERT INTO users VALUES(?,?,?,?)",
          id,
          name,
          bcrypt.hashSync("ChaoDemo2026!", 10),
          role,
        );
      const samples = [
        ["What has keys but cannot open a lock?", "piano"],
        ["What planet is known as the Red Planet?", "Mars"],
        ["What do bees make?", "honey"],
        ["Which ocean is the largest?", "Pacific"],
        ["What is the opposite of ancient?", "modern"],
        ["What has a neck but no head?", "bottle"],
        ["What is frozen water called?", "ice"],
        ["What instrument has six strings?", "guitar"],
        ["What is the largest land animal?", "elephant"],
        [
          "What do you call a group of stars forming a pattern?",
          "constellation",
        ],
        ["Which season comes after spring?", "summer"],
        ["What can you catch but never throw?", "cold"],
      ];
      for (const [i, [q, a]] of samples.entries()) {
        const sampleReviewer = i % 2 ? "admin" : "reviewer";
        const r = run(
          "INSERT INTO questions(author,question,answer,reviewer,status) VALUES('curator',?,?,?,'approved')",
          q,
          a,
          sampleReviewer,
        );
        run(
          "INSERT INTO seen VALUES(?,?)",
          Number(r.lastInsertRowid),
          sampleReviewer,
        );
      }
      run(
        "INSERT INTO challenges(name,duration,start) VALUES(?,?,?)",
        "The daily brain sprint",
        180,
        new Date(Date.now() - 60000).toISOString(),
      );
    } else if (bootstrapPassword && bootstrapPassword.length >= 10)
      run(
        "INSERT INTO users VALUES(?,?,?,?)",
        "admin",
        "Administrator",
        bcrypt.hashSync(bootstrapPassword, 12),
        "admin",
      );
    else
      throw new Error(
        "Set BOOTSTRAP_ADMIN_PASSWORD (at least 10 characters) for the first production start, or CHAO_DEMO=1 for local demo data.",
      );
  }
  function assign() {
    for (const q of all(
      "SELECT id,author FROM questions WHERE status='pending' AND reviewer IS NULL",
    )) {
      const reviewers = all(
        "SELECT id FROM users WHERE role IN ('reviewer','admin') AND id != ?",
        q.author || "",
      );
      if (reviewers.length) {
        const id = reviewers[Math.floor(Math.random() * reviewers.length)].id;
        run("UPDATE questions SET reviewer=? WHERE id=?", id, q.id);
        run("INSERT OR IGNORE INTO seen VALUES(?,?)", q.id, id);
      }
    }
  }
  assign();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .filter(Boolean);
  app.use((req, res, next) => {
    if (allowed.includes(req.headers.origin)) {
      res.set("Access-Control-Allow-Origin", req.headers.origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
      res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.get("/api/health", (_, res) => res.json({ ok: true }));
  const logins = new Map();
  app.post("/api/login", (req, res) => {
    const key = req.ip,
      now = Date.now();
    const bucket = logins.get(key) || { count: 0, reset: now + 60000 };
    if (now > bucket.reset) {
      bucket.count = 0;
      bucket.reset = now + 60000;
    }
    bucket.count++;
    logins.set(key, bucket);
    if (logins.size > 10000)
      for (const [k, v] of logins) if (v.reset < now) logins.delete(k);
    if (bucket.count > 20)
      fail(429, "Too many login attempts. Please wait one minute.");
    const u = one(
      "SELECT * FROM users WHERE id=?",
      String(req.body.userId || ""),
    );
    if (!u || !bcrypt.compareSync(String(req.body.password || ""), u.password))
      fail(401, "User ID or password is incorrect.");
    const token = randomBytes(32).toString("hex");
    run("DELETE FROM sessions WHERE expires < ?", now);
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      u.id,
      now + 7 * 86400000,
    );
    res.json({ token, user: { id: u.id, name: u.name, role: u.role }, demo });
  });
  app.use("/api", (req, res, next) => {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const u = one(
      "SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
      hash(token),
      Date.now(),
    );
    if (!u)
      return res.status(401).json({ error: "Please sign in to continue." });
    req.user = u;
    req.sessionToken = hash(token);
    res.set("Cache-Control", "no-store");
    next();
  });
  const admin = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : res.status(403).json({ error: "Administrator access required." });
  const reviewer = (req, res, next) =>
    ["admin", "reviewer"].includes(req.user.role)
      ? next()
      : res.status(403).json({ error: "Reviewer access required." });
  app.get("/api/me", (req, res) => res.json({ user: req.user, demo }));
  app.post("/api/logout", (req, res) => {
    run("DELETE FROM sessions WHERE token=?", req.sessionToken);
    res.json({ ok: true });
  });
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_, file, cb) =>
        cb(
          null,
          randomBytes(20).toString("hex") +
            ({
              "audio/wav": ".wav",
              "audio/x-wav": ".wav",
              "audio/mpeg": ".mp3",
              "audio/mp4": ".m4a",
              "audio/aac": ".aac",
              "audio/ogg": ".ogg",
            }[file.mimetype.split(";")[0]] || ".webm"),
        ),
    }),
    limits: { fileSize: 15 * 1024 * 1024, files: 2 },
    fileFilter: (_, file, cb) =>
      cb(
        null,
        [
          "audio/webm",
          "audio/mp4",
          "audio/mpeg",
          "audio/wav",
          "audio/x-wav",
          "audio/ogg",
          "audio/aac",
          "video/webm",
        ].includes(file.mimetype.split(";")[0]),
      ),
  });
  app.get("/api/audio/:file", (req, res) => {
    const f = req.params.file;
    if (!/^[a-f0-9]{40}\.(wav|mp3|m4a|aac|ogg|webm)$/.test(f))
      fail(404, "Recording not found.");
    const q = one(
      "SELECT author,reviewer FROM questions WHERE audio=? OR reason_audio=?",
      f,
      f,
    );
    if (!q) fail(404, "Recording not found.");
    if (
      req.user.role !== "admin" &&
      q.author !== req.user.id &&
      q.reviewer !== req.user.id
    )
      fail(403, "Recording is private.");
    res.set("X-Content-Type-Options", "nosniff");
    res.type(
      {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".webm": "audio/webm",
      }[path.extname(f)],
    );
    res.sendFile(path.join(uploadDir, f));
  });
  app.get("/api/questions", (req, res) =>
    res.json(
      all(
        "SELECT q.*,u.name AS author_name FROM questions q LEFT JOIN users u ON u.id=q.author WHERE author=? ORDER BY id DESC",
        req.user.id,
      ),
    ),
  );
  const questionInput = (req) => {
    const question = String(req.body.question || "").trim(),
      answer = String(req.body.answer || "").trim();
    if (question.length < 5 || question.length > 1000)
      fail(400, "Question must contain 5–1,000 characters.");
    if (
      answer.length < 1 ||
      answer.length > 100 ||
      !/[A-Za-z]/.test(answer) ||
      !/^[A-Za-z0-9 ,.!?'’-]+$/.test(answer)
    )
      fail(400, "Use a short answer in English (1–100 characters).");
    return { question, answer };
  };
  app.post("/api/questions", upload.single("audio"), (req, res) => {
    const { question, answer } = questionInput(req);
    if (!req.file)
      fail(400, "Record or upload an audio explanation (up to 15 MB).");
    const r = run(
      "INSERT INTO questions(author,question,answer,audio) VALUES(?,?,?,?)",
      req.user.id,
      question,
      answer,
      req.file.filename,
    );
    assign();
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.put("/api/questions/:id", upload.single("audio"), (req, res) => {
    const q = one("SELECT * FROM questions WHERE id=?", req.params.id);
    if (!q || q.author !== req.user.id) fail(404, "Question not found.");
    if (q.status === "approved") fail(409, "Approved questions are locked.");
    const { question, answer } = questionInput(req);
    if (q.status === "rejected") {
      run(
        "UPDATE questions SET question=?,answer=?,audio=?,status='pending',reason=NULL,reason_audio=NULL,reviewer=NULL WHERE id=?",
        question,
        answer,
        req.file?.filename || q.audio,
        q.id,
      );
      assign();
    } else
      run(
        "UPDATE questions SET question=?,answer=?,audio=? WHERE id=?",
        question,
        answer,
        req.file?.filename || q.audio,
        q.id,
      );
    res.json({ ok: true });
  });
  app.get("/api/reviews", reviewer, (req, res) =>
    res.json(
      all(
        "SELECT q.*,u.name AS author_name FROM questions q LEFT JOIN users u ON u.id=q.author WHERE reviewer=? AND status='pending' ORDER BY id",
        req.user.id,
      ),
    ),
  );
  app.post("/api/reviews/:id", reviewer, upload.single("audio"), (req, res) => {
    const q = one("SELECT * FROM questions WHERE id=?", req.params.id);
    if (!q || q.reviewer !== req.user.id || q.author === req.user.id)
      fail(404, "Assigned question not found.");
    if (q.status !== "pending")
      fail(409, "This question has already been reviewed.");
    const status = req.body.status;
    if (!["approved", "rejected"].includes(status))
      fail(400, "Choose approve or reject.");
    const reason = String(req.body.reason || "").trim();
    if (status === "rejected" && (!reason || reason.length > 2000))
      fail(400, "Give a rejection reason (up to 2,000 characters).");
    run(
      "UPDATE questions SET status=?,reason=?,reason_audio=? WHERE id=?",
      status,
      status === "rejected" ? reason : null,
      status === "rejected" ? req.file?.filename || null : null,
      q.id,
    );
    res.json({ ok: true });
  });
  function attemptView(a) {
    const c = one("SELECT * FROM challenges WHERE id=?", a.challenge_id),
      end = a.started + c.duration * 1000;
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    if (!a.finished && (!remaining || !c.active)) {
      run("UPDATE attempts SET finished=? WHERE id=?", Date.now(), a.id);
      a.finished = Date.now();
    }
    const ids = JSON.parse(a.queue),
      q = !a.finished
        ? one(
            "SELECT id,question,answer FROM questions WHERE id=?",
            ids[a.position] || -1,
          )
        : null;
    return {
      id: a.id,
      challenge: c,
      score: a.score,
      remaining: a.finished ? 0 : remaining,
      finished: !!a.finished,
      total: ids.length,
      question: q
        ? { id: q.id, text: q.question, characters: q.answer.length }
        : null,
    };
  }
  app.get("/api/challenges", (req, res) =>
    res.json(
      all("SELECT * FROM challenges ORDER BY start DESC").map((c) => ({
        ...c,
        attempt: (() => {
          const a = one(
            "SELECT * FROM attempts WHERE challenge_id=? AND user_id=?",
            c.id,
            req.user.id,
          );
          return a ? attemptView(a) : null;
        })(),
      })),
    ),
  );
  app.post("/api/challenges/:id/start", (req, res) => {
    const c = one("SELECT * FROM challenges WHERE id=?", req.params.id);
    if (!c) fail(404, "Challenge not found.");
    let a = one(
      "SELECT * FROM attempts WHERE challenge_id=? AND user_id=?",
      c.id,
      req.user.id,
    );
    if (a) return res.json(attemptView(a));
    if (!c.active) fail(400, "This challenge is inactive.");
    if (Date.parse(c.start) > Date.now())
      fail(400, "This challenge has not started yet.");
    if (!a) {
      const ids = all(
        "SELECT q.id FROM questions q WHERE q.status='approved' AND (q.author IS NULL OR q.author!=?) AND NOT EXISTS(SELECT 1 FROM seen s WHERE s.question_id=q.id AND s.user_id=?) ORDER BY random()",
        req.user.id,
        req.user.id,
      ).map((q) => q.id);
      if (!ids.length)
        fail(
          400,
          "No eligible questions yet. Questions you submitted or reviewed are excluded.",
        );
      const r = run(
        "INSERT INTO attempts(challenge_id,user_id,started,queue) VALUES(?,?,?,?)",
        c.id,
        req.user.id,
        Date.now(),
        JSON.stringify(ids),
      );
      a = one("SELECT * FROM attempts WHERE id=?", Number(r.lastInsertRowid));
    }
    res.json(attemptView(a));
  });
  app.get("/api/attempts/:id", (req, res) => {
    const a = one(
      "SELECT * FROM attempts WHERE id=? AND user_id=?",
      req.params.id,
      req.user.id,
    );
    if (!a) fail(404, "Attempt not found.");
    res.json(attemptView(a));
  });
  app.post("/api/attempts/:id/answer", (req, res) => {
    const a = one(
      "SELECT * FROM attempts WHERE id=? AND user_id=?",
      req.params.id,
      req.user.id,
    );
    if (!a) fail(404, "Attempt not found.");
    const view = attemptView(a);
    if (view.finished) return res.json({ ...view, correct: false });
    const q = one("SELECT answer FROM questions WHERE id=?", view.question.id);
    if (Number(req.body.questionId) !== view.question.id)
      fail(409, "This answer belongs to an earlier question.");
    const correct =
      String(req.body.answer || "")
        .trim()
        .toLowerCase() === q.answer.trim().toLowerCase();
    if (correct) {
      a.position++;
      a.score++;
      if (a.position >= JSON.parse(a.queue).length) a.finished = Date.now();
      run(
        "UPDATE attempts SET position=?,score=?,finished=? WHERE id=?",
        a.position,
        a.score,
        a.finished || null,
        a.id,
      );
    }
    res.json({ ...attemptView(a), correct });
  });
  app.post("/api/attempts/:id/finish", (req, res) => {
    const a = one(
      "SELECT * FROM attempts WHERE id=? AND user_id=?",
      req.params.id,
      req.user.id,
    );
    if (!a) fail(404, "Attempt not found.");
    run(
      "UPDATE attempts SET finished=COALESCE(finished,?) WHERE id=?",
      Date.now(),
      a.id,
    );
    res.json(attemptView(one("SELECT * FROM attempts WHERE id=?", a.id)));
  });
  app.get("/api/leaderboard/:id", (req, res) => {
    const c = one("SELECT * FROM challenges WHERE id=?", req.params.id);
    if (!c) fail(404, "Challenge not found.");
    res.json(
      all(
        "SELECT a.score,a.started,a.finished,u.id AS user_id,u.name FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.challenge_id=? AND (a.finished IS NOT NULL OR a.started+?<=? OR ?=0) ORDER BY a.score DESC,COALESCE(a.finished,a.started+?)-a.started ASC,u.name",
        c.id,
        c.duration * 1000,
        Date.now(),
        c.active,
        c.duration * 1000,
      ),
    );
  });
  app.get("/api/admin/users", admin, (_, res) =>
    res.json(all("SELECT id,name,role FROM users ORDER BY name")),
  );
  function userInput(req, existing = false) {
    const id = String(req.body.id || "").trim(),
      name = String(req.body.name || "").trim(),
      role = req.body.role,
      password = String(req.body.password || "");
    if (!/^[A-Za-z0-9_.-]{2,40}$/.test(id))
      fail(
        400,
        "User ID must be 2–40 letters, numbers, dots, underscores or hyphens.",
      );
    if (
      !name ||
      name.length > 80 ||
      !["player", "reviewer", "admin"].includes(role)
    )
      fail(400, "Enter a name and a valid role.");
    if (
      (!existing || password) &&
      (password.length < 10 || Buffer.byteLength(password) > 72)
    )
      fail(
        400,
        "Passwords must contain at least 10 characters and at most 72 bytes.",
      );
    return { id, name, role, password };
  }
  app.post("/api/admin/users", admin, (req, res) => {
    const u = userInput(req);
    if (one("SELECT id FROM users WHERE id=?", u.id))
      fail(409, "This user ID is already in use.");
    run(
      "INSERT INTO users VALUES(?,?,?,?)",
      u.id,
      u.name,
      bcrypt.hashSync(u.password, 12),
      u.role,
    );
    assign();
    res.status(201).json({ ok: true });
  });
  app.put("/api/admin/users/:id", admin, (req, res) => {
    const old = one("SELECT * FROM users WHERE id=?", req.params.id);
    if (!old) fail(404, "User not found.");
    const u = userInput(req, true);
    if (old.id === req.user.id && u.role !== "admin")
      fail(400, "You cannot remove your own administrator role.");
    if (old.id === req.user.id && u.id !== old.id)
      fail(400, "Ask another administrator to change your user ID.");
    if (u.id !== old.id && one("SELECT id FROM users WHERE id=?", u.id))
      fail(409, "This user ID is already in use.");
    run(
      "UPDATE users SET id=?,name=?,role=?,password=? WHERE id=?",
      u.id,
      u.name,
      u.role,
      u.password ? bcrypt.hashSync(u.password, 12) : old.password,
      old.id,
    );
    if (u.password || u.role !== old.role || u.id !== old.id)
      run("DELETE FROM sessions WHERE user_id=?", u.id);
    if (!["reviewer", "admin"].includes(u.role))
      run(
        "UPDATE questions SET reviewer=NULL WHERE reviewer=? AND status='pending'",
        u.id,
      );
    assign();
    res.json({ ok: true });
  });
  app.delete("/api/admin/users/:id", admin, (req, res) => {
    if (req.params.id === req.user.id)
      fail(400, "You cannot delete your own account.");
    if (!one("SELECT id FROM users WHERE id=?", req.params.id))
      fail(404, "User not found.");
    run("DELETE FROM users WHERE id=?", req.params.id);
    assign();
    res.json({ ok: true });
  });
  app.get("/api/admin/stats", admin, (_, res) =>
    res.json({
      users: all(
        "SELECT u.id,u.name,u.role,(SELECT count(*) FROM questions q WHERE q.author=u.id) AS submitted,(SELECT count(*) FROM questions q WHERE q.author=u.id AND q.status='approved') AS approved,(SELECT count(*) FROM questions q WHERE q.reviewer=u.id AND q.status='pending') AS pending_reviews FROM users u ORDER BY submitted DESC,u.name",
      ),
      questions: all(
        "SELECT q.*,u.name AS author_name,r.name AS reviewer_name FROM questions q LEFT JOIN users u ON q.author=u.id LEFT JOIN users r ON q.reviewer=r.id ORDER BY q.id DESC",
      ),
    }),
  );
  function challengeInput(req) {
    const name = String(req.body.name || "").trim(),
      duration = Number(req.body.duration),
      start = new Date(req.body.start);
    if (
      !name ||
      name.length > 100 ||
      !Number.isInteger(duration) ||
      duration < 10 ||
      duration > 7200 ||
      !Number.isFinite(start.getTime())
    )
      fail(
        400,
        "Enter a name, start date and a time limit of 10–7,200 seconds.",
      );
    return { name, duration, start: start.toISOString() };
  }
  app.post("/api/admin/challenges", admin, (req, res) => {
    const c = challengeInput(req);
    const r = run(
      "INSERT INTO challenges(name,duration,start) VALUES(?,?,?)",
      c.name,
      c.duration,
      c.start,
    );
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.put("/api/admin/challenges/:id", admin, (req, res) => {
    const c = one("SELECT * FROM challenges WHERE id=?", req.params.id);
    if (!c) fail(404, "Challenge not found.");
    if (typeof req.body.active !== "boolean")
      fail(400, "Set active to true or false.");
    run(
      "UPDATE challenges SET active=? WHERE id=?",
      req.body.active ? 1 : 0,
      c.id,
    );
    if (!req.body.active)
      run(
        "UPDATE attempts SET finished=COALESCE(finished,?) WHERE challenge_id=?",
        Date.now(),
        c.id,
      );
    res.json({ ok: true });
  });
  app.use("/api", (_, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  const dist = path.resolve("dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (_, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err instanceof multer.MulterError ? 400 : err.status || 500;
    res.status(status).json({
      error:
        status === 500
          ? "Something went wrong. Please try again."
          : err.message,
    });
    if (status === 500) console.error(err);
  });
  return { app, db };
}
