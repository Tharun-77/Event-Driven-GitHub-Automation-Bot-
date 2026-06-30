# Event-Driven GitHub Automation Bot

A small but real product: sign in with GitHub, connect a repository, and a bot reacts to
repo activity — it **labels/comments back on GitHub**, **notifies Slack**, **triages with
AI**, and shows a **live, login-gated dashboard** with **user-configurable rules**.

Built to run unattended: webhook **signatures are verified**, deliveries are **idempotent**
(never processed twice), work is **durably queued with retries** (nothing lost on a
transient outage), and **secrets never leave environment variables**.

---

## What it does

1. A user signs in with their GitHub account (GitHub App user OAuth).
2. They install the GitHub App on one or more repositories they own.
3. GitHub sends webhooks (`issues`, `pull_request`, `push`) to the API.
4. For each event the bot evaluates the repo's rules and, on a match:
   - adds a label and/or posts a comment on GitHub (via an installation token),
   - sends a Slack notification,
   - runs the issue/PR text through an LLM (Groq) for a summary, suggested label, and
     priority — shown in Slack and the dashboard.
5. The dashboard (behind login) shows a live log of every event and the actions taken,
   plus a rules editor and a multi-repo switcher.

## Architecture

```
GitHub (one App)  ──webhook POST /webhooks/github──▶  NestJS API (Render)
   ▲  user OAuth + App install                            │  ├─ verify HMAC, dedupe, enqueue
   │                                                       │  ├─ BullMQ worker (in-process)
Next.js UI (Vercel) ──fetch(credentials) + SSE────────────┘  ├─▶ Neon Postgres (data + event/action log)
   landing · dashboard · rules · live log                    ├─▶ Upstash Redis (BullMQ)
                                                             ├─▶ GitHub API (label/comment)
                                                             ├─▶ Slack Incoming Webhook
                                                             └─▶ Groq (AI triage)
```

- **One GitHub App** provides both user sign-in (user-to-server OAuth) and installation
  tokens (webhooks + write-back) — one registration, fewer moving parts, and it satisfies
  the GitHub-App stretch goal.
- The **NestJS API** runs the HTTP server and the **BullMQ worker in the same process**
  (Render's free background workers are paid; co-location is fine at this scale).
- The **Next.js UI** is hosted on Vercel. The session cookie lives on the API domain, so
  the dashboard authenticates via `fetch(..., { credentials: 'include' })`; the API's
  `JwtGuard` is the real security boundary on every data endpoint.

## Tech stack

NestJS · Next.js (App Router) · TypeScript · Prisma + Neon Postgres · BullMQ + Upstash
Redis · Octokit (GitHub App) · Groq · Slack Incoming Webhook · Jest + Supertest. All
services are free, no-card tiers.

## Repository layout

```
apps/
  api/   NestJS API + in-process BullMQ worker
    src/
      auth/         GitHub OAuth sign-in, JWT session cookie, guard
      github/       GitHub App (app JWT, installation Octokit, write-back)
      repositories/ connect/list repos (App installation), multi-repo
      webhooks/     signature verify + idempotent ingest + enqueue
      queue/        BullMQ producer + worker + event processor
      rules/        rule matcher + user-configurable rules CRUD
      events/       event list API + SSE live stream
      ai/           Groq triage (non-fatal)
      slack/        Slack notifier
  web/   Next.js dashboard UI
docs/    design spec + implementation plan
render.yaml   Render Blueprint for the API
```

## Local development

Requires **Node 20+** and **pnpm** (`corepack enable` or `npm i -g pnpm`).

```bash
pnpm install
cp .env.example apps/api/.env          # then fill in real values (see below)
pnpm --filter @app/api prisma:migrate  # apply the schema to your Neon database
pnpm dev                               # runs api (:4000) and web (:3000)
```

Open http://localhost:3000.

**Receiving webhooks locally** requires a public tunnel because GitHub can't reach
`localhost`. Use [smee.io](https://smee.io):

```bash
npx smee-client --url https://smee.io/<your-channel> --target http://localhost:4000/webhooks/github
```

Set the GitHub App's webhook URL to your smee channel; its OAuth callback to
`http://localhost:4000/auth/github/callback`; and its setup URL to
`http://localhost:4000/repositories/setup/callback`.

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Summary:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `REDIS_URL` | Upstash Redis (`rediss://…`) for BullMQ |
| `JWT_SECRET` | signs the session cookie |
| `SESSION_COOKIE_NAME` | session cookie name (default `gha_session`) |
| `WEB_ORIGIN` / `API_BASE_URL` | public UI / API URLs (CORS, redirects, OAuth) |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG` | the GitHub App identity |
| `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` | user OAuth |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | base64 of the App private-key PEM (installation tokens) |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for webhook signature verification |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook |
| `GROQ_API_KEY` / `GROQ_MODEL` | AI triage |

No secrets are committed; `.env.example` ships placeholders only, and nothing secret is
exposed to the browser (only `NEXT_PUBLIC_*`, which is non-secret).

## Deployment

**Database — Neon:** create a free project, copy the `postgresql://…?sslmode=require` URL.

**Redis — Upstash:** create a free Redis database, copy the `rediss://…` URL.

**GitHub App:** create one App. Permissions: Issues R/W, Pull requests R/W, Contents R,
Metadata R. Subscribe to `issues`, `pull_request`, `push`. Enable user OAuth. Set the
webhook URL to `https://<render-api>/webhooks/github`, the callback URL to
`https://<render-api>/auth/github/callback`, and the setup URL to
`https://<render-api>/repositories/setup/callback`. Generate a private key, then
`base64 -w0 key.pem` into `GITHUB_APP_PRIVATE_KEY_BASE64`.

**API — Render:** deploy via [`render.yaml`](./render.yaml) (free web service). It runs
`prisma migrate deploy` on start. Set all secrets in the dashboard. A free uptime pinger
(UptimeRobot / cron-job.org) hitting `/health` every ~10 min keeps the free instance warm.

**UI — Vercel:** import the repo, set the project root to `apps/web`, and set
`NEXT_PUBLIC_API_BASE_URL` to the Render API URL.

## How to test it

1. Open the deployed UI, **Sign in with GitHub**, then **Connect repository** (install the
   App on a demo repo you own). A default rule is seeded: *issues whose title contains
   "bug" → add the `bug` label + Slack alert*.
2. Open an issue titled `bug: test` on that repo. Within seconds you should see:
   - the `bug` label added on GitHub,
   - a Slack message (with the AI summary/priority),
   - a new row in the dashboard event log with its action log and AI triage.
3. **Idempotency check:** in the GitHub App's *Advanced → Recent Deliveries*, redeliver the
   same event. The dashboard shows it is **not** processed twice (same `X-GitHub-Delivery`).
4. **Signature check:** `POST` to `/webhooks/github` with a bogus `X-Hub-Signature-256` →
   `401`.

## Reliability & security

- **Signature verification:** every webhook is HMAC-SHA256 verified with a constant-time
  comparison before any processing; forged requests get `401`.
- **Idempotency:** a unique `deliveryId` plus BullMQ `jobId = deliveryId` means the same
  delivery is never processed twice; write-back steps also check the action log before
  acting, so retries never double-post.
- **No lost events:** the event is persisted to Postgres *before* the webhook returns
  `200`; the queue retries with exponential backoff; exhausted jobs become `dead_letter`
  and stay visible in the dashboard. AI failures are non-fatal.
- **Secrets:** environment variables only; httpOnly + Secure cookies; CORS locked to the
  UI origin; rate-limited public routes; HTTPS everywhere.

## Tests

```bash
pnpm test                          # all unit tests (api + web)
pnpm --filter @app/api test:e2e    # API e2e (signature 401, dedupe, auth guard)
```
