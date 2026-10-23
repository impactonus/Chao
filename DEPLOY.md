# Get an online Chao test link

This Blueprint runs the website and API together on Render's free web service. It creates the sample challenge and demo users automatically. It does not require a terminal or a separate database service.

1. Open https://render.com/deploy?repo=https://github.com/impactonus/Chao .
2. Sign in to Render, or create an account. Connect GitHub if Render asks for access to the repository.
3. Render will read `render.yaml`. Confirm the service uses the **Free** plan, then choose **Deploy** (the button may be labelled **Deploy Blueprint**).
4. Wait for the `chao-demo` service to show **Live**. Open the HTTPS service URL shown on its dashboard. That is your online test link; Render chooses the actual hostname.
5. Sign in as `admin`, `reviewer`, or `player`, using `ChaoDemo2026!` for the password.

An idle free service may need time to wake up. Test data and recordings are temporary and can disappear on restart or redeployment. This public demo has known credentials, including its admin account: use sample data only. Anyone with the demo credentials can change its users and challenges. Do not use it for real accounts or confidential recordings.

For a permanent production release, use persistent storage, turn demo mode off, and securely set a unique initial admin password as explained in README.md. Mobile release builds can then use the production API's HTTPS origin.

Saving the cloud environment configuration does not deploy this Render service. The Render sign-in and deployment steps above must complete before a live test URL exists.
