# Chao

A responsive question and challenge platform for the web, Android, and iOS. React powers the interface; Express and SQLite provide shared accounts, question review, recordings, server-enforced games, and scores. Capacitor packages the same interface into native mobile projects.

## Run the website

Use Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Vite serves the website on port 5173 and proxies `/api` to the API on port 3001. The development command creates a **local demo** in `data/demo`; it does not change an existing database. Audio files live beside the SQLite database. On this cloud machine, use `npm ci --cache /workspace/.cache/npm` because the default home cache is not writable.

Demo accounts:

| User ID    | Role                   | Password        |
| ---------- | ---------------------- | --------------- |
| `admin`    | Administrator          | `ChaoDemo2026!` |
| `reviewer` | Reviewer               | `ChaoDemo2026!` |
| `player`   | Player                 | `ChaoDemo2026!` |
| `curator`  | Sample question author | `ChaoDemo2026!` |

These credentials are public fixtures, intended only for local development. There is no self-registration. Real users receive credentials created by an administrator.

## Implemented workflow

- Players submit a question, an English answer, and a recorded or uploaded audio explanation (15 MB maximum). They see their submissions and can edit pending questions. Approved questions are locked. Rejected questions show written feedback and any reviewer audio, and can be edited and resubmitted.
- Reviewers inherit player capabilities. Each pending submission is randomly assigned to one reviewer or administrator other than its author. Questions wait unassigned if there is no eligible reviewer; adding a reviewer assigns waiting submissions. Rejection requires written feedback and supports an optional voice recording or audio upload. Approval locks the question. A resubmission is randomly reassigned.
- Games use approved questions in random order, excluding every question the player authored or was assigned to review. The API never sends the game’s answers. Each correct answer earns one point and advances the question. The full answer must match, ignoring only letter case and surrounding whitespace; there are no partial matches. Character counts include spaces and punctuation.
- Each challenge opens at its scheduled start. Each account gets one attempt, with its own timer from the moment it starts. Refreshing, closing, or signing out does not pause or reset that timer. Incorrect guesses do not advance. A game ends on timeout, after all eligible questions, or when the player explicitly finishes. Deactivation ends active attempts immediately.
- Final scores are visible to every signed-in user. Ranking uses score first, then completion time. Ongoing scores are not shown until an attempt ends.
- Administrators inherit reviewer capabilities and can create, edit, or delete users; change names, IDs, passwords, and roles; create and deactivate challenges; and inspect the question bank and contribution/review counts by user. Users cannot delete or demote their own admin account. Another admin must change their user ID. Renaming a user preserves linked data; changing a role, ID, or password revokes that user’s sessions.

## Validation

```sh
npm test             # API integration tests with isolated temporary databases
npm run build        # Production web bundle
npm run test:e2e     # Desktop and mobile browser workflows
```

Browser tests use `/usr/bin/chromium` when available, otherwise Playwright’s installed Chromium. Install it with `npx playwright install chromium` on other machines, or set `CHROMIUM_PATH`. Browser tests cover role navigation, audio upload and question editing, responsive overflow, game completion, and leaderboard results. API tests cover authentication, permission boundaries, review assignment and locking, private audio, question exclusions, server timing, scoring, account management, and challenge deactivation. The automated audio fixture tests uploading; microphone capture must also be checked with actual hardware.

## Run in production

```sh
npm ci
npm run build
# Configure these through secure host environment settings before running:
# DATA_DIR=/persistent/chao
# BOOTSTRAP_ADMIN_PASSWORD=<unique password, at least 10 characters>
npm start
```

The production command serves both the compiled website and API on port 3001 (or `PORT`). It uses `data/production` by default, separately from demo data. On a fresh database, it creates only the `admin` user, using `BOOTSTRAP_ADMIN_PASSWORD`. That variable is used only for initial creation; changing it does not reset an existing account. Create real users in Manage users. Set `CHAO_DEMO=0` or leave it unset. Do not reuse a demo database publicly.

Terminate HTTPS at your hosting proxy. Browser microphone recording requires HTTPS (or localhost) and permission; audio upload is available as a fallback. Passwords are bcrypt-hashed, bearer sessions are random and stored hashed server-side, and sessions expire after seven days. Login has a per-IP rate limit. Client tokens live in session storage. No credentials or audio should be committed. Back up the entire persistent data directory, including SQLite state and audio; do not use an ephemeral filesystem for production. This version is intended for a single API instance. Add shared storage and a production database if scaling to multiple instances.

Environment variables are read from the process. `.env.example` documents them; the server does not automatically load `.env` files. `VITE_API_URL` is a build-time Vite variable. Never put secrets in `VITE_*` variables.

## Android and iOS

The `android/` and `ios/` directories are native Capacitor projects with microphone permission declarations. They connect to the **same hosted API** as the website; SQLite runs on the server, not independently on each phone.

1. Host the production API on a public HTTPS origin.
2. Configure `ALLOWED_ORIGINS` on the API to include `capacitor://localhost,http://localhost,https://localhost` (plus any separate web client origin).
3. Build and sync using the real API origin:

   ```sh
   VITE_API_URL=https://your-api.example.com npm run mobile:sync
   ```

4. For Android, install Android Studio, JDK 21, and Android SDK 35, then run `npm run mobile:android`. Build/run on a device or emulator. A command-line debug build uses `cd android && ./gradlew assembleDebug`. Configure your own release keystore before creating an AAB for Google Play.
5. For iOS, use a Mac with Xcode and CocoaPods, run `npm run mobile:ios`, choose your Apple development team, and build/run. Configure signing and archive through Xcode for TestFlight/App Store.

The app ID is `com.chao.app`; change it to your organization’s registered ID before release. Native builds must be regenerated with `VITE_API_URL` set to your deployed API origin. A web-only build with an empty API origin uses same-origin `/api` and is not a configured mobile release. Native device testing, store metadata, production hosting, and release signing are separate from browser validation.
