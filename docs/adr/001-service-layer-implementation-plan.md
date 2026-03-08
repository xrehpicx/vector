# ADR 001: Service Layer Implementation Plan

> Historical ADR. This document records an earlier implementation direction and is not the source of truth for the current Convex-based architecture.

- **Status**: Implemented
- **Date**: 2024-05-15
- **Context**: The core database schema for Teams, Projects, Issues, and Comments was completed. The next step was to expose these tables through a clean, type-safe service layer and tRPC API.

---

## Decision

We decided to implement a full-stack vertical slice for project management features, including:

1.  Data-access and business logic services in `src/entities/*`.
2.  tRPC routers in `src/trpc/routers/*` to expose the services.
3.  Role-based access control middleware in `src/trpc/permissions.ts`.
4.  A full set of UI routes and components in `src/app/[orgId]/...` for managing teams, projects, and issues.
5.  A clear UX flow for user on-boarding and organization switching.

## Implementation Details

### 1. Data-Access Services (`src/entities/*`)

- **Teams**: `src/entities/teams/team.service.ts`
- **Projects**: `src/entities/projects/project.service.ts`
- **Issues**: `src/entities/issues/issue.service.ts`
- **Comments**: `src/entities/issues/comment.service.ts`

### 2. tRPC Routers (`src/trpc/routers/*`)

- `team.router.ts`
- `project.router.ts`
- `issue.router.ts`

### 3. Role Integration

- Permissions were handled by a combination of `better-auth` organization roles (`admin`, `member`) and project-specific roles (`lead`, `member`).
- Centralized permission helpers were created in `src/trpc/permissions.ts`.

### 4. UI Routes

- **Convention**: `/<orgId>/...` for organization-scoped pages.
- **Layout**: A shared layout at `src/app/[orgId]/layout.tsx` provides a consistent sidebar and organization switcher.
- **Proxy**: `src/proxy.ts` protects all organization-scoped routes.

### 5. UX Flow

- Defined user journeys for:
  - New user signup and organization creation.
  - Accepting an invitation as a new or existing user.
  - Day-to-day navigation within the application.
  - Authentication fallbacks for expired sessions.

## Consequences

- This implementation provided a solid foundation for the project management features of the application.
- The clear separation of concerns between the service layer, API layer, and UI layer has made the codebase easier to maintain and extend.
- The historical task list and open questions from the original `next.md` document have been preserved here for context.

### Open Questions from original document

1.  **Search**: Do we need full-text search on issues now or later? (Deferred)
2.  **Labels & Sprints**: Are they in scope for the MVP? (Deferred)
3.  **Row Level Security**: Consider enabling RLS once Supabase or similar is introduced. (Open)
