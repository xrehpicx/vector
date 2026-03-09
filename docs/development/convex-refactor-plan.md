---
status: proposal
owner: platform
updated: 2025-08-14
---

# Convex project structure refactor plan

> Historical proposal. Use the current `convex/` directory in the repository as the source of truth.

This document proposes aligning `aikp/convex` to the same best-practice layout used in `arena/convex`, following the rules in `arena/.cursor/rules/convex_rules.mdc`.

## Current state (aikp)

- `convex/`
  - `_generated/` (OK)
  - `_shared/` (helpers: `auth.ts`, `pagination.ts`, `permissions.ts`, `validation.ts`)
  - Flat domain files: `issues.ts`, `projects.ts`, `teams.ts`, `organizations.ts`, `roles.ts`, `permissions.ts`, `users.ts`, `auth.ts`, `auth.config.ts`, `http.ts`, `schema.ts`, `migrations.ts`, `access.ts`, `hello.ts`
  - `tsconfig.json`

Notes:

- `api.*` references across the app rely on file-based routing like `api.issues.*`, `api.projects.*`, `api.organizations.*`, etc.
- `scripts/run-permission-migrations.ts` calls `api.migrations.*` (three mutations).
- No references found to `api.hello.*`. Safe candidate for removal.

## Reference structure (arena)

- `convex/`
  - `_generated/`
  - `activities/` (grouped domain modules)
  - `auth.config.ts`, `auth.ts`
  - `http.ts`
  - `schema.ts`
  - `users.ts`
  - `tsconfig.json`
  - `README.md`

## Target structure (aikp)

- Keep top-level files:
  - `_generated/`, `_shared/` (kept), `auth.config.ts`, `auth.ts`, `http.ts`, `schema.ts`, `users.ts`, `tsconfig.json`
- Introduce grouped domain directories with `index.ts` to preserve public API paths:
  - `convex/issues/index.ts` (from `convex/issues.ts`)
  - `convex/projects/index.ts` (from `convex/projects.ts`)
  - `convex/teams/index.ts` (from `convex/teams.ts`)
  - `convex/organizations/index.ts` (from `convex/organizations.ts`)
  - `convex/roles/index.ts` (from `convex/roles.ts`)
  - `convex/permissions/index.ts` (from `convex/permissions.ts`)
  - `convex/migrations/index.ts` (from `convex/migrations.ts`) — to keep `api.migrations.*`
- Remove unused:
  - `convex/hello.ts` (no references)

Rationale:

- Matches `arena`’s directory grouping and scales for sub-domain files (e.g., split queries/mutations later).
- Keeps existing API surface stable: `api.<domain>.<fn>` continues to work as file-based routing maps `index.ts` to the directory name.
- Reserves room for future subfolders (e.g., `issues/queries.ts`, `issues/mutations.ts`) without breaking paths by re-exporting through `index.ts`.

## Import adjustments required

After moving files into folders, update relative imports inside the moved modules:

- From `./permissions` → `../permissions` where applicable (`issues`, `projects`, `teams`, `roles`, etc.).
- From `./access` → `../access` if `access.ts` remains at top-level. Optionally move `access` into `access/index.ts` for symmetry and update to `../access` accordingly.
- From `./roles` (within `migrations.ts`) → `../roles` once `roles` is a directory.
- Keep imports of `./_generated/*` unchanged.
- References to `../src/...` remain the same paths from `convex/` root; verify after moves.

## App reference impact

- UI and scripts use many `api.<domain>.<fn>` references:
  - `api.issues.*`, `api.projects.*`, `api.organizations.*`, `api.teams.*`, `api.roles.*`, `api.permissions.*`.
  - `scripts/run-permission-migrations.ts` uses `api.migrations.migrateDefaultRoles`, `api.migrations.migrateTeamMembers`, `api.migrations.migrateProjectMembers`.
- Because directories will use `index.ts`, no UI import call sites need changes.

## Step-by-step refactor (no behavior change)

1. Create directories:
   - `issues/`, `projects/`, `teams/`, `organizations/`, `roles/`, `permissions/`, `migrations/` under `convex/`.
2. Move files to `index.ts` in each directory as listed above.
3. Delete `convex/hello.ts`.
4. Update relative imports inside moved files:
   - `issues/index.ts`: `./permissions` → `../permissions`; `./access` → `../access`.
   - `projects/index.ts`: `./permissions` → `../permissions`; `./access` → `../access`.
   - `teams/index.ts`: `./permissions` → `../permissions`; `./access` → `../access`.
   - `roles/index.ts`: `./permissions` → `../permissions`.
   - `migrations/index.ts`: `./roles` → `../roles`.
5. Run typecheck and build to verify:
   - `pnpm build` (or `pnpm tsx` where applicable) and address path errors.
   - Optional: `pnpm convex:dev` to let codegen refresh `_generated` (no API surface change expected).

## Optional follow-ups (future)

- Split large domain files into smaller files under each directory (`queries.ts`, `mutations.ts`, `access.ts`, etc.) and re-export from `index.ts` to preserve function paths.
- Add a `convex/README.md` mirroring `arena/convex/README.md` with local project notes.
- Consider a new `activities/` domain only if we introduce similar activity streams; not required today.

## Convex rule alignment

- The current code already uses new function syntax with validators and keeps schema in `convex/schema.ts`.
- Ensure all functions continue to declare `args` and `returns` per `arena/.cursor/rules/convex_rules.mdc`.
- Keep HTTP endpoints in `convex/http.ts` using `httpAction`.

## Rollback plan

- Moves are file-structure only. If any issue arises, revert to the flat files by moving `index.ts` back to the original filenames and deleting the empty folders.
