# Convex Migration Plan

> **Goal:** Migrate the AIKP code-base from Better-Auth + Drizzle/PostgreSQL + tRPC + S3 **to** Convex Auth + Convex Database + Convex Functions + Convex Storage **without altering any UI/UX or visual design**.
>
> Each task has a checkbox so progress can be tracked directly in-file (✅ / ❌). Update check-boxes only **after** the corresponding PR is merged.
>
> **Legend**: `🗂 file` – reference to an existing project file, `📦 pkg` – pnpm dependency, `📓 note` – important caveat.
>
> **Key Requirements:**
>
> - **Local Development Only:** Use local Convex instance, no cloud account creation
> - **TypeScript Best Practices:** Avoid `any` types, `!` assertions, and type workarounds
> - **Schema-Driven Types:** Infer types from database schema, avoid duplicate type declarations
> - **Research First:** Google and verify Convex implementation patterns before starting any changes

---

## Table of Contents

1. [Preparation](#phase-0-preparation)
2. [Convex Project Boot-strapping](#phase-1-bootstrap-convex)
3. [Authentication](#phase-2-authentication)
4. [Database & Data Migration](#phase-3-database--data-migration)
5. [Business Logic & API](#phase-4-business-logic--api)
6. [File Storage](#phase-5-file-storage)
7. [Middleware & Permissions](#phase-6-middleware--permissions)
8. [Decommission Legacy Stack](#phase-7-decommission-legacy-resources)

---

## Phase 0: Preparation

| #   | Task                                                                                                                                                                                                                                                         | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 0.1 | **Research Convex Patterns** – Google current best practices for auth, storage, actions, indexing. Bookmark official docs and community examples.                                                                                                            | ❌     |
| 0.2 | **Spike Project** – create a throw-away repo with Convex Auth + Storage to verify mental model.                                                                                                                                                              | ❌     |
| 0.3 | **Inventory Current Code** – already partially complete. Finalise a spreadsheet listing every occurrence of: <br/>• `betterAuth`, `src/auth/*`, <br/>• `src/db/`, `drizzle/`, <br/>• `src/trpc/**`, `src/entities/**`, <br/>• `src/lib/s3.ts`, `/api/files`. | ❌     |
| 0.4 | **Stakeholder Sign-off** confirming: _“no UI/UX changes”_ and the scope of data to migrate.                                                                                                                                                                  | ❌     |

📓 note: The inventory spreadsheet will drive the TODO numbers below, keep it up-to-date.

📓 **Important:** Convex is rapidly evolving. Always research current patterns before implementing each phase.

---

## Phase 1: Bootstrap Convex

| #   | Task                                                                                        | Status |
| --- | ------------------------------------------------------------------------------------------- | ------ |
| 1.1 | `pnpm dlx convex@latest init` – generates `/convex`, `convex.json`, `.env.local` template.  | ❌     |
| 1.2 | Add `@/convex/*` path alias in `tsconfig.json` & ESLint include.                            | ❌     |
| 1.3 | Configure local Convex development (no cloud account needed).                               | ❌     |
| 1.4 | Commit baseline with `"convex:dev": "convex dev"` and update `README.md` local-dev section. | ❌     |

Best Practice ✓  
Keep all Convex code under `/convex/` – feature-foldered to mirror `/src/` (e.g. `/convex/issues/*`).

📓 note: Local Convex development allows full functionality without cloud account creation.

---

## Phase 2: Authentication

Current impl (🗂 `src/auth/auth.ts`) uses Better-Auth + Drizzle adapter with **email/password**, **username**, **admin** & **organization** plugins.

### 2.1 Choose Convex Auth Strategy

| Option                                                            | Pros                                  | Cons                              |
| ----------------------------------------------------------------- | ------------------------------------- | --------------------------------- |
| Convex built-in `handleAuth` + NextAuth-compatible OAuth (Google) | Zero infra, documented                | Need email-magic-link replacement |
| Convex + Clerk / Auth0                                            | UI hosted, social logins              | Extra bill                        |
| **Custom (Lucia) on Convex actions**                              | Full control; replicate current flows | More code                         |

📓 Decision: **Built-in Convex `handleAuth` with Google OAuth + magic email link** (closest to current UX).

### 2.2 Migration Checklist

| #     | Task                                                                                                                                    | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2.2.1 | Install 📦 `convex/react`, `next-auth` peer deps per Convex guide using `pnpm add`.                                                     | ❌     |
| 2.2.2 | Create `pages/api/auth/[...convex].ts` → `handleAuth` w/ Google provider.                                                               | ❌     |
| 2.2.3 | Implement custom email magic-link provider (Convex example) to match current Better-Auth flow.                                          | ❌     |
| 2.2.4 | Map Better-Auth tables (`user`, `session`, `account`) to Convex collections `users`, `sessions`, `accounts` for historical data import. | ❌     |
| 2.2.5 | Replace `src/auth/auth.ts` helpers with `useAuth()` & `api.auth.session` pattern.                                                       | ❌     |
| 2.2.6 | Update `src/middleware.ts` route protection to verify `ctx.auth.getUserIdentity()` & org membership.                                    | ❌     |
| 2.2.7 | Remove `better-auth` & related plugins from `package.json`.                                                                             | ❌     |

---

## Phase 3: Database & Data Migration

### 3.1 Define Convex Schema

Create `convex/schema.ts` describing collections corresponding to current Postgres tables.

| Table (Postgres)          | Collection (Convex) | Attributes & Indexes                                                            |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `organizations`           | `organizations`     | name, slug, ownerId, createdAt <br/>`db.index("by_slug", ["slug"])`             |
| `org_roles`               | `roles`             | orgId, name, permissions[]                                                      |
| `members`                 | `members`           | userId, orgId, roleId <br/>`db.index("by_org", ["orgId"])`                      |
| `projects`                | `projects`          | orgId, key, name, leadId, stateIds[]                                            |
| `teams`                   | `teams`             | orgId, key, name, leadId, memberIds[]                                           |
| `issues`                  | `issues`            | projectId, key, title, description, priority, stateId, assigneeIds[], createdBy |
| `issue_comments`          | `comments`          | issueId, authorId, body, createdAt                                              |
| `states`                  | `states`            | orgId, key, name, category                                                      |
| `priorities`              | `priorities`        | orgId, key, name, sortOrder                                                     |
| plus any auxiliary tables | …                   | …                                                                               |

📓 note: Use `Doc` types from schema for perfect type inference. Avoid creating separate TypeScript interfaces.

### 3.2 Write Import Script

| #     | Task                                                                                                                                                        | Status |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 3.2.1 | Create Postgres → JSON export script (`scripts/export-pg.ts`) using Drizzle selects.                                                                        | ❌     |
| 3.2.2 | Build Convex **action** `importData.ts` that: <br/>• loads JSON, <br/>• inserts docs in topological order, <br/>• preserves foreign keys via temporary map. | ❌     |
| 3.2.3 | Run on staging Convex deployment, verify row counts.                                                                                                        | ❌     |
| 3.2.4 | Cut prod downtime window → run import, flip env vars.                                                                                                       | ❌     |

### 3.3 Remove Drizzle & Postgres

| #     | Task                                                            | Status |
| ----- | --------------------------------------------------------------- | ------ |
| 3.3.1 | Delete `drizzle/` migrations & `src/db/` once parity confirmed. | ❌     |
| 3.3.2 | Remove Docker Postgres service (`docker-compose.dev.yml`).      | ❌     |

---

## Phase 4: Business Logic & API

### 4.1 Map Routers → Convex Functions

| tRPC Router (🗂 `src/trpc/routers`) | New Convex Code                                |
| ----------------------------------- | ---------------------------------------------- |
| `_app.ts`                           | deleted – Convex client handles batching       |
| `issue.router.ts`                   | `convex/issues/{list,create,update,delete}.ts` |
| `organization.router.ts`            | `convex/organizations/{list,update,invite}.ts` |
| `project.router.ts`                 | `convex/projects/{list,create,update}.ts`      |
| `role.router.ts`                    | `convex/roles/{list,create,update,delete}.ts`  |
| `team.router.ts`                    | `convex/teams/{list,create,update}.ts`         |
| `user.router.ts`                    | `convex/users/{list,search}.ts`                |

For each router:

1. Identify **queries** (read-only) → `query` functions.
2. Identify **mutations** (data write) → `mutation` functions.
3. Identify external side-effects (emails, invites) → `action` functions.

### 4.2 Refactor Service Layer

| #     | Task                                                                                                                                                                                                                                                | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 4.2.1 | Break domain logic currently in `src/entities/**` into reusable helpers inside `/convex/_shared/`.                                                                                                                                                  | ❌     |
| 4.2.2 | Replace legacy `class Service {}` patterns with simple function modules for tree-shakability.                                                                                                                                                       | ❌     |
| 4.2.3 | Remove tRPC client hooks in React components (e.g., 🗂 `src/components/issues/*`). Swap to `useQuery`, `useMutation` from `convex/react`. Provide shim wrappers to keep call-sites minimal diff: <br/>`import { useIssues } from '@/convex/shims'`. | ❌     |
| 4.2.4 | Ensure all function parameters and return types are properly typed using schema `Doc` types, avoid `any` or `!` assertions.                                                                                                                         | ❌     |

📓 note: Convex supports optimistic updates – replicate existing optimistic UX of issues table.

---

## Phase 5: File Storage

| #   | Task                                                                                                                                                                                         | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 5.1 | Enable Convex Storage (Beta) in `convex.json`.                                                                                                                                               | ❌     |
| 5.2 | Write mutation `generateUploadUrl.ts` (`storage.generateUploadUrl()`).                                                                                                                       | ❌     |
| 5.3 | Replace Next.js API route 🗂 `src/app/api/files/[...key]/route.ts` with simple proxy that calls Convex upload URL logic, ensuring drop-in compatibility for front-end file input components. | ❌     |
| 5.4 | Migrate existing S3 objects: script streams each S3 key → `storage.storeFile()`; update references in `files` collection.                                                                    | ❌     |
| 5.5 | Delete 🗂 `src/lib/s3.ts`, remove AWS env vars & MinIO local stack.                                                                                                                          | ❌     |

---

## Phase 6: Middleware & Permissions

| #   | Task                                                                                             | Status |
| --- | ------------------------------------------------------------------------------------------------ | ------ |
| 6.1 | Port `src/auth/policy-engine.ts` rules to Convex query `permissions:getForUser`.                 | ❌     |
| 6.2 | Implement collection-level checks inside mutations (e.g., `assertIsOrgAdmin(ctx, orgId)`).       | ❌     |
| 6.3 | Update `src/hooks/use-permissions.ts` to call Convex query and cache results with React context. | ❌     |
| 6.4 | Delete obsolete Better-Auth role code once verified.                                             | ❌     |

---

## Phase 7: Decommission Legacy Resources

| #   | Task                                                                                              | Status |
| --- | ------------------------------------------------------------------------------------------------- | ------ |
| 7.1 | Remove `better-auth`, `@trpc/*`, `@drizzle/*`, `aws-sdk` from `package.json` using `pnpm remove`. | ❌     |
| 7.2 | Delete `src/trpc`, `src/db`, `src/lib/s3.ts`, `src/auth/*` (except new Convex helpers).           | ❌     |
| 7.3 | Clean up environment variables: `.env*` files no longer need PG, S3, JWT secrets.                 | ❌     |
| 7.4 | Archive old S3 bucket (30-day retention) & shutdown Postgres instance.                            | ❌     |

---

## Appendix – Best Practices Adopted

1. **Single Source of Types** – import `convex/schema.ts` across server & client for perfect type-safety.
2. **Feature Parity First** – UI/UX frozen; components reuse the same props & state shape to avoid design churn.
3. **Optimistic UI** – utilise Convex client optimistic updates (matching current snappy Linear-style UX).
4. **Actions for Side-Effects** – external integrations live in Convex actions to keep mutations pure.
5. **Auth-Protected Functions** – every query/mutation verifies `ctx.auth.getUserIdentity()`; no anonymous writes.
6. **Index Early** – declare indexes up-front for `orgId`, `projectId`, `userId` queries.
7. **Mirrored Folder Structure** – `/convex/{domain}` mirrors `/src/{domain}` for developer ergonomics.
8. **Schema-Driven Types** – use `Doc<"tableName">` types from schema, avoid duplicate TypeScript interfaces.
9. **Local Development** – leverage local Convex instance for full development without cloud dependencies.
10. **Type Safety First** – avoid `any` types, `!` assertions, and type workarounds throughout the codebase.
11. **Research-Driven Development** – verify Convex patterns before implementation, as the platform evolves rapidly.

_All check-boxes ✅ → production runs fully on Convex._
