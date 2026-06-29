# Event-Driven GitHub Automation Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a web app + bot that signs a user in with GitHub, receives webhooks from their connected repo(s), writes back to GitHub, notifies Slack, runs AI triage, and shows a live login-gated dashboard with user-configurable rules.

**Architecture:** A pnpm monorepo with a NestJS API (`apps/api`) and a Next.js UI (`apps/web`). The API runs the HTTP server and an in-process BullMQ worker. Webhooks are verified, deduped, persisted to Postgres, and enqueued; the worker drains the queue, evaluates rules, runs AI triage (Groq), writes back to GitHub via GitHub App installation tokens, and notifies Slack. The dashboard streams events over SSE.

**Tech Stack:** NestJS, Next.js (App Router), TypeScript, Prisma + Neon Postgres, BullMQ + Upstash Redis, Octokit, Groq SDK, Slack Incoming Webhook, Jest + supertest. Hosted on Render (API) + Vercel (web).

## Global Constraints

- **Free tier only, no credit card** anywhere. Neon, Upstash, Render, Vercel, Groq, Slack — all no-card free tiers.
- **TypeScript strict mode** on both apps.
- **Node 20 LTS**.
- **Package manager: pnpm** (workspaces).
- **Secrets only in environment variables.** Never commit real secrets. `.env.example` ships placeholders only. Nothing secret in the client bundle (only `NEXT_PUBLIC_*` is exposed to the browser, and only non-secret values).
- **One GitHub App** provides both user OAuth (sign-in) and installation tokens (webhooks + write-back).
- **Idempotency is mandatory:** the same `X-GitHub-Delivery` must never be processed twice.
- **Signature verification is mandatory:** every webhook is verified with `X-Hub-Signature-256` HMAC-SHA256 using constant-time comparison before any processing.
- **Conventional Commits**, frequent small commits, one logical change per commit.

---

## Phase 1 — Monorepo scaffold, Prisma, health, CI

### Task 1: Monorepo skeleton + tooling

**Files:**
- Create: `package.json` (root, pnpm workspace), `pnpm-workspace.yaml`, `.gitignore`, `.nvmrc`, `tsconfig.base.json`, `README.md` (stub)
- Create: `.env.example`

**Interfaces:**
- Produces: workspace layout `apps/api`, `apps/web`; root scripts `pnpm dev`, `pnpm lint`, `pnpm test`, `pnpm build`.

- [ ] **Step 1: Create workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
```

`.gitignore` (key entries):
```
node_modules
dist
.next
.env
.env.local
*.log
coverage
```

`.nvmrc`: `20`

Root `package.json`:
```json
{
  "name": "github-automation-bot",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  }
}
```

- [ ] **Step 2: Create `.env.example` with placeholders (no real values)**

```dotenv
# --- API (apps/api) ---
DATABASE_URL=postgresql://USER:PASSWORD@HOST/db?sslmode=require
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
JWT_SECRET=replace-with-long-random-string
SESSION_COOKIE_NAME=gha_session
WEB_ORIGIN=http://localhost:3000
API_BASE_URL=http://localhost:4000

# GitHub App (one app for OAuth + installation)
GITHUB_APP_ID=000000
GITHUB_APP_CLIENT_ID=Iv1.xxxxxxxx
GITHUB_APP_CLIENT_SECRET=replace-me
GITHUB_APP_PRIVATE_KEY_BASE64=base64-of-pem
GITHUB_WEBHOOK_SECRET=replace-with-long-random-string
GITHUB_APP_SLUG=your-app-slug

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# Groq
GROQ_API_KEY=replace-me
GROQ_MODEL=llama-3.3-70b-versatile

# --- Web (apps/web) ---
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore: scaffold pnpm monorepo, env example, gitignore"
```

### Task 2: NestJS API app + config + health endpoint

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/src/config/env.validation.ts`
- Create: `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.module.ts`
- Test: `apps/api/test/health.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /health` → `{ status: "ok", time: ISOString }`. Bootstrapped Nest app on `PORT` (default 4000) with global `ValidationPipe`, CORS limited to `WEB_ORIGIN` with credentials, cookie parsing, and Helmet.

- [ ] **Step 1: Init Nest app deps** (`@nestjs/common`, `@nestjs/core`, `@nestjs/config`, `@nestjs/platform-express`, `helmet`, `cookie-parser`, `zod`, plus dev `@nestjs/cli`, `jest`, `supertest`, `ts-jest`, `@types/*`). Add scripts: `dev` (`nest start --watch`), `build`, `start` (`node dist/main`), `lint`, `test`, `test:e2e`.

- [ ] **Step 2: Write env validation** in `config/env.validation.ts` using zod — parse `process.env`, fail fast on missing required vars. Export typed `Env`.

- [ ] **Step 3: Write the failing E2E test** `apps/api/test/health.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module';

describe('Health (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [HealthModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());

  it('GET /health returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.time).toBe('string');
  });
});
```

- [ ] **Step 4: Run it, verify it fails** — `pnpm --filter api test:e2e`. Expected: FAIL (module not found).

- [ ] **Step 5: Implement** `health.controller.ts` (`@Get('health')` returns `{ status: 'ok', time: new Date().toISOString() }`), `health.module.ts`, `app.module.ts` (imports `ConfigModule.forRoot({ validate })` + `HealthModule`), and `main.ts` (Helmet, `cookieParser`, CORS `{ origin: WEB_ORIGIN, credentials: true }`, global `ValidationPipe({ whitelist: true })`, listen on `PORT`).

- [ ] **Step 6: Run it, verify it passes.** Expected: PASS.

- [ ] **Step 7: Commit** — `feat(api): bootstrap NestJS app with config validation and health check`.

### Task 3: Prisma schema + client + migration

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`
- Test: `apps/api/test/prisma.spec.ts` (smoke: service connects/disconnects)

**Interfaces:**
- Produces: `PrismaService` (injectable, extends `PrismaClient`, `onModuleInit`/`onModuleDestroy`). Models per spec §6: `User`, `Installation`, `Repository`, `Rule`, `Event`, `ActionLog`.

- [ ] **Step 1: Add deps** `prisma`, `@prisma/client`. Add script `prisma:migrate` (`prisma migrate dev`), `prisma:generate`.

- [ ] **Step 2: Write `schema.prisma`** with exactly these models and constraints:

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id            String   @id @default(cuid())
  githubUserId  BigInt   @unique
  login         String
  avatarUrl     String?
  createdAt     DateTime @default(now())
  installations Installation[]
  repositories  Repository[]
}

model Installation {
  id                    String   @id @default(cuid())
  githubInstallationId  BigInt   @unique
  userId                String
  user                  User     @relation(fields: [userId], references: [id])
  createdAt             DateTime @default(now())
  repositories          Repository[]
}

model Repository {
  id             String   @id @default(cuid())
  githubRepoId   BigInt   @unique
  fullName       String
  installationId String
  installation   Installation @relation(fields: [installationId], references: [id])
  userId         String
  user           User     @relation(fields: [userId], references: [id])
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  rules          Rule[]
  events         Event[]
}

model Rule {
  id           String   @id @default(cuid())
  repositoryId String
  repository   Repository @relation(fields: [repositoryId], references: [id])
  name         String
  eventType    String   // issues | pull_request | push
  matchField   String   // title | body | author | label
  matchOp      String   // contains | equals
  matchValue   String
  actions      Json     // { addLabel?: bool, labelName?, postComment?: bool, commentBody?, slackNotify?: bool }
  enabled      Boolean  @default(true)
  createdAt    DateTime @default(now())
}

model Event {
  id             String   @id @default(cuid())
  deliveryId     String   @unique
  repositoryId   String?
  repository     Repository? @relation(fields: [repositoryId], references: [id])
  eventType      String
  action         String?
  payloadSummary Json
  status         String   @default("pending") // pending|processing|done|failed|dead_letter
  attempts       Int      @default(0)
  aiTriage       Json?
  receivedAt     DateTime @default(now())
  processedAt    DateTime?
  error          String?
  actionLogs     ActionLog[]
}

model ActionLog {
  id        String   @id @default(cuid())
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id])
  type      String   // label_added | comment_posted | slack_sent | ai_triage
  status    String   // success | failed
  detail    Json
  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Implement `PrismaService` + `PrismaModule`** (global module exporting the service).

- [ ] **Step 4: Generate client + run first migration** against a Neon dev branch: `pnpm --filter api prisma:migrate --name init`. Expected: migration applied, client generated.

- [ ] **Step 5: Commit** — `feat(api): add Prisma schema and service for core data model`.

### Task 4: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI** running on push/PR: setup pnpm + Node 20, `pnpm install`, `pnpm --filter api prisma:generate`, `pnpm lint`, `pnpm test`. (Use a dummy `DATABASE_URL` for generate; unit tests must not require a live DB.)

- [ ] **Step 2: Commit** — `ci: add lint+test workflow`.

---

## Phase 2 — Authentication (GitHub sign-in) + dashboard shell

### Task 5: GitHub App config service + App JWT

**Files:**
- Create: `apps/api/src/github/github-app.service.ts`, `apps/api/src/github/github.module.ts`
- Test: `apps/api/src/github/github-app.service.spec.ts`

**Interfaces:**
- Produces: `GithubAppService.createAppJwt(): string` (RS256, signed with the App private key, `iss = appId`, 9-min expiry); `getInstallationOctokit(installationId: number): Promise<Octokit>`; `exchangeOAuthCode(code: string): Promise<{ accessToken: string }>`; `getAuthenticatedUser(token: string): Promise<{ id: number; login: string; avatarUrl: string }>`.

- [ ] **Step 1: Add deps** `@octokit/rest`, `@octokit/auth-app`, `jsonwebtoken`, `@types/jsonwebtoken`.

- [ ] **Step 2: Write failing test** for `createAppJwt` — decode the produced JWT, assert `iss === appId` and `exp > iat`. Private key from a test fixture PEM (generated in test, not a real key).

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement** `createAppJwt` (read `GITHUB_APP_PRIVATE_KEY_BASE64`, decode base64 → PEM, `jwt.sign({ iss: appId }, pem, { algorithm: 'RS256', expiresIn: '9m' })`). Implement `getInstallationOctokit` via `@octokit/auth-app`, and OAuth helpers via Octokit/`fetch` to `https://github.com/login/oauth/access_token`.

- [ ] **Step 5: Run, verify pass. Commit** — `feat(api): GitHub App service (app JWT, installation octokit, oauth helpers)`.

### Task 6: Auth module — OAuth login, JWT session cookie, guard

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/jwt.guard.ts`, `apps/api/src/auth/current-user.decorator.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`, `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `GithubAppService.exchangeOAuthCode`, `getAuthenticatedUser`; `PrismaService`.
- Produces: `GET /auth/github/login` → 302 to GitHub authorize URL (with `state`); `GET /auth/github/callback?code&state` → upserts `User`, sets httpOnly JWT cookie (`SameSite=None`, `Secure`, name from `SESSION_COOKIE_NAME`), 302 to `WEB_ORIGIN/dashboard`; `POST /auth/logout` clears cookie; `GET /auth/me` → `{ id, login, avatarUrl }` or 401. `JwtGuard` protects routes; `@CurrentUser()` injects the user id.

- [ ] **Step 1: Add deps** `@nestjs/jwt`. CSRF `state` stored in a short-lived signed cookie.

- [ ] **Step 2: Write failing unit test** `auth.service.spec.ts`: `handleCallback` with a mocked `GithubAppService` returns a signed JWT and upserts the user (mock Prisma). Assert `prisma.user.upsert` called with `githubUserId` and a JWT is returned.

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement** `AuthService` (`buildAuthorizeUrl(state)`, `handleCallback(code)`, `issueJwt(userId)`, `verifyJwt`), controller (sets/clears cookie via `res.cookie`), `JwtGuard` (reads cookie, verifies, attaches `req.userId`), `@CurrentUser`.

- [ ] **Step 5: Write failing E2E** `auth.e2e-spec.ts`: `GET /auth/me` without cookie → 401; `GET /auth/github/login` → 302 with `location` containing `github.com/login/oauth/authorize`.

- [ ] **Step 6: Run, verify fail → implement wiring → verify pass.**

- [ ] **Step 7: Commit** — `feat(api): GitHub OAuth login with JWT session cookie and guard`.

### Task 7: Next.js web app shell + auth-gated dashboard

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx` (landing), `apps/web/app/dashboard/page.tsx`, `apps/web/middleware.ts`, `apps/web/lib/api.ts`
- Test: `apps/web/app/__tests__/landing.test.tsx` (renders "Sign in with GitHub")

**Interfaces:**
- Consumes: API `GET /auth/me`, `GET /auth/github/login`.
- Produces: landing page with "Sign in with GitHub" (links to `${API_BASE}/auth/github/login`); `/dashboard` server component that fetches `/auth/me` (credentials include) and redirects to `/` if 401; `lib/api.ts` `apiFetch(path, init)` helper that always sends `credentials:'include'` and prefixes `NEXT_PUBLIC_API_BASE_URL`.

- [ ] **Step 1: Init Next app** (App Router, TS, ESLint, no Tailwind required — minimal CSS). Add `react-testing-library` + `jest` for the component test. Apply **vercel-react-best-practices** patterns (server components by default, fetch on the server, no unnecessary client components).

- [ ] **Step 2: Write failing test** `landing.test.tsx`: render landing, assert a link/button with text "Sign in with GitHub" and correct href.

- [ ] **Step 3: Run fail → implement landing + layout → pass.**

- [ ] **Step 4: Implement `/dashboard`** as a server component that calls `apiFetch('/auth/me')`; on 401 `redirect('/')`. Render the signed-in user's login + a placeholder for the event log (filled in Phase 6).

- [ ] **Step 5: Commit** — `feat(web): landing + auth-gated dashboard shell`.

---

## Phase 3 — Connect repository (GitHub App install)

### Task 8: Repositories module — install callback + list + connect link

**Files:**
- Create: `apps/api/src/repositories/repositories.controller.ts`, `repositories.service.ts`, `repositories.module.ts`
- Test: `apps/api/src/repositories/repositories.service.spec.ts`

**Interfaces:**
- Consumes: `GithubAppService.getInstallationOctokit`, `PrismaService`, `JwtGuard`.
- Produces: `GET /repositories/install-url` → `{ url }` (GitHub App install URL `https://github.com/apps/<slug>/installations/new?state=<userId-signed>`); `GET /repositories/setup/callback?installation_id&state` → stores `Installation` + lists installed repos via installation Octokit, upserts `Repository` rows for the current user, redirects to `WEB_ORIGIN/dashboard`; `GET /repositories` (guarded) → user's repos; `PATCH /repositories/:id` toggles `active`.

- [ ] **Step 1: Write failing test** `repositories.service.spec.ts`: `handleSetup(userId, installationId)` with mocked Octokit returning two repos → upserts an `Installation` and two `Repository` rows (assert Prisma calls + `githubRepoId` mapping).

- [ ] **Step 2: Run fail → implement service** (`listInstallationRepos`, `handleSetup`, `listForUser`, `setActive`).

- [ ] **Step 3: Implement controller** (guarded except the setup callback, which validates `state`).

- [ ] **Step 4: Run pass. Commit** — `feat(api): connect repositories via GitHub App installation (multi-repo)`.

### Task 9: Web — connect repository UI + repo switcher

**Files:**
- Create: `apps/web/app/dashboard/ConnectRepo.tsx` (client), `apps/web/app/dashboard/RepoSwitcher.tsx` (client)
- Modify: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /repositories`, `GET /repositories/install-url`.
- Produces: "Connect repository" button (opens install URL); repo switcher selecting the active repo (stored in URL query `?repo=<id>`).

- [ ] **Step 1: Implement** the two client components and wire into the dashboard. Server component fetches repos; switcher updates `?repo=`.
- [ ] **Step 2: Commit** — `feat(web): connect-repo button and multi-repo switcher`.

---

## Phase 4 — Webhook ingest (verify + dedupe + enqueue) — CORE RELIABILITY

### Task 10: Signature verification utility (full TDD)

**Files:**
- Create: `apps/api/src/webhooks/verify-signature.ts`
- Test: `apps/api/src/webhooks/verify-signature.spec.ts`

**Interfaces:**
- Produces: `verifySignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean` — computes `sha256=` HMAC and compares with `crypto.timingSafeEqual`; returns `false` on missing/short/mismatched header without throwing.

- [ ] **Step 1: Write the failing test:**

```ts
import { createHmac } from 'crypto';
import { verifySignature } from './verify-signature';

const secret = 'topsecret';
const body = Buffer.from(JSON.stringify({ hello: 'world' }));
const good = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

describe('verifySignature', () => {
  it('accepts a valid signature', () => {
    expect(verifySignature(body, good, secret)).toBe(true);
  });
  it('rejects a tampered body', () => {
    expect(verifySignature(Buffer.from('{"hello":"evil"}'), good, secret)).toBe(false);
  });
  it('rejects a wrong secret', () => {
    expect(verifySignature(body, good, 'other')).toBe(false);
  });
  it('rejects a missing header', () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });
  it('rejects a malformed header', () => {
    expect(verifySignature(body, 'garbage', secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `pnpm --filter api test verify-signature`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement minimally:**

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export function verifySignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run, verify all pass.**

- [ ] **Step 5: Commit** — `feat(api): constant-time webhook signature verification`.

### Task 11: Raw-body capture + webhook controller (verify → dedupe → persist → enqueue)

**Files:**
- Create: `apps/api/src/webhooks/webhooks.controller.ts`, `webhooks.service.ts`, `webhooks.module.ts`
- Modify: `apps/api/src/main.ts` (raw body for the webhook route)
- Test: `apps/api/src/webhooks/webhooks.service.spec.ts`, `apps/api/test/webhooks.e2e-spec.ts`

**Interfaces:**
- Consumes: `verifySignature`, `PrismaService`, `QueueService.enqueueEvent` (Task 13).
- Produces: `POST /webhooks/github` — reads raw body, verifies signature (else 401), parses, extracts `deliveryId = X-GitHub-Delivery` + `eventType = X-GitHub-Event`; `ingest()` upserts an `Event` keyed by `deliveryId` (skip if exists → returns `{ duplicate: true }`), enqueues a job (`jobId = deliveryId`), returns 200. `WebhooksService.ingest(headers, payload): Promise<{ accepted: boolean; duplicate: boolean }>`.

- [ ] **Step 1: Configure raw body** — in `main.ts` use `express.json({ verify: (req,_res,buf) => { (req as any).rawBody = buf; } })` so the controller can access `req.rawBody` for HMAC while still parsing JSON.

- [ ] **Step 2: Write failing unit test** `webhooks.service.spec.ts`:
  - `ingest` with a new `deliveryId` → creates an `Event` and calls `queue.enqueueEvent` once.
  - `ingest` with an existing `deliveryId` (Prisma create throws unique violation, OR pre-check finds it) → returns `{ duplicate: true }` and does **not** enqueue. (Assert `enqueueEvent` not called.)

```ts
it('processes a new delivery once and enqueues', async () => {
  prisma.event.findUnique.mockResolvedValue(null);
  prisma.event.create.mockResolvedValue({ id: 'e1', deliveryId: 'd1' });
  const res = await service.ingest(headers('d1', 'issues'), issuePayload);
  expect(res).toEqual({ accepted: true, duplicate: false });
  expect(queue.enqueueEvent).toHaveBeenCalledTimes(1);
});

it('does not enqueue a duplicate delivery', async () => {
  prisma.event.findUnique.mockResolvedValue({ id: 'e1', deliveryId: 'd1' });
  const res = await service.ingest(headers('d1', 'issues'), issuePayload);
  expect(res.duplicate).toBe(true);
  expect(queue.enqueueEvent).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run fail → implement `ingest`** (resolve `repositoryId` from payload repo id; `findUnique` on `deliveryId`; on miss `create` then `enqueueEvent`; wrap `create` in try/catch for the unique-violation race → treat as duplicate).

- [ ] **Step 4: Write failing E2E** `webhooks.e2e-spec.ts` (mock `QueueService` + Prisma): valid signature → 200; **invalid signature → 401**; **same delivery twice → second is `duplicate`, enqueue called once total**.

- [ ] **Step 5: Run fail → implement controller + module → pass.**

- [ ] **Step 6: Commit** — `feat(api): webhook ingest with signature verify, idempotent dedupe, enqueue`.

---

## Phase 5 — Queue + worker (write-back + Slack) — CORE FLOW

### Task 12: Rule matching engine (full TDD)

**Files:**
- Create: `apps/api/src/rules/rule-matcher.ts`, `apps/api/src/rules/rule.types.ts`
- Test: `apps/api/src/rules/rule-matcher.spec.ts`

**Interfaces:**
- Produces: `extractFields(eventType, payload): { title; body; author; labels: string[] }`; `ruleMatches(rule: RuleLike, fields): boolean` (case-insensitive `contains`/`equals`, label match against any label). `RuleLike = { eventType; matchField; matchOp; matchValue; enabled }`.

- [ ] **Step 1: Write failing tests** covering: title `contains` "bug" matches/doesn't; `equals` author; label match; disabled rule never matches; event-type mismatch never matches.

```ts
const base = { eventType: 'issues', enabled: true } as const;
it('matches title contains (case-insensitive)', () => {
  expect(ruleMatches({ ...base, matchField: 'title', matchOp: 'contains', matchValue: 'Bug' },
    { title: 'login bug here', body: '', author: 'x', labels: [] })).toBe(true);
});
it('does not match when disabled', () => {
  expect(ruleMatches({ ...base, enabled: false, matchField: 'title', matchOp: 'contains', matchValue: 'bug' },
    { title: 'bug', body: '', author: 'x', labels: [] })).toBe(false);
});
it('matches a label equals', () => {
  expect(ruleMatches({ ...base, matchField: 'label', matchOp: 'equals', matchValue: 'urgent' },
    { title: '', body: '', author: 'x', labels: ['urgent','p1'] })).toBe(true);
});
```

- [ ] **Step 2: Run fail → implement `extractFields` (per event type) + `ruleMatches`.**

- [ ] **Step 3: Run pass. Commit** — `feat(api): rule matching engine`.

### Task 13: Queue module (BullMQ + Upstash)

**Files:**
- Create: `apps/api/src/queue/queue.service.ts`, `apps/api/src/queue/queue.module.ts`, `apps/api/src/queue/queue.constants.ts`
- Test: `apps/api/src/queue/queue.service.spec.ts`

**Interfaces:**
- Produces: `QueueService.enqueueEvent(eventId: string, deliveryId: string): Promise<void>` — adds a job to the `events` queue with `jobId = deliveryId` (BullMQ-level dedupe), `attempts: 5`, `backoff: { type: 'exponential', delay: 2000 }`, `removeOnComplete: 1000`. Exposes the BullMQ `Queue` and a factory for the `Worker` (consumed by Task 14).

- [ ] **Step 1: Add deps** `bullmq`, `ioredis`.

- [ ] **Step 2: Write failing test** that `enqueueEvent` calls `queue.add('process', { eventId }, { jobId: deliveryId, attempts: 5, ... })` (mock the BullMQ `Queue`).

- [ ] **Step 3: Run fail → implement** `QueueService` (construct `Queue('events', { connection })` from `REDIS_URL`).

- [ ] **Step 4: Run pass. Commit** — `feat(api): BullMQ queue service with idempotent jobId and backoff`.

### Task 14: Slack notifier + GitHub write-back services

**Files:**
- Create: `apps/api/src/slack/slack.service.ts`, `apps/api/src/slack/slack.module.ts`
- Create: `apps/api/src/github/github-writeback.service.ts`
- Test: `apps/api/src/slack/slack.service.spec.ts`, `apps/api/src/github/github-writeback.service.spec.ts`

**Interfaces:**
- Produces: `SlackService.notify(blocks: SlackMessage): Promise<void>` (POST to `SLACK_WEBHOOK_URL`, throws on non-2xx so the worker can retry); `GithubWritebackService.addLabel(installationId, owner, repo, issueNumber, label)` and `postComment(installationId, owner, repo, issueNumber, body)` via installation Octokit. Both write-back methods are **safe to retry** (caller checks `ActionLog` first).

- [ ] **Step 1: Write failing test** `slack.service.spec.ts`: mock `fetch`; `notify` posts JSON and throws when response is 500.

- [ ] **Step 2: Run fail → implement `SlackService`.**

- [ ] **Step 3: Write failing test** `github-writeback.service.spec.ts`: mock `GithubAppService.getInstallationOctokit`; `addLabel` calls `octokit.issues.addLabels` with the right args.

- [ ] **Step 4: Run fail → implement `GithubWritebackService`.**

- [ ] **Step 5: Run pass. Commit** — `feat(api): Slack notifier and GitHub write-back services`.

### Task 15: Event processor (worker) — orchestration + idempotent actions

**Files:**
- Create: `apps/api/src/queue/event.processor.ts`
- Modify: `apps/api/src/queue/queue.module.ts` (start the `Worker` on bootstrap)
- Test: `apps/api/src/queue/event.processor.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `RulesService`/`rule-matcher`, `AiService` (Task 18, optional), `GithubWritebackService`, `SlackService`.
- Produces: `EventProcessor.process(eventId: string): Promise<void>` — loads the `Event` + repo + rules; sets `status=processing`, `attempts++`; for each matching rule runs actions **idempotently** (before each action, check `ActionLog` for an existing `success` of that `type` for this event → skip if present); records an `ActionLog` per action; on full success `status=done, processedAt=now`; on throw, rethrow so BullMQ retries; the BullMQ `failed` handler (after final attempt) sets `status=dead_letter` + writes a `failed` ActionLog.

- [ ] **Step 1: Write failing test** `event.processor.spec.ts`:
  - Given an event matching a rule with `addLabel`, `process` calls `writeback.addLabel` once and writes a `label_added` ActionLog, sets `status=done`.
  - **Idempotency:** if an `ActionLog` `label_added` `success` already exists, `process` does **not** call `addLabel` again (retry safety).
  - If `writeback.addLabel` throws, `process` rethrows (so BullMQ retries) and does not mark `done`.

- [ ] **Step 2: Run fail → implement `EventProcessor.process`** with the idempotent action guard.

- [ ] **Step 3: Wire the BullMQ `Worker`** in `queue.module.ts` (`new Worker('events', job => processor.process(job.data.eventId), { connection })`), plus `worker.on('failed', ...)` → mark `dead_letter` when `job.attemptsMade >= job.opts.attempts`.

- [ ] **Step 4: Run pass. Commit** — `feat(api): event worker with idempotent write-back + Slack and dead-letter on exhaustion`.

---

## Phase 6 — Dashboard event/action log (SSE)

### Task 16: Events query API + SSE stream

**Files:**
- Create: `apps/api/src/events/events.controller.ts`, `events.service.ts`, `events.module.ts`, `events.emitter.ts`
- Modify: `apps/api/src/queue/event.processor.ts` (emit on status change)
- Test: `apps/api/src/events/events.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtGuard`.
- Produces: `GET /events?repo=<id>` (guarded) → recent events + their action logs for repos the user owns; `GET /events/stream?repo=<id>` (guarded) → SSE pushing `{ type: 'event', data }` on every status change. `EventsEmitter` (in-process `EventEmitter`) is published to by the processor and subscribed to by the SSE handler.

- [ ] **Step 1: Write failing test** `events.service.spec.ts`: `listForUser(userId, repoId)` returns only events for repos owned by the user (mock Prisma; assert the `where` includes the ownership filter).

- [ ] **Step 2: Run fail → implement service + controller (`@Sse('events/stream')` returning an `Observable`).**

- [ ] **Step 3: Wire processor to emit** `eventsEmitter.emit('change', eventId)` after each status change.

- [ ] **Step 4: Run pass. Commit** — `feat(api): event list API and SSE live stream (ownership-scoped)`.

### Task 17: Dashboard event/action log UI (live)

**Files:**
- Create: `apps/web/app/dashboard/EventLog.tsx` (client), `apps/web/lib/useEventStream.ts`
- Modify: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /events?repo=`, `GET /events/stream?repo=`.
- Produces: a live table of events (type, action, status, attempts, time) each expandable to its action logs + AI triage; subscribes to SSE via `EventSource` and prepends/updates rows.

- [ ] **Step 1: Implement `useEventStream`** (opens `EventSource` with credentials, dedupes by event id, cleans up on unmount). Apply **vercel-react-best-practices** (keep client component lean, stable keys, no needless re-renders).

- [ ] **Step 2: Implement `EventLog` + wire into dashboard. Commit** — `feat(web): live event/action log via SSE`.

---

## Phase 7 — Stretch: Rules CRUD, AI triage, multi-repo polish

### Task 18: AI triage service (Groq) — non-fatal

**Files:**
- Create: `apps/api/src/ai/ai.service.ts`, `apps/api/src/ai/ai.module.ts`
- Modify: `apps/api/src/queue/event.processor.ts` (call AI before write-back; store `aiTriage`; never fail the event on AI error)
- Test: `apps/api/src/ai/ai.service.spec.ts`

**Interfaces:**
- Produces: `AiService.triage(input: { title; body }): Promise<{ summary: string; suggestedLabel: string; priority: 'low'|'medium'|'high' } | null>` — calls Groq chat completions with a strict JSON-only prompt, parses/validates with zod, returns `null` on any error (logged). Model from `GROQ_MODEL`.

- [ ] **Step 1: Add dep** `groq-sdk` (or use `fetch` to the Groq OpenAI-compatible endpoint).

- [ ] **Step 2: Write failing test** `ai.service.spec.ts`: mock the Groq client; valid JSON content → parsed object; invalid/garbage content or thrown error → `null` (assert non-fatal).

- [ ] **Step 3: Run fail → implement `triage`** with zod validation + try/catch → `null`.

- [ ] **Step 4: Wire into processor:** run `triage` first; persist `event.aiTriage`; write an `ai_triage` ActionLog; include summary/label/priority in the Slack message. AI failure must not block label/comment/Slack.

- [ ] **Step 5: Run pass. Commit** — `feat(api): Groq AI triage (summary/label/priority), non-fatal and idempotent`.

### Task 19: Rules CRUD API

**Files:**
- Create: `apps/api/src/rules/rules.controller.ts`, `rules.service.ts`, `rules.module.ts`, `rules/dto/*.ts`
- Test: `apps/api/src/rules/rules.service.spec.ts`, `apps/api/test/rules.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtGuard`.
- Produces: guarded `GET/POST/PATCH/DELETE /repositories/:repoId/rules` with ownership checks; DTO validation (zod/class-validator) for `eventType`, `matchField`, `matchOp`, `matchValue`, `actions`.

- [ ] **Step 1: Write failing test** that creating a rule on a repo the user does not own → 403/404; valid create persists.
- [ ] **Step 2: Run fail → implement service (ownership-scoped) + controller + DTOs.**
- [ ] **Step 3: Run pass. Commit** — `feat(api): user-configurable rules CRUD (ownership-scoped)`.

### Task 20: Rules editor UI

**Files:**
- Create: `apps/web/app/dashboard/RulesEditor.tsx` (client), `apps/web/app/dashboard/RuleForm.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: rules CRUD endpoints.
- Produces: list of rules for the active repo + a form (WHEN event/field/op/value THEN add-label/comment/slack) to create/edit/delete/enable.

- [ ] **Step 1: Implement editor + form, wire into dashboard. Commit** — `feat(web): rules editor UI`.

### Task 21: Seed a default rule on repo connect

**Files:**
- Modify: `apps/api/src/repositories/repositories.service.ts`

**Interfaces:**
- Produces: on first connect of a repo, create a sensible default rule (`issues` title contains `bug` → add label `bug` + Slack) so the demo works immediately.

- [ ] **Step 1: Add default-rule creation in `handleSetup`. Commit** — `feat(api): seed default rule on repo connect`.

---

## Phase 8 — Deployment + documentation

### Task 22: Production config, Procfile/start, CORS/cookies for cross-site

**Files:**
- Modify: `apps/api/src/main.ts` (trust proxy, prod cookie flags), `apps/api/package.json` (`start` runs migrations then `node dist/main`)
- Create: `render.yaml` (optional blueprint), `apps/web/.env.production` notes in README

- [ ] **Step 1: Ensure prod cookies** `Secure`, `SameSite=None`, and CORS `origin = WEB_ORIGIN` with `credentials: true`. `app.set('trust proxy', 1)`.
- [ ] **Step 2: `start` script** runs `prisma migrate deploy && node dist/main`.
- [ ] **Step 3: Commit** — `chore(api): production cookie/CORS settings and migrate-on-start`.

### Task 23: Deploy (Neon, Upstash, Render, Vercel, GitHub App, Slack, Groq)

**Files:** none (operational); record exact steps in README.

- [ ] **Step 1: Provision** Neon (DATABASE_URL), Upstash Redis (REDIS_URL), Groq key, Slack Incoming Webhook.
- [ ] **Step 2: Create the GitHub App** — webhook URL `https://<render-api>/webhooks/github`, webhook secret, permissions (Issues: R/W, Pull requests: R/W, Metadata: R), subscribe to `issues`, `pull_request`, `push`; enable user OAuth; generate a private key (base64 it).
- [ ] **Step 3: Deploy API to Render** (web service, all env vars set), **web to Vercel** (`NEXT_PUBLIC_API_BASE_URL` = Render URL). Update `WEB_ORIGIN`/`API_BASE_URL` to the live URLs and the GitHub App callback URLs.
- [ ] **Step 4: Set up an external `/health` pinger** (UptimeRobot/cron-job.org, free) every ~10 min.
- [ ] **Step 5: End-to-end smoke** — open an issue titled "bug: test" on the demo repo → see label added + Slack message + dashboard row + AI triage. Send a duplicate delivery from the GitHub App "Advanced" redeliver → confirm it is **not** processed twice.
- [ ] **Step 6: Commit** any config tweaks discovered during deploy.

### Task 24: README, AI_NOTES, CLAUDE.md, .env.example finalization

**Files:**
- Create/Modify: `README.md`, `AI_NOTES.md`, `CLAUDE.md`
- Verify: `.env.example` matches all required vars and contains no real secrets.

- [ ] **Step 1: Write `README.md`** — what it does, architecture diagram, local run (pnpm install, env, prisma migrate, dev), required env vars, deployment steps (Render/Vercel/Neon/Upstash/GitHub App/Slack/Groq), test instructions, a demo repo + how to point a webhook, and how idempotency/signature verification work.
- [ ] **Step 2: Write `AI_NOTES.md`** (~1 page) — tools/models used and the human/AI split, 2–3 self-made decisions (single GitHub App for OAuth+install; BullMQ idempotent `jobId=deliveryId`; AI made non-fatal), the hardest AI wrong turn (record the real one encountered), and what to improve with more time.
- [ ] **Step 3: Write `CLAUDE.md`** — project conventions (pnpm monorepo, NestJS module pattern, Prisma, TDD, Conventional Commits, secrets-in-env rule) reflecting how we actually worked.
- [ ] **Step 4: Final secret scan** — confirm no secrets committed (`git grep` for obvious tokens; review `.env.example`).
- [ ] **Step 5: Commit** — `docs: README, AI_NOTES, CLAUDE.md and finalized env example`.

---

## Self-Review

**Spec coverage:**
- Core: deployed app (T22-23), GitHub sign-in (T5-7), webhook ≥2 event types (T10-11, issues+pull_request+push), write-back (T14-15), Slack (T14-15), dashboard log behind login (T16-17), README (T24). ✓
- Reliability: signature verify (T10), idempotency (T11, T13 jobId, T15 action guard), durable retries/dead-letter (T13, T15), visible history (T16-17). ✓
- Security: HMAC (T10), secrets in env (T1, T24), httpOnly/Secure cookies + CORS (T6, T22). ✓
- Stretch: configurable rules (T19-20), AI triage (T18), GitHub App auth (T5, T8), multi-repo (T8-9). ✓

**Placeholder scan:** Boilerplate-heavy UI/controller tasks describe exact files + interfaces + key code; correctness cores (T10, T11, T12, T15, T18) carry full test code. No "TBD"/"handle edge cases" left as the actual deliverable.

**Type consistency:** `verifySignature(rawBody, signatureHeader, secret)`, `ingest(headers, payload)`, `enqueueEvent(eventId, deliveryId)` with `jobId=deliveryId`, `EventProcessor.process(eventId)`, `AiService.triage({title, body})` are used consistently across producing and consuming tasks.
