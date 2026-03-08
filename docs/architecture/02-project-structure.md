# Project Structure

This document gives a high-level view of the current repository layout.

```text
vector/
├─ convex/                  Convex schema, queries, mutations, actions, auth, and shared backend helpers
├─ docs/                    Contributor-facing documentation
├─ public/                  Static assets and screenshots
├─ scripts/                 Repository scripts and one-off maintenance helpers
├─ src/
│  ├─ app/                  Next.js App Router pages, layouts, and route handlers
│  │  ├─ [orgSlug]/         Organization-scoped application routes
│  │  └─ api/               HTTP boundaries such as auth and file proxy routes
│  ├─ components/           Product components and UI primitives
│  ├─ hooks/                Shared React hooks
│  ├─ lib/                  Shared utilities, auth helpers, notification helpers, and local tests
│  ├─ notifications/        Notification event/channel logic used by the frontend layer
│  └─ providers/            App-wide React providers
├─ archive/                 Historical legacy code kept for reference only
├─ package.json             Project dependencies and scripts
└─ tsconfig.json            TypeScript configuration and path aliases
```

## Key Conventions

- Organization-scoped app routes live under `src/app/[orgSlug]/...`.
- Convex backend code is grouped by domain under `convex/<domain>/...`.
- Shared frontend primitives live under `src/components/ui`.
- Historical code lives under `archive/` and should not be treated as the current architecture.
