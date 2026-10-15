# Current state

_Last updated: 2026-10-14 (start of the full-stack build)._

This file records what the repository contained **before** the full-stack build started, and is updated as milestones land. For the target design see [ARCHITECTURE.md](ARCHITECTURE.md); for progress see [ROADMAP.md](ROADMAP.md).

## Inventory at start

| Area          | State                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository    | Single package, one commit (`feat(ui): basic ui created`). npm, Node 23.                                                                                                                                  |
| Frontend      | React 18 + Vite 5 + TypeScript, `react-router-dom`. Two screens ported from the design: **My Learning** (`/learn`) and **Find your Study Buddy** (`/learn/buddies`). Other nav targets were placeholders. |
| State / data  | In-memory React context with hard-coded demo data (`src/data/*.ts`). Nothing persisted.                                                                                                                   |
| Styles        | One global stylesheet (`src/styles.css`) with CSS custom properties taken from the design.                                                                                                                |
| Design source | `project-scope-and-direction/` — a Claude Design handoff bundle (HTML prototypes rendered by `support.js`, a template runtime, not app code).                                                             |
| Backend       | None.                                                                                                                                                                                                     |
| Database      | None.                                                                                                                                                                                                     |
| Auth          | None.                                                                                                                                                                                                     |
| Env config    | None.                                                                                                                                                                                                     |
| Docker        | None.                                                                                                                                                                                                     |
| Tests         | None.                                                                                                                                                                                                     |
| CI/CD         | None.                                                                                                                                                                                                     |
| Docs          | Only the design bundle README.                                                                                                                                                                            |

## The design bundle (visual source of truth)

`project-scope-and-direction/project/` contains six prototype files:

| File                      | Screens                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Foundations.dc.html`     | 00 Cover · 01 Information architecture · 02 Color, type, space (light + dark) · 03 Components · 04 AI visual language · 05 Desktop app shell · 06 Mobile navigation |
| `Landing.dc.html`         | 01 Landing                                                                                                                                                          |
| `Learning.dc.html`        | 20 Learning Dashboard (4-slot rule) · 25 Study Buddy Matching                                                                                                       |
| `Study Workspace.dc.html` | 29 Study Workspace                                                                                                                                                  |
| `Network.dc.html`         | 14 Home Feed · 43 User Profile                                                                                                                                      |
| `Projects.dc.html`        | 47 Project Discovery · 55 Project Workspace                                                                                                                         |

Foundations defines the design language that every new screen must follow:

- **Colour (light):** canvas `#F5F6F8`, surface `#FFF`, subtle `#F0F2F5`, border `#E2E5EB`, ink `#0F1320` / `#4A5266` / `#6B7386`, primary indigo `#4B4FE0`, AI cyan `#0B8FB0`, success `#15803D`, warning `#B45309`, danger `#C81E1E`. A designed (not inverted) dark palette exists for long workspace sessions.
- **Type:** Bricolage Grotesque for display and page titles only, Instrument Sans for all UI text, JetBrains Mono for code, IDs, timestamps and context labels.
- **Space / radius:** 4px base; radius 4 tag, 6 control, 10 card (12 in screens), 14 modal.
- **Icons:** Material Symbols Rounded, 18/20px.
- **AI language:** a cyan diamond marks AI work and is followed by a mono role label (AI BUDDY, AI INTERVIEWER, AI PM, AI REVIEWER, AI NOTES). Generated content sits in a dashed cyan frame until a person approves it. Every AI surface shows what context it is "Using". Agent audit verbs: OBSERVED, RECOMMENDED, REQUESTED, EXECUTED, REJECTED.
- **Status never by colour alone:** every status has an icon and a label.
- **Shell:** 248px sidebar (Home, Learn, Projects, People, Messages, Jobs + AI Buddy), Learn/Projects expand to list live workspaces; 56px top bar; ⌘K search and notifications drawer as overlays.

## What was working

- The React app built and ran (`npm run dev`), with the 4-slot interaction and buddy matching simulated in the browser.

## What was not real

- Every number, person and course was hard-coded. Leaving a course or sending a study request lasted until a page refresh.
- Buttons such as "Start Learning", "Browse courses", "Schedule session" did nothing.

## Decision taken on the existing frontend

The product brief requires **Angular**. The React app was one day old and covered two screens, so it was **ported** to Angular (`apps/web`) rather than kept alongside it: markup, styles, tokens and data shapes carried over, and the React/Vite files were removed (they remain in git history, commit `3abc6cd`). The design bundle stays in the repo as the reference.

## After milestone 1 (2026-10-14)

| Area                 | State                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout               | `apps/web` (Angular 19), `apps/api` (NestJS 11), `packages/shared` (contracts). No npm workspaces: the dev drive is exFAT and can't hold symlinks.                                                                                                                |
| Database             | PostgreSQL 17 + pgvector in Docker (`:5433`), Prisma schema + 2 migrations, drift check, idempotent demo seed.                                                                                                                                                    |
| Auth                 | Register, login, rotating refresh cookie with reuse detection, logout, me, verify email, forgot/reset password.                                                                                                                                                   |
| Domain               | Profiles (with visibility), skills (claimed vs demonstrated), course catalogue, enrollments with the server-enforced four-course rule, lesson progress, completion, learning stats and recommendations, projects, applications with a status machine and history. |
| Screens on real data | Landing, auth (5), onboarding, Home, My Learning, Discover courses, Course detail, Project discovery, Project detail, Apply, Application status, Profile, Settings. People / Messages / Jobs show an honest "coming in milestone N" page.                         |
| Not yet real         | Study Buddy matching and everything after it in the roadmap. Those slots in the UI say so instead of showing fake data.                                                                                                                                           |
| Tests                | API: 66 (unit + e2e on real Postgres). Web: 18 (Karma, headless Chrome).                                                                                                                                                                                          |
| Tooling              | ESLint (incl. template a11y rules), Prettier, GitHub Actions CI, Dockerfiles for API and web, compose profile for the full stack.                                                                                                                                 |
