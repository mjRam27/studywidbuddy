# Architecture

StudywidBuddy is a **modular monolith**: one Angular web app, one NestJS API, one PostgreSQL database, Redis for queues and realtime fan-out, and a separate sandbox worker for untrusted code. Each of those exists because a feature needs it; nothing is split into services until load or team boundaries demand it.

```
                    ┌──────────────────────────┐
  Browser ──HTTPS──▶│ apps/web  (Angular SPA)  │
     │              └──────────────────────────┘
     │  REST /api/v1  +  Socket.IO /realtime
     ▼
┌───────────────────────────────────────────────┐        ┌────────────────────┐
│ apps/api  (NestJS modular monolith)           │──SQL──▶│ PostgreSQL 17      │
│  auth · users · profiles · skills · courses   │        │  + pgvector (RAG)  │
│  enrollments · partnerships · sessions · notes│        └────────────────────┘
│  projects · applications · interviews · teams │
│  tasks · agents · ai · conversations · notif. │──────▶ Redis (BullMQ queues,
│  github · certificates · social · jobs · files│         socket.io adapter, presence)
│  realtime (gateway)                           │
└───────────────┬───────────────────────────────┘
                │ enqueue (BullMQ)
                ▼
     ┌──────────────────────┐   docker run --network none --memory … --pids-limit …
     │ apps/sandbox-worker  │──────────────────────▶ throwaway container per run
     └──────────────────────┘
External boundaries (each behind an interface, configured by env vars):
  LLM provider · object storage (S3-compatible) · email · GitHub App · WebRTC media provider
```

## Repository layout

```
apps/
  web/              Angular 19, standalone components, lazy feature routes
  api/              NestJS 11, Prisma, REST /api/v1, Socket.IO gateway
  sandbox-worker/   BullMQ consumer that runs user code in throwaway containers (Milestone 7)
packages/
  shared/           Enums and API contract types used by web and api
docs/               Architecture, roadmap, decisions
infrastructure/     docker-compose for local Postgres (pgvector) + Redis
.github/workflows/  CI
project-scope-and-direction/   Design handoff bundle (visual source of truth, not built)
```

npm workspaces tie these together. `packages/shared` compiles to `dist/` and is consumed as a normal dependency, so the API (compiled by `tsc`) and the web app (built by esbuild) see the same types without path-alias tricks.

## Key decisions

| Decision                     | Choice                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                     | Angular 19, standalone, signals for local state, RxJS for streams/realtime                                                                                                                                        | Required by the brief. Signals keep component state simple; no NgRx until shared state actually outgrows services.                                                                                                                                                                                       |
| Backend                      | NestJS 11 modular monolith                                                                                                                                                                                        | Strong module boundaries + DI give clear domain ownership without the cost of microservices.                                                                                                                                                                                                             |
| ORM                          | **Prisma**                                                                                                                                                                                                        | No ORM existed. Prisma gives typed queries, readable schema, and versioned SQL migrations. pgvector columns use `Unsupported("vector")` + raw SQL where needed.                                                                                                                                          |
| API style                    | REST, versioned `/api/v1`, OpenAPI at `/api/docs`                                                                                                                                                                 | Simple to consume and test. DTOs validated with `class-validator` and whitelisting (stops mass assignment). Responses are mapped DTOs, never raw Prisma rows.                                                                                                                                            |
| Auth                         | Short-lived JWT access token (15 min, kept in memory by the SPA) + rotating refresh token in an `httpOnly`, `SameSite=Strict`, path-scoped cookie; refresh tokens stored hashed with family-based reuse detection | No token in `localStorage` (XSS can't steal a long-lived credential). `SameSite=Strict` + the refresh endpoint only accepting the cookie and a custom header blocks CSRF on the one cookie-authenticated route; every other route uses the `Authorization` header, which browsers never send cross-site. |
| Passwords                    | Argon2id (`@node-rs/argon2`, prebuilt binaries)                                                                                                                                                                   | Current OWASP recommendation; no native build toolchain needed on Windows.                                                                                                                                                                                                                               |
| Authorization                | Guards for authentication, then **domain-level checks in services** (e.g. "is this user a member of this partnership?")                                                                                           | Route guards alone can't express ownership rules. Every private resource query is scoped by the caller's id.                                                                                                                                                                                             |
| Errors                       | Domain errors (`DomainError` with a stable `code`) mapped by one exception filter to `{ error: { code, message, details? } }`                                                                                     | Consistent client handling; stack traces never leave the server.                                                                                                                                                                                                                                         |
| Queues                       | BullMQ on Redis, introduced with the first slow job (interview evaluation)                                                                                                                                        | Keeps HTTP requests fast; retries and backoff for free.                                                                                                                                                                                                                                                  |
| Realtime                     | Socket.IO gateway in the API, JWT-authenticated handshake, per-room authorization; Redis adapter when more than one API instance runs                                                                             | Messages, presence, notifications, task updates and watch-together sync. Durable data always goes to Postgres first; sockets only deliver.                                                                                                                                                               |
| Media calls                  | WebRTC via a provider interface (`VideoCallProvider`); default adapter is peer-to-peer signalling through the gateway for 1:1 study calls                                                                         | No media through NestJS. Group calls need an SFU (LiveKit, self-hosted or cloud); that adapter is a configuration decision, documented in `docs/REALTIME.md`.                                                                                                                                            |
| AI                           | `AiProvider` interface (`generate`, `generateStructured`, `stream`, `toolCall`) with an Anthropic adapter; all structured output validated with zod before use                                                    | Domain code never imports a vendor SDK. LLM output is untrusted input.                                                                                                                                                                                                                                   |
| Agents                       | Persisted `AgentRun → AgentStep → ToolCall → ToolResult`, tool registry with risk classes (READ, LOW, HIGH), approval queue for HIGH                                                                              | Real tools over domain services, bounded loops, auditable. See `docs/AGENTS.md`.                                                                                                                                                                                                                         |
| Code execution               | Sandbox worker, never the API process; Docker containers with no network, CPU/memory/pid/time limits, read-only root FS, non-root user, destroyed after each run                                                  | Security boundary. Limitations documented in `docs/SANDBOX.md`.                                                                                                                                                                                                                                          |
| Files                        | `ObjectStorage` interface (S3-compatible: MinIO locally, S3/R2/Supabase in prod), signed URLs, metadata in Postgres                                                                                               | Large media never in Postgres.                                                                                                                                                                                                                                                                           |
| Search                       | Postgres full-text search (`tsvector`) + trigram where needed                                                                                                                                                     | Enough for launch scale; no Elasticsearch.                                                                                                                                                                                                                                                               |
| Matching (buddy, jobs, team) | Deterministic, explainable scoring functions                                                                                                                                                                      | Cheaper, testable, and explainable. AI only explains, never decides.                                                                                                                                                                                                                                     |

## Backend module boundaries

Each Nest module owns its tables and exposes a service; other modules call that service, never its tables. Controllers are thin: parse DTO → call service → map to response DTO.

```
common/      config, prisma, errors, guards, pagination, decorators
auth/        register, login, refresh, logout, verify email, reset password
users/       account record (email, status)
profiles/    public profile, visibility, avatar
skills/      skill catalogue, user skills with levels (claimed vs demonstrated)
courses/     course → modules → lessons (catalogue)
enrollments/ enrollment lifecycle + FOUR-ACTIVE-COURSE RULE
partnerships/ study buddy matching, requests, partnership lifecycle
projects/    simulated projects, roles, required skills
applications/ project applications
interviews/  interview sessions, questions, responses, evaluations
teams/       team selection and members
tasks/       sprints, tasks, dependencies, transitions
agents/      runs, steps, tool registry, approvals, AI PM
ai/          provider abstraction and adapters
...          conversations, messages, notifications, github, certificates, social, connections, jobs, files, realtime
```

## Domain distinctions enforced in the schema

Connection ≠ StudyPartnership · Course ≠ Enrollment · Project ≠ ProjectApplication · Application ≠ InterviewSession · InterviewSession ≠ CandidateEvaluation · ProjectRole ≠ TeamMember · Conversation ≠ Message · Conversation types DIRECT / STUDY / PROJECT each with their own membership rule · AgentRecommendation ≠ executed ToolCall · Certificate.type COURSE ≠ PROJECT · UserSkill.source CLAIMED ≠ DEMONSTRATED.

## Frontend structure

```
apps/web/src/app/
  core/        auth service + interceptor + guards, api client, realtime client, error handling
  ui/          design-system primitives (button, card, avatar, badge, tabs, modal, drawer, menu, toast, progress, skeleton, empty-state, icon)
  layout/      app shell (sidebar, top bar), public shell
  features/
    auth/ onboarding/ home/ learning/ study-workspace/ projects/ people/ messages/ jobs/ settings/ ...
```

- Design tokens live in `apps/web/src/styles/tokens.css` as CSS custom properties, with the dark palette from Foundations under `[data-theme="dark"]`.
- Feature routes are lazy-loaded. Guards protect authenticated areas; the server re-checks everything.
- Every data screen renders loading, empty, error and success states.

## Security baseline

Helmet headers, CORS allowlist from env, global validation pipe with `whitelist` + `forbidNonWhitelisted`, rate limiting on auth and AI endpoints (`@nestjs/throttler`), Prisma parameterised queries (no string-built SQL), Angular's template escaping (no `innerHTML` with user content; markdown rendered through a sanitiser), upload type/size validation, secrets only from env (`.env.example` documents them), WebSocket handshake authenticated and every room join authorised, agent tools allow-listed and authorised as the acting user.
