# @studywidbuddy/shared

Enums and API contract types used by both `apps/api` and `apps/web`.

This is **source only**, not an npm package: both apps map `@studywidbuddy/shared` to `packages/shared/src` with a TypeScript path alias. The repository lives on an exFAT drive in development, which can't hold the symlinks npm workspaces need, so a path alias is the portable option. The API build rewrites the alias to a relative path (`tsc-alias`).

Keep this folder free of runtime dependencies.
