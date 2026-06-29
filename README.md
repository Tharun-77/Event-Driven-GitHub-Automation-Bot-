# Event-Driven GitHub Automation Bot

A web app + bot that reacts to activity in a GitHub repository. A user signs in with
GitHub, connects one or more repositories, and the bot receives webhooks (`issues`,
`pull_request`, `push`), writes back to GitHub (labels/comments), notifies Slack, runs
AI triage, and surfaces a live, login-gated dashboard with user-configurable rules.

> Full setup, environment, and deployment docs are filled in as the project is built.
> See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for the
> implementation plan.

## Monorepo layout

```
apps/
  api/   NestJS API + in-process BullMQ worker
  web/   Next.js (App Router) dashboard UI
docs/    design spec + implementation plan
```

## Tech stack

NestJS · Next.js · TypeScript · Prisma + Neon Postgres · BullMQ + Upstash Redis ·
Octokit (GitHub App) · Groq (AI) · Slack Incoming Webhook. Hosted on Render (API) +
Vercel (web). All services are free, no-card tiers.

## Local development (quick start)

```bash
# Requires Node 20+ and pnpm
pnpm install
cp .env.example apps/api/.env        # then fill in real values
pnpm dev                             # runs api + web
```

Environment variables are documented in [`.env.example`](./.env.example).
