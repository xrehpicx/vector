# API and Routing

This document covers current routing and backend-boundary conventions.

## App Router Conventions

- Organization-scoped application routes live under `/[orgSlug]/...`.
- Global routes such as auth and bootstrap flows live outside the org segment.
- Use route handlers under `src/app/api/...` only for HTTP boundaries such as auth callbacks or file proxying.

Examples:

- `src/app/[orgSlug]/(main)/issues/page.tsx`
- `src/app/[orgSlug]/(main)/projects/[projectKey]/project-view-client.tsx`
- `src/app/api/auth/[...all]/route.ts`

## Convex Backend Conventions

- Group backend functions by domain under `convex/<domain>/...`.
- Use `queries.ts` for reads and `mutations.ts` for writes within a domain.
- Keep shared backend helpers under `convex/_shared/...`.
- Prefer using generated API references (`api.*`) instead of hand-rolled request layers.

## Route Protection

- `src/proxy.ts` handles high-level route protection and auth redirects.
- Fine-grained authorization must still be enforced in Convex backend code.

## Naming

- Use `orgSlug` in routes and route params where the URL is organization-scoped.
- Prefer resource keys in URLs when the product already exposes them, for example `issueKey`, `projectKey`, or `teamKey`.
