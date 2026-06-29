# Event-Driven GitHub Automation Bot — Design Spec

**Date:** 2026-06-30
**Status:** Approved

## 1. Summary

A deployed web app + bot that reacts to activity in a user's GitHub repository.
A user signs in with GitHub, connects one or more repositories, and the bot:

- receives webhooks (`issues`, `pull_request`, `push`),
- writes back to GitHub (adds a label and/or posts a comment),
- sends a Slack notification,
- optionally runs the issue/PR text through an LLM (Groq) for summary / label / priority,
- and surfaces a live, login-gated dashboard showing every event and action, plus
  user-configurable rules.

It must run unattended: resistant to forged/replayed requests, idempotent on duplicate
deliveries, durable against transient downstream failures, and never leak secrets.

## 2. Scope

**Core (must ship):** OAuth sign-in, connect a repo, webhook ingest for `issues` +
`pull_request` (+`push` bonus), GitHub write-back, Slack notify, login-gated dashboard
with event/action log, signature verification, idempotency, durable retries, README.

**Stretch (all selected):**
1. Configurable rules in the UI.
2. AI triage step (Groq, free tier).
3. GitHub App auth (JWT → installation tokens) — combined with OAuth sign-in via a
   single GitHub App.
4. Multi-repository support per user.

Basic structured logging + a visible retry/failure history are treated as **core**
reliability, not a stretch toggle.

## 3. Tech Stack & Hosting (all free, no card)

| Concern        | Choice                                             |
|----------------|----------------------------------------------------|
| Backend/API    | NestJS (TypeScript), runs HTTP + BullMQ worker in-process |
| Frontend       | Next.js (App Router, React)                        |
| DB             | Neon Postgres                                      |
| ORM            | Prisma                                             |
| Queue          | BullMQ on Upstash Redis                            |
| AI             | Groq (Llama-class), free tier                      |
| Notifications  | Slack Incoming Webhook URL                         |
| API hosting    | Render (free web service)                          |
| UI hosting     | Vercel (free)                                      |
| Live updates   | Server-Sent Events (SSE)                           |
| GitHub         | One GitHub App (user OAuth + installation)         |

## 4. Architecture

```
GitHub (1 App)  ──webhook POST /webhooks/github──►  NestJS API (Render) ── BullMQ worker (in-process)
   ▲  user OAuth + App install                          │   ├─► Neon Postgres (app data + event/action log)
   │                                                     │   ├─► Upstash Redis (BullMQ)
Next.js UI (Vercel) ──fetch(credentials)+SSE────────────┘   ├─► GitHub API (label/comment, installation token)
   landing · dashboard · rules editor · live log            ├─► Slack Incoming Webhook
                                                            └─► Groq (AI triage)
```

- **One GitHub App** provides both user-to-server OAuth (sign-in) and installation
  tokens (webhooks + write-back). Single registration.
- **NestJS API on Render** runs the HTTP server and the BullMQ worker in the same
  process (Render free background workers are paid; co-location is fine at this scale).
- **Next.js UI on Vercel**: no cold start on the user-facing surface. Cross-origin auth
  uses an httpOnly + Secure + SameSite=None JWT cookie set by the API; the UI calls the
  API with `credentials:'include'` and never reads secrets.
- **Render free spin-down** mitigated with a free external pinger (UptimeRobot /
  cron-job.org) hitting `/health` every ~10 min; GitHub also auto-redelivers failed
  webhooks.

## 5. End-to-End Data Flow

1. **Sign in** → GitHub App user-OAuth → upsert `User`, set session cookie.
2. **Connect repo** → install the GitHub App on chosen repo(s) → callback stores
   `Installation` + `Repository` rows (multi-repo).
3. **Event happens** → GitHub POSTs `/webhooks/github`.
4. **Ingest (fast path):** verify HMAC signature → dedupe on `X-GitHub-Delivery` →
   insert `Event(status=pending)` → enqueue BullMQ job (`jobId = deliveryId`) → return
   `200` in milliseconds.
5. **Worker (async):** load applicable `Rule`s → evaluate match → run actions: AI triage
   (Groq) → GitHub write-back (label/comment) → Slack notify → write `ActionLog` rows →
   `Event.status=done`. Failures retry with exponential backoff; exhausted → `dead_letter`.
6. **Dashboard** reads `Event`/`ActionLog` (live via SSE); does Rules CRUD + repo switch.

## 6. Data Model (Prisma / Postgres)

- **User**: `id`, `githubUserId (unique)`, `login`, `avatarUrl`, `createdAt`.
- **Installation**: `id`, `githubInstallationId (unique)`, `userId`, `createdAt`.
- **Repository**: `id`, `githubRepoId (unique)`, `fullName`, `installationId`, `userId`,
  `active`, `createdAt`.
- **Rule**: `id`, `repositoryId`, `name`, `eventType`, `matchField`
  (title/body/author/label), `matchOp` (contains/equals), `matchValue`, `actions(json)`
  (addLabel?, labelName, postComment?, commentBody, slackNotify?), `enabled`, `createdAt`.
- **Event**: `id`, `deliveryId (UNIQUE)`, `repositoryId`, `eventType`, `action`,
  `payloadSummary(json)`, `status` (pending/processing/done/failed/dead_letter),
  `attempts`, `aiTriage(json?)`, `receivedAt`, `processedAt`, `error`.
  The UNIQUE `deliveryId` is the idempotency backbone.
- **ActionLog**: `id`, `eventId`, `type`
  (label_added/comment_posted/slack_sent/ai_triage), `status` (success/failed),
  `detail(json)`, `createdAt`. This is "actions the bot took."

## 7. NestJS Modules

`AuthModule` (Passport GitHub + JWT guard) · `GithubAppModule` (sign App JWT →
installation token, Octokit, write-back) · `WebhooksModule` (signature guard + dedupe +
enqueue) · `QueueModule` (BullMQ config + processor) · `RulesModule` (CRUD) ·
`EventsModule` (queries + SSE stream) · `RepositoriesModule` (connect/list) ·
`SlackModule` · `AiModule` (Groq) · `HealthModule`.

Each module has one clear purpose, communicates via injected services, and is unit-testable
in isolation.

## 8. Reliability

- **No double-processing:** UNIQUE `deliveryId` + BullMQ `jobId=deliveryId` (dedupe at DB
  and queue layers); write-back steps check `ActionLog` before acting so retries never
  post twice.
- **No lost events:** event persisted to Postgres *before* returning 200; queue retries
  with exponential backoff; exhausted jobs become `dead_letter` and remain visible. AI
  failure is **non-fatal** — label/comment/Slack still run without it.
- **Visible history:** every attempt + failure is recorded; dashboard shows status,
  attempts, and errors.

## 9. Security

- **HMAC `X-Hub-Signature-256`** verified with constant-time compare; forged requests →
  401.
- **Replay** defeated by delivery-id dedupe.
- **Secrets only in env** (Render/Vercel): App private key (base64), webhook secret, JWT
  secret, Groq key, Slack URL, DB/Redis URLs. `.env.example` ships placeholders only.
  Nothing secret in the client bundle.
- httpOnly + Secure cookies; CORS locked to the UI origin with credentials; `@nestjs/throttler`
  rate-limiting on public routes; HTTPS via Render/Vercel.

## 10. Frontend (Next.js App Router)

Landing page (`Sign in with GitHub`) → protected `/dashboard`:

- repo switcher (multi-repo),
- live event log (SSE),
- action log with status/errors,
- rules editor (CRUD),
- "Connect repository" (GitHub App install).

Middleware redirects unauthenticated users.

## 11. Error Handling

- Webhook: invalid signature → 401; malformed → 400; valid → 200 + enqueue. Never throws
  raw to the client.
- Worker: try/catch per step; failures increment attempts; BullMQ backoff; after N →
  `dead_letter` + `ActionLog(failed)` + visible in dashboard. Downstream (GitHub/Slack/
  Groq) failures retried; AI failure degrades gracefully.
- Idempotent write-back: check `ActionLog` before adding a label / posting a comment.

## 12. Testing

Jest unit: signature verify, dedupe, rule matching, Slack payload, AI prompt/parse
(mocked), GitHub write-back (mocked Octokit). E2E (supertest): valid sig → enqueues,
invalid sig → 401, duplicate delivery → processed once, auth guard blocks dashboard APIs.

## 13. Deliverables (assignment)

- GitHub repo with clean commit history.
- Deployed, reachable URL (Vercel UI + Render API + live webhook endpoint).
- `README.md`: what it does, local run, env vars, `.env.example`, deployment steps.
- Test instructions + a demo repo / throwaway creds where needed.
- AI context files: `CLAUDE.md` (authored from how we actually work).
- `AI_NOTES.md` (~1 page): tools/models used, key self-made decisions, hardest AI wrong
  turn, what we'd improve.

## 14. Build Order

1. Monorepo scaffold (Nest + Next), Prisma schema, `/health`, CI lint/test.
2. Auth (GitHub sign-in) + dashboard shell.
3. GitHub App install + repo connect.
4. Webhook ingest (verify + dedupe + enqueue) — core reliability.
5. Worker: GitHub write-back + Slack — core flow complete.
6. Dashboard event/action log (SSE).
7. Stretch: Rules CRUD → AI triage (Groq) → multi-repo polish.
8. Deploy (Render + Vercel + Neon + Upstash), README + AI_NOTES + CLAUDE.md.
