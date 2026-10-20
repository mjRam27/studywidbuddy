# Roadmap

Status key: ✅ done · 🟡 in progress · ⬜ not started · 🔒 needs credentials or an account decision (the boundary is built; see notes)

| #   | Milestone                 | Status |
| --- | ------------------------- | ------ |
| 1   | Foundation                | ✅     |
| 2   | AI interview              | ✅     |
| 3   | Team selection            | ✅     |
| 4   | Project workspace         | ✅     |
| 5   | Agentic AI (AI PM)        | ✅     |
| 6   | GitHub · review · testing | 🟡     |
| 7   | Sandbox                   | 🔒     |
| 8   | Learning                  | 🟡     |
| 9   | Realtime collaboration    | 🟡     |
| 10  | Social / career           | ⬜     |
| —   | Final integration         | ⬜     |

## Milestone 1 — Foundation ✅

Exit criteria met: frontend builds · backend builds · tests pass (API 66, web 18) · database migrates (drift-checked) · auth works · application flow works (verified in a browser end to end).

| Item                                                                                               | Status | Notes                                                                              |
| -------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Repo layout: `apps/web`, `apps/api`, `packages/shared`                                             | ✅     | Path alias instead of workspaces (exFAT dev drive can't hold symlinks)             |
| Angular app with design tokens + app shell                                                         | ✅     | Light + designed dark palette from Foundations; responsive sidebar drawer < 1024px |
| NestJS API, env validation, Prisma, error filter, Swagger                                          | ✅     | `/api/v1`, docs at `/api/docs` (non-production)                                    |
| Docker Compose: Postgres 17 + pgvector, Redis                                                      | ✅     | Ports 5433 / 6380; `--profile app` runs the whole stack                            |
| Migrations + drift check + demo seed                                                               | ✅     | `db:check` in CI                                                                   |
| Auth: register, login, refresh (rotating, reuse detection), logout, me, verify email, forgot/reset | ✅     | `Mailer` interface; console adapter in dev, SMTP when `SMTP_URL` is set            |
| Authorization (global guard, ownership in services, 404 on foreign data)                           | ✅     |                                                                                    |
| Profile (view + edit + visibility)                                                                 | ✅     |                                                                                    |
| Skills catalogue + claimed/demonstrated user skills                                                | ✅     |                                                                                    |
| Courses, enrollments, **four-course rule** (row-locked, race-tested)                               | ✅     | Pulled forward from M8 because the existing Learning screens depend on it          |
| Lesson progress, course completion, learning stats & explainable recommendations                   | ✅     | Stats derived from stored progress only                                            |
| Project discovery + detail                                                                         | ✅     | Cursor pagination, skill match from the user's real skills                         |
| Project application + status machine + history + my applications                                   | ✅     | Verified email required                                                            |
| Home dashboard + My Learning on real data                                                          | ✅     |                                                                                    |
| Onboarding (profile basics, skills, first course)                                                  | ✅     |                                                                                    |
| Tests: API unit + e2e on real Postgres; web interceptor/guards/components                          | ✅     |                                                                                    |
| Lint (incl. template a11y), Prettier, CI, Dockerfiles                                              | ✅     |                                                                                    |

## Milestone 2 — AI interview ✅

Exit criteria met: application → interview → answer → submit → evaluation works end to end (e2e-tested with a scripted provider; the real adapter runs when `ANTHROPIC_API_KEY` is set). Design and rules: [AI.md](AI.md).

| Item                                                                              | Status | Notes                                                                                                         |
| --------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `AiProvider` abstraction (`generate`, `generateStructured`, `stream`, `toolCall`) | ✅     | Anthropic adapter (Claude Opus 5.5, structured outputs, refusal fallback); disabled adapter when unconfigured |
| AI usage log (`AiCall`)                                                           | ✅     | Tokens, duration, outcome per call; no prompt/output storage                                                  |
| BullMQ on Redis, retries, idempotent workers                                      | ✅     | Jobs: `interview.questions`, `interview.evaluate`                                                             |
| Interview sessions, questions, responses (autosave), submission                   | ✅     | Answers locked after submit; scores never shown while answering                                               |
| Structured, validated evaluation; overall score computed by code                  | ✅     | DB `CHECK` on score ranges; role recommendation allow-listed                                                  |
| Application status driven by the interview                                        | ✅     | SUBMITTED → INTERVIEW_PENDING → INTERVIEW_IN_PROGRESS → UNDER_REVIEW                                          |
| Failure handling + retry                                                          | ✅     | FAILED state with plain message; retry endpoint                                                               |
| Interview + evaluation UI                                                         | ✅     | AI visual language (diamond label, dashed frame)                                                              |
| Tests                                                                             | ✅     | API 82 (incl. interview e2e, prompt-injection escaping, schema rejection), web 21                             |
| Live run against Claude                                                           | 🔒     | Needs `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` in `apps/api/.env`                                        |

## Milestone 2b — CV screening + voice interview ✅

| Item                                                                                                          | Status | Notes                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| CV upload (PDF) on every application; AI ATS score computed by code; ≥ 80 unlocks the interview               | ✅     | Claude reads the PDF directly                                             |
| Booking: "Start now" or hourly slots for 5 days in the candidate's timezone (handles +05:30)                  | ✅     | Booking email                                                             |
| Live voice interview: introduction, planned topics, model-chosen follow-ups bounded by code rules             | ✅     | Voice only (no text box); tab switches and timings recorded for reviewers |
| Evaluation ≥ 60 → instant seat, first come first served; full role closes, others pointed to similar projects | ✅     | Row lock on the role; project starts when every role is full              |
| Below threshold → feedback + real catalogue courses for the missing skills                                    | ✅     |                                                                           |
| Robust structured output (clamp to schema limits, retry real failures)                                        | ✅     | Found by a real-model smoke test                                          |

## Milestone 3 — Team selection ✅

| Item                                                                                           | Status | Notes                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic, explainable selection algorithm (`teams/selection.ts`)                          | ✅     | Not "top N by score": hardest roles first, skill coverage, role preference, availability, diversity bonus; reasons for every decision |
| Selection runs as proposals (`TeamSelectionRun`, `TeamSelectionDecision`)                      | ✅     | Re-running discards the old proposal; all runs kept for audit                                                                         |
| Applying a run (admin approval, one transaction)                                               | ✅     | Team formed, members INVITED, applications SELECTED/REJECTED, project IN_PROGRESS                                                     |
| Team members with join status (INVITED → ACTIVE / DECLINED)                                    | ✅     | Seats are counted from members, not applications                                                                                      |
| Admin selection screen with approval card; invitations; team on project page; sidebar projects | ✅     |                                                                                                                                       |
| Tests                                                                                          | ✅     | API 93 (algorithm unit tests incl. "specialist keeps the seat", e2e flow), web 23                                                     |

Known limitation: when an invited person declines, their seat reopens but the other applicants were already closed as not selected. A waitlist (keep a ranked reserve open until the team starts) is the planned fix.

## Milestone 4 — Project workspace ✅

| Item                                                                                   | Status | Notes                                                                               |
| -------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| Milestones, sprints (one active per project, DB-enforced), tasks with per-project keys | ✅     | Fibonacci estimates as a `CHECK`                                                    |
| Task state machine, dependencies with cycle detection, "blocked" rule on moves         | ✅     | Pure functions in `tasks/task-rules.ts`                                             |
| Kanban board (drag-drop, filters by role/assignee/priority/sprint)                     | ✅     | Optimistic moves, server is authoritative; rejected moves snap back with the reason |
| Task drawer: edit, dependencies, comments                                              | ✅     |                                                                                     |
| Overview: burndown, sprint health with reasons, blockers, milestones, team load        | ✅     | Computed from stored data, not an LLM                                               |
| Activity feed (`ProjectActivity`)                                                      | ✅     | Records human and AI actors                                                         |
| AI plan proposal (milestones/sprints/tasks/deps) validated, applied only on approval   | ✅     | Queued job; invalid plans rejected before anyone sees them                          |
| Tests                                                                                  | ✅     | API 114, web 23                                                                     |

## Milestone 5 — Agentic AI project manager ✅

See `docs/AGENTS.md`.

| Item                                                                                                           | Status | Notes                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Persisted agent runs: `AgentRun` → `AgentStep` → `AgentToolCall` → `AgentToolResult`                           | ✅     | Every step, call and result is visible in the AI PM tab                                                      |
| Tool registry with risk levels (READ, WRITE_LOW, NEEDS_APPROVAL) and zod-validated inputs                      | ✅     | 10 tools; unknown tools and bad input are recorded as failed calls and fed back to the model                 |
| Human approval for task changes; approved actions run as the approving member                                  | ✅     | Double-approval is a 409; failures are recorded, not hidden                                                  |
| Guardrails: 8 steps, 20 tool calls, 5 proposals per run, 10 manual runs/day/project, project-scoped references | ✅     |                                                                                                              |
| Per-project memory (`ProjectMemory`), shown to the team, correctable (archive)                                 | ✅     | No query reads memory across projects (tested)                                                               |
| AI-led meetings: check-in every N days (default 3), final review near the end                                  | ✅     | Personal questions per member, answered by voice or text; summary → memory → team chat → follow-up agent run |
| Admin settings: pause the AI PM, change the interval                                                           | ✅     |                                                                                                              |
| Tests                                                                                                          | ✅     | e2e (scripted model incl. tool calls), unit (tool registry)                                                  |

## Milestone 6 — GitHub · review · testing 🟡

See `docs/GITHUB.md`.

| Item                                                                                                                  | Status | Notes                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| GitHub App configured (org `studywidbuddy-projects`), verified end to end                                             | ✅     | Permissions, events, installation, webhook via smee in development |
| Link GitHub accounts (OAuth, signed state; only id + login stored)                                                    | ✅     | Settings → Connected accounts                                      |
| Private team repo per project: GitHub team, starter README (conventions), CI workflow, PR template                    | ✅     | Admin action; retry-safe                                           |
| Automatic access for linked active members (on create, link, team join, manual sync)                                  | ✅     |                                                                    |
| Signed, idempotent webhooks; PR ↔ task linking from `TASK-n`; In progress → Review on PR; Done on merge with green CI | ✅     | Stale CI results ignored                                           |
| "Done" blocked while a linked PR's checks fail or run                                                                 | ✅     | `CHECKS_NOT_PASSING`                                               |
| Workspace GitHub tab: repo, access, PRs with CI status                                                                | ✅     | Live via sockets                                                   |
| AI code review on pull requests                                                                                       | ⬜     | Next                                                               |
| Platform acceptance tests in the sandbox, reported as a check                                                         | ⬜     | Local Docker sandbox first (no cost)                               |
| Publish repo at project end (with all members' consent)                                                               | ⬜     |                                                                    |

## Milestone 8 — Learning 🟡

| Item                                                                                                                                                     | Status | Notes                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Study Workspace (screen 29): outline, lesson player, notes, AI Buddy panel                                                                               | ✅     | Works solo; Study Buddy parts labelled SOON                                                                                                                                 |
| YouTube lessons (privacy-enhanced embed), one curated video per lesson by topic                                                                          | ✅     | 89/89 lessons, each verified via YouTube oEmbed (exists, embeddable), title and channel credited; `npm run videos:check` re-verifies; admins can replace from Lesson videos |
| AI Buddy chat on the fast model, grounded in course outline, lesson summary/transcript and the learner's note                                            | ✅     | Hint-first; history per enrollment                                                                                                                                          |
| AI Buddy follows the video: current minute sent with questions, transcript window around it, "Explain this moment", timed transcript tab (click to seek) | ✅     | Paste or generate with Gemini (`GEMINI_API_KEY` configured locally, `gemini-3.8-flash`)                                                                                     |
| Voice conversation with the AI Buddy (browser speech-to-text + text-to-speech)                                                                           | ✅     | Chrome/Edge/Safari; typing everywhere                                                                                                                                       |
| Voice check: 5 spoken questions on finished lessons → report under the course                                                                            | ✅     | Questions on the fast model, evaluation on the smart model, score computed by code                                                                                          |
| Private notes per lesson                                                                                                                                 | ✅     |                                                                                                                                                                             |
| Instructor accounts, uploaded videos, paid courses                                                                                                       | ⬜     | Needs object storage + a payment provider (see below)                                                                                                                       |
| Study Buddy matching, shared notes, watch together, partner chat                                                                                         | ⬜     | Matching will always be optional                                                                                                                                            |

## Milestone 9 — Realtime collaboration 🟡

See `docs/REALTIME.md`.

| Item                                                                          | Status | Notes                                  |
| ----------------------------------------------------------------------------- | ------ | -------------------------------------- |
| Socket.io gateway (`/api/socket.io`), JWT handshake, membership-checked rooms | ✅     |                                        |
| Project team chat with presence, typing, unread counts, AI PM posts           | ✅     |                                        |
| Live meeting / AI PM updates over sockets                                     | ✅     | Polling fallback                       |
| Direct messages, Study Buddy chat                                             | ⬜     | Need connections (M10) / matching (M8) |
| Live video calls (group)                                                      | 🔒     | Needs an SFU choice (LiveKit)          |

## Later milestones

Milestones 6, 7 and 10 follow the product brief. Each is broken into items here when it starts, so this file shows real status rather than a wish list.

## Needs a decision or credentials

| Item              | What's needed                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| LLM provider      | ✅ Configured locally (`AI_PROVIDER=anthropic`). Without a key, AI features say "AI isn't configured" instead of faking output. |
| Email delivery    | `SMTP_URL` (any SMTP provider). Dev logs verification/reset links to the API console.                                           |
| GitHub App        | ✅ Configured locally (app id, private key outside the repo, webhook secret, smee relay in dev).                                |
| Video transcripts | ✅ Gemini configured locally (`GEMINI_API_KEY`). Without it admins paste transcripts.                                           |
| Object storage    | S3-compatible bucket (instructor video uploads). Local dev will use MinIO in Docker.                                            |
| Payments          | Stripe (or similar) account for paid courses and projects.                                                                      |
| Sandbox host      | Where untrusted code runs: Docker on our own server vs a hosted sandbox (e.g. E2B). Decision pending.                           |
| Group video       | SFU choice (LiveKit self-hosted vs cloud). 1:1 calls can work peer-to-peer.                                                     |
