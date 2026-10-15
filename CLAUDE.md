# CLAUDE.md

Guidance for Claude Code working in this repository. Product brief, architecture and status live in `docs/` (start with `docs/ROADMAP.md`); this file covers how to work here without tripping on the repo's quirks.

## What this is

StudywidBuddy: learn with a matched Study Buddy → build in simulated project teams → grow a profile and find jobs. Full-stack: Angular 19 (`apps/web`), NestJS 11 + Prisma + PostgreSQL 17 (`apps/api`), shared contracts (`packages/shared`). Built milestone by milestone; `docs/ROADMAP.md` is the source of truth for what's done.

## Design is the source of truth

- `project-scope-and-direction/project/*.dc.html` are the design prototypes (`support.js` is only their template runtime). Match them visually; don't redesign.
- Tokens: `apps/web/src/styles/tokens.css` (light + designed dark palette from `Foundations.dc.html`). Visual rules live in global CSS under `apps/web/src/styles/`, not in component styles.
- New screens reuse the same language: Bricolage Grotesque for titles only, Instrument Sans for UI, JetBrains Mono for labels/IDs; Material Symbols Rounded icons; AI work marked with the cyan diamond + mono role label and dashed frame; status always icon + label, never colour alone.

## Non-obvious environment facts

- **The repo is on an exFAT drive: no symlinks, so no npm workspaces.** Each app has its own `node_modules`; both import `@studywidbuddy/shared` via a tsconfig path alias to `packages/shared/src`. The API's Nest build rewrites the alias; jest uses `moduleNameMapper`; the seed uses `tsconfig-paths`. Don't add `"workspaces"` or `file:` deps.
- Windows: npm scripts run under `cmd.exe`, so `$VAR` doesn't expand in `package.json` scripts — use a small Node script instead (see `apps/api/prisma/check-drift.js`).
- Docker services (`npm run infra:up`): Postgres on **5433**, Redis on **6380**. Databases: `studywidbuddy` (dev), `studywidbuddy_test` (e2e, truncated freely), `studywidbuddy_shadow` (drift check).
- **`prisma migrate dev` hangs in non-interactive shells.** Create migrations with `npx prisma migrate dev --create-only --name x` (or write SQL by hand), then `npx prisma migrate deploy`. Always run `npm --prefix apps/api run db:check` afterwards.
- **`prisma migrate reset` is blocked for agents** without the user's explicit consent. Don't try to work around it; the seed is idempotent and updates rows in place.
- Hand-written SQL in migrations (partial unique indexes, CHECKs) is intentional; declare anything Prisma can express (e.g. GIN trigram indexes) in the schema too, or `db:check` reports drift.

## Commands

```bash
npm run dev:api        # API on :3000 (/api/v1, Swagger /api/docs)
npm run dev:web        # web on :4200, proxies /api → :3000
npm run lint           # ESLint incl. Angular template a11y rules
npm run format         # Prettier
npm --prefix apps/api test            # unit + e2e (must be --runInBand; the script does it)
npm --prefix apps/web test            # Karma, ChromeHeadless (set CHROME_BIN if Chrome isn't found)
npm --prefix apps/api run db:check    # schema/migration drift
npm run db:seed                       # demo data, refuses in production
```

Demo login: `manoj_dev@demo.studywidbuddy.local` / `studywidbuddy-demo` (admin: `admin@demo.studywidbuddy.local`). Dev emails (verify/reset links) print to the API console.

## Backend conventions

- One Nest module per domain; other modules call its service, never its tables. Controllers stay thin.
- Throw `DomainError` (`common/errors/domain-error.ts`) with a stable `ErrorCode` from `packages/shared/src/errors.ts`; the global filter shapes `{ error: { code, message, details? } }`. Never leak stack traces.
- Every route is authenticated unless `@Public()`. Ownership checks live in services; another user's private resource is a **404**, not 403.
- DTOs use class-validator; the global pipe has `whitelist` + `forbidNonWhitelisted` (mass-assignment guard). Return mapped view types from `packages/shared`, never raw Prisma rows.
- Business rules that matter (four-course limit, status machines) are pure functions with unit tests, enforced again in the DB where possible (row locks, partial unique indexes), and covered by e2e tests including concurrency.
- New Prisma enums must be mirrored in `packages/shared/src/enums.ts` (a unit test checks).
- LLM output is untrusted: validate with zod before it touches state. No API keys in code; everything from env (`apps/api/.env.example`).
- AI calls pick a tier: `tier: 'fast'` (Haiku) for chat/voice/question writing, default smart (Opus) for anything that judges people or changes state. See `docs/AI.md`.
- The AI PM (`src/pm/`) acts only through `ToolRegistry`. New tools need a zod schema, a risk level, and a label; anything that changes tasks must be `NEEDS_APPROVAL`. See `docs/AGENTS.md`.
- Realtime: writes go through REST, then `RealtimeGateway.emitToProject`; sockets never carry authoritative state. See `docs/REALTIME.md`.

## Frontend conventions

- Standalone components, `OnPush`, signals for local state, `inject()`. Routed screens end in `Page`, others in `Component`; selector prefix `sb-`.
- All HTTP goes through `core/api.ts` (typed client). Errors go through `toApiError`. Screens render loading / empty / error states (`asyncState`, `sb-skeleton`, `sb-error-state`).
- Angular 19 does not allow `as` aliases on `@else if`; use `@let` inside the branch.
- Voice uses `core/speech.ts` (browser Web Speech API), provided per component; always keep a typing fallback.
- Features that aren't built yet are **disabled and labelled** ("SOON", or the coming-soon page) — never fake data or buttons that pretend to work. Seed/demo data is fine when clearly demo.

## Working agreement

- The user asked for **no git commits**; leave changes uncommitted unless they say otherwise.
- After each substantial step run lint, typecheck, tests and both builds; fix regressions before moving on. Update `docs/ROADMAP.md` (and other docs) as milestones land.
