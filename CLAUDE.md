# CLAUDE.md

Context for working in this repo. It's a pnpm monorepo: a NestJS API (`apps/api`) with an
in-process BullMQ worker, and a Next.js UI (`apps/web`). It signs a user in with a GitHub
App, ingests webhooks, writes back to GitHub, notifies Slack, runs Groq AI triage, and
shows a live login-gated dashboard with configurable rules.

## Commands

```bash
pnpm install
pnpm dev                            # api (:4000) + web (:3000)
pnpm test                           # all unit tests
pnpm --filter @app/api test:e2e     # API e2e
pnpm lint                           # eslint (run `npx eslint … --fix` in apps/api to autofix)
pnpm --filter @app/api build        # nest build
pnpm --filter @app/api prisma:migrate   # apply schema (needs DATABASE_URL)
pnpm --filter @app/api prisma:generate  # regenerate client after schema edits
```

## Conventions

- **TypeScript strict** everywhere. Node 20+.
- **NestJS: one module per feature**, constructor injection, `class-validator` DTOs, typed
  HTTP exceptions, Swagger decorators (`/docs`). Prisma (not TypeORM) for data.
- **TDD for core logic** (signature verify, dedupe, rule matching, the worker): write the
  failing test first, then the minimal implementation.
- **Conventional Commits**, one logical change per commit.
- **Secrets only in env.** `.env.example` ships placeholders. Nothing secret in the client
  bundle (only `NEXT_PUBLIC_*`).

## Invariants (don't regress these)

- **Webhook signature** is HMAC-SHA256 verified with `crypto.timingSafeEqual` before any
  processing (`src/webhooks/verify-signature.ts`). Forged → 401.
- **Idempotency** is threefold: unique `Event.deliveryId`, BullMQ `jobId = deliveryId`, and
  an `ActionLog`-keyed check before each write-back. Retries must never double-act.
- **Durability:** persist the event before returning 200; the worker retries with backoff;
  exhausted jobs become `dead_letter`.
- **AI is non-fatal:** `AiService.triage` returns `null` on any error; the worker proceeds.

## Gotchas (learned the hard way)

- **Octokit pinned to v19 (CommonJS).** v20+ is ESM-only and breaks the CJS NestJS build.
- **`ioredis` deduped to 5.10.1** via `pnpm overrides` in `pnpm-workspace.yaml` so its types
  match BullMQ's expected connection type.
- **`msgpackr-extract` build is disabled** (`allowBuilds: false`); BullMQ uses the JS
  fallback. Avoids native build issues across Windows/Linux.
- **`@prisma/client` auto-loads `apps/api/.env` into `process.env` on import**, and
  `@nestjs/config` gives `process.env` precedence over `load()`. Tests set the vars they
  need on `process.env` in `beforeAll` for hermeticity — do not rely on `load()` to win.
- **BigInt** (GitHub IDs) is JSON-serialized via a prototype patch in `main.ts`; map to
  strings in DTOs and never return a raw `BigInt`.
- **Cross-domain auth:** the session cookie lives on the API domain. The UI calls the API
  with `credentials: 'include'`; the dashboard auth check is **client-side**. The API's
  `JwtGuard` on every data endpoint is the real boundary.
- **The worker is co-located** in the API process and only starts when `REDIS_URL` is set.
- **`rawBody: true`** is passed to `NestFactory.create` so the webhook controller can verify
  the HMAC over the exact bytes.
- Many secret env vars are **optional in the zod schema** and guarded at call time, so the
  app boots before the external services are provisioned.

## Layout

```
apps/api/src/{auth,github,repositories,webhooks,queue,rules,events,ai,slack,health,prisma}
apps/web/app/{page.tsx, dashboard/*}   apps/web/lib/*
docs/superpowers/{specs,plans}         render.yaml
```
