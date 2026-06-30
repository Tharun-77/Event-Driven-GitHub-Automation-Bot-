# AI_NOTES

## Tools & models, and how work was split

I built this with **Claude Code (Claude Opus 4.8)** using a deliberately structured
workflow rather than ad-hoc prompting:

1. **Brainstorm → spec** — I answered a series of focused questions (stack, hosting, queue
   tech, AI provider, which stretch goals) and the design was written up as a committed
   spec (`docs/superpowers/specs/`).
2. **Plan** — the spec became a 24-task implementation plan (`docs/superpowers/plans/`)
   with explicit files, interfaces, and test-first steps for the graded cores.
3. **Execute** — tasks were implemented one at a time, TDD where it mattered (signature
   verification, idempotency, rule matching, the worker), each with a passing test suite
   and a focused commit.

**Split:** I owned the product and architecture decisions and reviewed each phase; the AI
wrote essentially all of the code, tests, and configuration, and did the debugging. I
steered tech choices and pushed for the reliability/idempotency design to be airtight.

## Key decisions I made myself

- **One GitHub App for everything.** Instead of a separate OAuth app + GitHub App, I used a
  single GitHub App for both user sign-in (user-to-server OAuth) and installation tokens
  (webhooks + write-back). One registration, a cleaner story, and it covers the GitHub-App
  stretch goal.
- **Belt-and-suspenders idempotency.** The event is persisted to Postgres before the
  webhook returns 200; BullMQ uses `jobId = deliveryId` so a redelivery can't create a
  second job; and each write-back checks the `ActionLog` before acting. Any one of these
  alone is insufficient under retries — together they guarantee "never do the same thing
  twice."
- **AI is strictly non-fatal.** `AiService.triage` returns `null` on any failure (missing
  key, HTTP error, unparseable JSON). The worker still labels/comments/notifies without it,
  so a flaky free LLM tier can never break the core flow.

## The hardest bug / wrong turn the AI led me into

The auth and webhook **e2e tests injected config via NestJS `ConfigModule`'s `load()`** and
passed — then later started failing with an empty `client_id` and `401`s on valid webhook
signatures. The AI's first fix was to add `ignoreEnvVars: true`; it **didn't work**, which
was the tell that the mental model was wrong.

Root cause: **importing `@prisma/client` auto-loads `apps/api/.env` into `process.env`**,
and **`@nestjs/config` gives `process.env` precedence over `load()`**. So the *empty*
placeholders in my local `.env` silently overrode the tests' injected values. It had only
"passed" earlier because of jest worker-scheduling luck.

How I noticed and fixed it: I isolated the variable — moving `.env` aside made the tests
pass — then confirmed the loader with a one-line probe
(`node -e "require('@prisma/client'); console.log(process.env.DATABASE_URL)"`), which
printed `""`. The fix was to set the needed vars directly on `process.env` in `beforeAll`
(a direct assignment beats `.env`), making the tests hermetic regardless of any local file.

Two smaller AI missteps in the same spirit: it first reached for the **latest Octokit
(v20+, ESM-only)**, which breaks a CommonJS NestJS build — I pinned v19; and a
**duplicate `ioredis` version** (BullMQ's vs my direct dependency) broke the Queue
connection types — fixed with a one-line pnpm `overrides` entry.

## What I'd improve with more time

- Slack **Block Kit** messages instead of plain text.
- **Per-repo SSE filtering** (today a global change signal triggers an ownership-scoped
  refetch — correct, but chattier than needed).
- A **live integration test** against ephemeral Redis/Postgres, plus pagination on the
  event log.
- Structured **OpenTelemetry** traces and a visible retry timeline beyond the current
  status/attempts/error fields.
