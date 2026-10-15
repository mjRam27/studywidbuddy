# StudywidBuddy

**Learn together. Build together. Grow together.**

StudywidBuddy matches you with someone learning the same thing at your level, gives you a shared place to study, then turns what you learned into team-project experience and a profile that proves it.

This repository is the full product: an Angular web app, a NestJS API, PostgreSQL, and the infrastructure around them. The visual design comes from the Claude Design handoff in [`project-scope-and-direction/`](project-scope-and-direction/) and is the source of truth for every screen.

- **Where things stand:** [docs/ROADMAP.md](docs/ROADMAP.md)
- **How it's built and why:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **What the repo looked like at the start:** [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)

## Quick start

Requirements: Node 20.11+ (22 LTS recommended), Docker Desktop, and Chrome for the web tests.

```bash
npm run setup                     # installs root, API and web dependencies
npm run infra:up                  # Postgres 17 + pgvector on :5433, Redis on :6380

cp apps/api/.env.example apps/api/.env
# then set JWT_ACCESS_SECRET in apps/api/.env:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm --prefix apps/api run db:deploy   # apply migrations
npm run db:seed                       # demo data (refuses to run in production)

npm run dev:api                   # http://localhost:3000/api/v1  · Swagger at /api/docs
npm run dev:web                   # http://localhost:4200 (proxies /api to :3000)
```

Sign in with the demo account `manoj_dev@demo.studywidbuddy.local` / `studywidbuddy-demo`, or register a new one. In development, verification and password-reset emails are printed to the API console instead of being sent.

## Repository layout

```
apps/api/            NestJS API (modular monolith), Prisma schema + migrations, e2e tests
apps/web/            Angular 19 app (standalone components, signals, lazy routes)
packages/shared/     Enums and API contract types shared by both apps (source, path alias)
infrastructure/      docker-compose for Postgres + Redis (and an opt-in full-stack profile)
docs/                Architecture, roadmap and decision records
.github/workflows/   CI
project-scope-and-direction/   Design handoff bundle (reference only, not built)
```

There are no npm workspaces: the development drive is exFAT, which can't hold the symlinks workspaces need, so each app has its own `node_modules` and both import `packages/shared` through a TypeScript path alias.

## Everyday commands

| Command                                | What it does                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run lint`                         | ESLint for API, web and templates (incl. accessibility rules)                       |
| `npm run format` / `format:check`      | Prettier                                                                            |
| `npm run typecheck`                    | Shared, API and web type checks                                                     |
| `npm test`                             | API unit + e2e tests (real Postgres, test database) and web tests (headless Chrome) |
| `npm run build`                        | Production builds of API and web                                                    |
| `npm --prefix apps/api run db:check`   | Fails if `schema.prisma` and the migrations drift apart                             |
| `npm --prefix apps/api run db:migrate` | Create a migration interactively (in a TTY)                                         |

API e2e tests run against `studywidbuddy_test` (created by the compose init script) and truncate it between files; they never touch development data.

## Running everything in containers

```bash
docker compose -f infrastructure/docker-compose.yml --profile app up --build
# → http://localhost:8080  (nginx serves the web app and proxies /api to the API container)
```

The API container applies pending migrations at start. Seed demo data separately if you want it.

## Configuration

All secrets come from environment variables; see [`apps/api/.env.example`](apps/api/.env.example). Nothing secret is committed. Integrations that need accounts (LLM provider, SMTP, GitHub App, object storage, video SFU) have their boundaries built and are listed with what they need in [docs/ROADMAP.md](docs/ROADMAP.md#needs-a-decision-or-credentials).
