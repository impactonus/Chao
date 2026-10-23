import { audioFixture } from "./audio-fixture.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
let server, db, base;
const tokens = {};
const dir = mkdtempSync(path.join(tmpdir(), "chao-test-"));
async function request(route, { user = "admin", method = "GET", body } = {}) {
  const r = await fetch(base + route, {
    method,
    headers: {
      ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
async function login(user) {
  const r = await request("/login", {
    method: "POST",
    user: "anonymous",
    body: { userId: user, password: "ChaoDemo2026!" },
  });
  assert.equal(r.status, 200);
  tokens[user] = r.data.token;
  return r;
}
function submission(
  question = "Which color is the daytime sky?",
  answer = "blue",
) {
  const f = new FormData();
  f.append("question", question);
  f.append("answer", answer);
  f.append(
    "audio",
    new Blob([audioFixture()], { type: "audio/wav" }),
    "explanation.wav",
  );
  return f;
}
before(async () => {
  const r = createApp({ dataDir: dir, demo: true });
  db = r.db;
  server = r.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const u of ["admin", "player", "reviewer", "curator"]) await login(u);
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
test("authentication rejects wrong credentials and anonymous access", async () => {
  assert.equal((await request("/me", { user: "anonymous" })).status, 401);
  const r = await request("/login", {
    method: "POST",
    user: "anonymous",
    body: { userId: "admin", password: "wrong" },
  });
  assert.equal(r.status, 401);
  assert.equal(
    (await request("/me", { user: "player" })).data.user.role,
    "player",
  );
});
test("permissions prevent players accessing review or admin data", async () => {
  for (const route of ["/reviews", "/admin/users", "/admin/stats"])
    assert.equal((await request(route, { user: "player" })).status, 403);
  assert.equal(
    (await request("/admin/users", { user: "reviewer" })).status,
    403,
  );
});
test("question submission requires English answer and recorded explanation", async () => {
  let f = submission("What is the answer?", "中文");
  assert.equal(
    (await request("/questions", { user: "player", method: "POST", body: f }))
      .status,
    400,
  );
  f = new FormData();
  f.append("question", "What is the answer?");
  f.append("answer", "hello");
  assert.equal(
    (await request("/questions", { user: "player", method: "POST", body: f }))
      .status,
    400,
  );
});
test("submit, assign, edit, reject with audio, resubmit, approve, lock", async () => {
  const created = await request("/questions", {
    user: "player",
    method: "POST",
    body: submission(),
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  let q = db.prepare("SELECT * FROM questions WHERE id=?").get(id);
  assert.notEqual(q.reviewer, "player");
  assert.ok(["admin", "reviewer"].includes(q.reviewer));
  assert.equal(
    (
      await request(`/questions/${id}`, {
        user: "curator",
        method: "PUT",
        body: submission(),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/questions/${id}`, {
        user: "player",
        method: "PUT",
        body: submission("What color is a clear daytime sky?", "blue"),
      })
    ).status,
    200,
  );
  const feedback = new FormData();
  feedback.append("status", "rejected");
  feedback.append("reason", "Please make the question more specific.");
  feedback.append(
    "audio",
    new Blob([audioFixture()], { type: "audio/wav" }),
    "feedback.wav",
  );
  assert.equal(
    (
      await request(`/reviews/${id}`, {
        user: q.reviewer,
        method: "POST",
        body: feedback,
      })
    ).status,
    200,
  );
  q = db.prepare("SELECT * FROM questions WHERE id=?").get(id);
  assert.equal(q.status, "rejected");
  assert.ok(q.reason_audio);
  const audio = await fetch(`${base}/audio/${q.reason_audio}`, {
    headers: { Authorization: `Bearer ${tokens.player}` },
  });
  assert.equal(audio.status, 200);
  assert.equal(
    (
      await fetch(`${base}/audio/${q.audio}`, {
        headers: { Authorization: `Bearer ${tokens.curator}` },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/questions/${id}`, {
        user: "player",
        method: "PUT",
        body: submission("What color is a cloudless daytime sky?", "blue"),
      })
    ).status,
    200,
  );
  q = db.prepare("SELECT * FROM questions WHERE id=?").get(id);
  assert.equal(q.status, "pending");
  assert.equal(q.reason, null);
  const approve = new FormData();
  approve.append("status", "approved");
  assert.equal(
    (
      await request(`/reviews/${id}`, {
        user: q.reviewer,
        method: "POST",
        body: approve,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/questions/${id}`, {
        user: "player",
        method: "PUT",
        body: submission(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/reviews/${id}`, {
        user: q.reviewer,
        method: "POST",
        body: approve,
      })
    ).status,
    409,
  );
});
test("reviewer can only act on questions assigned to their account", async () => {
  const c = await request("/questions", {
    user: "curator",
    method: "POST",
    body: submission("What shines in the night sky?", "moon"),
  });
  const q = db.prepare("SELECT * FROM questions WHERE id=?").get(c.data.id);
  const other = q.reviewer === "admin" ? "reviewer" : "admin";
  const f = new FormData();
  f.append("status", "approved");
  assert.equal(
    (
      await request(`/reviews/${q.id}`, {
        user: other,
        method: "POST",
        body: f,
      })
    ).status,
    404,
  );
});
test("game hides answers, excludes authored and reviewed questions, and rejects stale answers", async () => {
  const r = await request("/challenges/1/start", {
    user: "player",
    method: "POST",
    body: {},
  });
  assert.equal(r.status, 200);
  assert.ok(r.data.question);
  assert.equal(r.data.question.answer, undefined);
  const attempt = db
    .prepare("SELECT * FROM attempts WHERE id=?")
    .get(r.data.id);
  for (const id of JSON.parse(attempt.queue)) {
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(id);
    assert.notEqual(q.author, "player");
    assert.equal(
      db
        .prepare("SELECT * FROM seen WHERE question_id=? AND user_id=?")
        .get(id, "player"),
      undefined,
    );
  }
  const wrong = await request(`/attempts/${r.data.id}/answer`, {
    user: "player",
    method: "POST",
    body: { questionId: r.data.question.id, answer: "wrong answer" },
  });
  assert.equal(wrong.data.correct, false);
  assert.equal(wrong.data.score, 0);
  const answer = db
    .prepare("SELECT answer FROM questions WHERE id=?")
    .get(r.data.question.id).answer;
  const correct = await request(`/attempts/${r.data.id}/answer`, {
    user: "player",
    method: "POST",
    body: {
      questionId: r.data.question.id,
      answer: " " + answer.toUpperCase() + " ",
    },
  });
  assert.equal(correct.data.correct, true);
  assert.equal(correct.data.score, 1);
  assert.equal(
    (
      await request(`/attempts/${r.data.id}/answer`, {
        user: "player",
        method: "POST",
        body: { questionId: r.data.question.id, answer },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/attempts/${r.data.id}`, { user: "curator" })).status,
    404,
  );
  const resumed = await request("/challenges/1/start", {
    user: "player",
    method: "POST",
    body: {},
  });
  assert.equal(resumed.data.id, r.data.id);
  assert.equal(resumed.data.score, 1);
});
test("timer is enforced by the server, expired scores become public, no restarts", async () => {
  const a = db.prepare("SELECT * FROM attempts WHERE user_id='player'").get();
  db.prepare("UPDATE attempts SET started=? WHERE id=?").run(
    Date.now() - 181000,
    a.id,
  );
  const answer = await request(`/attempts/${a.id}/answer`, {
    user: "player",
    method: "POST",
    body: { answer: "anything", questionId: 1 },
  });
  assert.equal(answer.data.finished, true);
  assert.equal(answer.data.score, 1);
  const board = await request("/leaderboard/1", { user: "curator" });
  assert.ok(board.data.some((p) => p.user_id === "player" && p.score === 1));
  const resume = await request("/challenges/1/start", {
    user: "player",
    method: "POST",
    body: {},
  });
  assert.equal(resume.data.finished, true);
  assert.equal(resume.data.id, a.id);
});
test("future, inactive and no-eligible-question challenges cannot start", async () => {
  const c = await request("/admin/challenges", {
    method: "POST",
    body: {
      name: "Tomorrow",
      duration: 60,
      start: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  assert.equal(c.status, 201);
  assert.equal(
    (
      await request(`/challenges/${c.data.id}/start`, {
        user: "player",
        method: "POST",
        body: {},
      })
    ).status,
    400,
  );
  db.prepare(
    "INSERT OR IGNORE INTO seen SELECT id,'curator' FROM questions WHERE status='approved'",
  ).run();
  assert.equal(
    (
      await request("/challenges/1/start", {
        user: "curator",
        method: "POST",
        body: {},
      })
    ).status,
    400,
  );
  await request(`/admin/challenges/${c.data.id}`, {
    method: "PUT",
    body: { active: false },
  });
  assert.equal(
    (
      await request(`/challenges/${c.data.id}/start`, {
        user: "player",
        method: "POST",
        body: {},
      })
    ).status,
    400,
  );
});
test("admin user creation, password update, role update, stats and deletion", async () => {
  const u = {
    id: "new.player",
    name: "New Player",
    password: "ChaoDemo2026!",
    role: "player",
  };
  assert.equal(
    (await request("/admin/users", { method: "POST", body: u })).status,
    201,
  );
  assert.equal(
    (await request("/admin/users", { method: "POST", body: u })).status,
    409,
  );
  await login(u.id);
  assert.equal((await request("/admin/stats")).status, 200);
  assert.equal(
    (
      await request(`/admin/users/${u.id}`, {
        method: "PUT",
        body: { ...u, name: "New Reviewer", role: "reviewer" },
      })
    ).status,
    200,
  );
  assert.equal((await request("/me", { user: u.id })).status, 401);
  await login(u.id);
  assert.equal((await request("/reviews", { user: u.id })).status, 200);
  assert.equal(
    (await request("/admin/users/admin", { method: "DELETE" })).status,
    400,
  );
  assert.equal(
    (await request(`/admin/users/${u.id}`, { method: "DELETE" })).status,
    200,
  );
  assert.equal((await request("/me", { user: u.id })).status, 401);
});
test("deactivation finalizes active attempts and prevents play", async () => {
  const c = await request("/admin/challenges", {
    method: "POST",
    body: {
      name: "End this challenge",
      duration: 60,
      start: new Date(Date.now() - 1000).toISOString(),
    },
  });
  const a = await request(`/challenges/${c.data.id}/start`, {
    method: "POST",
    body: {},
  });
  assert.equal(a.status, 200);
  await request(`/admin/challenges/${c.data.id}`, {
    method: "PUT",
    body: { active: false },
  });
  assert.equal((await request(`/attempts/${a.data.id}`)).data.finished, true);
  assert.ok(
    (await request(`/leaderboard/${c.data.id}`, { user: "player" })).data.some(
      (p) => p.user_id === "admin",
    ),
  );
});
test("logout invalidates server-side session", async () => {
  assert.equal(
    (await request("/logout", { user: "reviewer", method: "POST", body: {} }))
      .status,
    200,
  );
  assert.equal((await request("/me", { user: "reviewer" })).status, 401);
});

test("renaming a user preserves questions, attempts and review history, and revokes old credentials", async () => {
  const user = {
    id: "rename.me",
    name: "Rename Test",
    role: "player",
    password: "ChaoDemo2026!",
  };
  assert.equal(
    (await request("/admin/users", { method: "POST", body: user })).status,
    201,
  );
  await login(user.id);
  const question = await request("/questions", {
    user: user.id,
    method: "POST",
    body: submission("What shape has three sides?", "triangle"),
  });
  assert.equal(question.status, 201);
  db.prepare("INSERT INTO seen VALUES(?,?)").run(question.data.id, user.id);
  const attempt = await request("/challenges/1/start", {
    user: user.id,
    method: "POST",
    body: {},
  });
  assert.equal(attempt.status, 200);
  const renamed = {
    ...user,
    id: "renamed.user",
    password: "DifferentChao2026!",
  };
  assert.equal(
    (await request(`/admin/users/${user.id}`, { method: "PUT", body: renamed }))
      .status,
    200,
  );
  assert.equal(
    db.prepare("SELECT author FROM questions WHERE id=?").get(question.data.id)
      .author,
    renamed.id,
  );
  assert.equal(
    db.prepare("SELECT user_id FROM attempts WHERE id=?").get(attempt.data.id)
      .user_id,
    renamed.id,
  );
  assert.ok(
    db
      .prepare("SELECT * FROM seen WHERE question_id=? AND user_id=?")
      .get(question.data.id, renamed.id),
  );
  assert.equal((await request("/me", { user: user.id })).status, 401);
  assert.equal(
    (
      await request("/login", {
        user: "anonymous",
        method: "POST",
        body: { userId: user.id, password: user.password },
      })
    ).status,
    401,
  );
  const newSession = await request("/login", {
    user: "anonymous",
    method: "POST",
    body: { userId: renamed.id, password: renamed.password },
  });
  assert.equal(newSession.status, 200);
  tokens[renamed.id] = newSession.data.token;
  assert.equal(
    (
      await request("/challenges/1/start", {
        user: renamed.id,
        method: "POST",
        body: {},
      })
    ).data.id,
    attempt.data.id,
  );
  assert.equal(
    (await request(`/admin/users/${renamed.id}`, { method: "DELETE" })).status,
    200,
  );
});
