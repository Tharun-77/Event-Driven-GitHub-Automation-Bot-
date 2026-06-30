# Deployment Runbook

Ordered, copy-paste steps to take this from the pushed repo to a live, tested deployment.
All services are free / no-card.

**Already done:** code is on `main`; `DATABASE_URL` (Neon) and `REDIS_URL` (Upstash) are in
`apps/api/.env`; the initial Prisma migration is committed.

The order matters because of a dependency cycle: the **GitHub App needs the API's public
URL**, the **UI needs the API's URL**, and the **API needs the UI's URL** (CORS). So we
deploy the API first, then create the App, then deploy the UI, then fill the rest.

---

## Step 1 — Two remaining keys (2 min)

- **Slack:** api.slack.com/apps → Create New App → From scratch → Incoming Webhooks → On →
  Add New Webhook to Workspace → pick a channel → copy the `https://hooks.slack.com/...`
  URL → `SLACK_WEBHOOK_URL`.
- **Groq:** console.groq.com → API Keys → Create API Key → `GROQ_API_KEY`.

Put both into `apps/api/.env` (for local testing) and keep them for Render below.

## Step 2 — Deploy the API to Render → get the API URL

1. render.com → New → **Blueprint** → connect your GitHub repo
   (`Event-Driven-GitHub-Automation-Bot-`). Render reads `render.yaml`.
2. When prompted for the `sync: false` env vars, set at least these so it boots:
   - `DATABASE_URL`, `REDIS_URL` — from your `.env`
   - `JWT_SECRET` — from your `.env` (the pre-generated one)
   - `WEB_ORIGIN` — temporary `http://localhost:3000` (updated in Step 5)
   - `API_BASE_URL` — leave blank for now (updated in Step 5)
   - leave the `GITHUB_*`, `SLACK_*`, `GROQ_*` blank for now
3. Create. Wait for the build. It runs `prisma migrate deploy` on start (creates the Neon
   tables). When live, copy the service URL, e.g. `https://github-automation-bot-api.onrender.com`.
   Verify: open `<API_URL>/health` → `{"status":"ok",...}`.

## Step 3 — Create the GitHub App (using the API URL)

GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App:

| Field | Value |
|---|---|
| Name | anything unique, e.g. `tharun-automation-bot` |
| Homepage URL | your Vercel URL later, or the API URL for now |
| Callback URL | `<API_URL>/auth/github/callback` |
| Setup URL | `<API_URL>/repositories/setup/callback` — ✔ Redirect on update |
| Webhook → Active | ✔ |
| Webhook URL | `<API_URL>/webhooks/github` |
| Webhook secret | the `GITHUB_WEBHOOK_SECRET` value pre-generated in your `.env` |
| Repository permissions | Issues: Read & write · Pull requests: Read & write · Contents: Read-only · Metadata: Read-only |
| Subscribe to events | ✔ Issues · ✔ Pull request · ✔ Push |
| Install location | Only on this account |

Create, then collect:
- **App ID** → `GITHUB_APP_ID`
- public slug from `github.com/apps/<slug>` → `GITHUB_APP_SLUG`
- **Client ID** → `GITHUB_APP_CLIENT_ID`
- **Generate a client secret** → `GITHUB_APP_CLIENT_SECRET`
- **Generate a private key** (downloads a `.pem`) → base64 it:
  - macOS/Linux: `base64 -w0 your-key.pem`
  - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-key.pem"))`
  - → `GITHUB_APP_PRIVATE_KEY_BASE64`

## Step 4 — Deploy the UI to Vercel → get the UI URL

1. vercel.com → New Project → import the repo.
2. **Root Directory:** `apps/web`. Framework: Next.js (auto-detected).
3. Environment variable: `NEXT_PUBLIC_API_BASE_URL` = your `<API_URL>` (from Step 2).
4. Deploy. Copy the UI URL, e.g. `https://your-app.vercel.app`.

## Step 5 — Fill the rest of the env on Render + redeploy

In the Render service → Environment, set/update:
- `API_BASE_URL` = `<API_URL>`
- `WEB_ORIGIN` = `<UI_URL>` (the Vercel URL — this fixes CORS)
- `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
  `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`
- `SLACK_WEBHOOK_URL`, `GROQ_API_KEY`

Save → Render redeploys automatically.

## Step 6 — Keep the free instance warm

Render's free service sleeps after ~15 min idle. Add a free pinger
(uptimerobot.com or cron-job.org) hitting `<API_URL>/health` every ~10 minutes.

## Step 7 — Live end-to-end test

1. Open `<UI_URL>` → **Sign in with GitHub** → **Connect repository** (install the App on a
   demo repo you own). A default rule is seeded: *issue title contains "bug" → label `bug`
   + Slack*.
2. On that repo, open an issue titled `bug: test login`. Within seconds:
   - the `bug` label appears on the issue,
   - a Slack message arrives (with AI summary + priority),
   - the dashboard shows a new event row with its action log and AI triage.
3. **Idempotency:** GitHub App → Advanced → Recent Deliveries → redeliver that event →
   the dashboard does **not** add a second row / second label.
4. **Signature:** `curl -X POST <API_URL>/webhooks/github -H "x-hub-signature-256: sha256=bad" -d '{}'`
   → `401`.

## Submission checklist

- Repo URL (this repo) · Deployed UI URL (Vercel) · `README.md`, `.env.example`,
  `CLAUDE.md`, `AI_NOTES.md` present · a demo repo with the App installed for graders.

## Optional — run the migration locally instead of on Render

If you'd rather create the Neon tables from your machine first:

```bash
cd apps/api && npx prisma migrate deploy   # uses DATABASE_URL from apps/api/.env
```
