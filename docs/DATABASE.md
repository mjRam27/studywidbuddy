# Database decisions

PostgreSQL 17 is the source of truth. Prisma owns the schema (`apps/api/prisma/schema.prisma`) and every change ships as a versioned SQL migration. `npm run db:check` (also in CI) fails when the schema and the migrations disagree.

## Conventions

- **UUID primary keys** (`gen_random_uuid` via Prisma `uuid()`): safe to expose in URLs, no enumeration.
- **`citext`** for emails and usernames: case-insensitive uniqueness without lower-casing bugs.
- **Enums** for every lifecycle state, mirrored in `packages/shared/src/enums.ts`; a unit test asserts they match.
- **Timestamps** on every mutable row (`createdAt`, `updatedAt`), plus explicit event timestamps where the time matters (`completedAt`, `leftAt`, `rotatedAt`, `usedAt`).
- **No soft delete by default.** Rows that represent history (enrollments, applications) change _status_ instead of being deleted. Users cascade-delete their own private data.
- **No relational data in JSON.** Arrays are used only for flat display lists (`Profile.languages`, `Course.outcomes`).

## Constraints Prisma can't express (hand-written in migrations)

| Constraint                                                                                              | Why                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Enrollment_one_active_per_course`: unique `(userId, courseId)` where `status = 'ACTIVE'`               | A learner can retake a course after leaving it, but never hold two active seats in it.                        |
| `ProjectApplication_one_live_per_project`: unique `(userId, projectId)` where `status <> 'WITHDRAWN'`   | One live application per project; re-applying after withdrawing is allowed.                                   |
| `CHECK` on `ProjectRole.seats > 0`, `Project.teamSize > 0`, `availabilityHoursPerWeek BETWEEN 1 AND 60` | Bad numbers can't enter through any path, not only the API.                                                   |
| GIN trigram indexes on `Course.title`, `Project.title`, `Skill.name`                                    | Fast `ILIKE '%term%'` search without a search engine. Declared in the schema too, so drift checks stay green. |

## The four-active-course rule

Enforced in `EnrollmentsService.enroll` inside a transaction that first runs `SELECT … FROM "User" WHERE id = $1 FOR UPDATE`. That row lock serialises concurrent enrollments by the same user, so the count check can't be raced. The e2e suite fires three simultaneous requests at the last free slot and asserts exactly one succeeds.

## Refresh tokens

`RefreshToken` stores only a SHA-256 of each token, grouped by `familyId`. Rotation marks the old row `rotatedAt` with a conditional update (`WHERE rotatedAt IS NULL`), so only one of two concurrent refreshes can win. Presenting a rotated or revoked token revokes the whole family.

## Skills: claimed vs demonstrated

`UserSkill` has a `source` column in its primary key: a person can claim TypeScript at Advanced _and_ have it demonstrated at Intermediate by a finished course. Completing a course writes `DEMONSTRATED` rows; users can only edit `CLAIMED` ones.

## Demo data

`prisma/seed.ts` loads catalogue content and demo users whose emails end in `@demo.studywidbuddy.local`. It is idempotent and refuses to run when `NODE_ENV=production`.
