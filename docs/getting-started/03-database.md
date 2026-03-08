# Data Model and Local Backend

Vector no longer uses a separate local PostgreSQL container for day-to-day development. The application stores operational data in Convex.

## Local Development Flow

1. Start the local Convex backend:

   ```bash
   pnpm run convex:dev
   ```

2. Keep it running while working on schema or function changes.

3. Use the generated types in `convex/_generated/*` from the app and Convex functions instead of maintaining duplicate data-model types by hand.

## Schema Source of Truth

- Main schema: `convex/schema.ts`
- Domain functions: `convex/issues/*`, `convex/projects/*`, `convex/teams/*`, `convex/organizations/*`, `convex/documents/*`
- Shared permission and validation helpers: `convex/_shared/*`

## Schema Changes

When you change the Convex schema or backend functions:

1. Update `convex/schema.ts` or the relevant domain module.
2. Keep `pnpm run convex:dev` running so code generation stays current.
3. Run:

   ```bash
   pnpm convex typecheck
   ```

4. Update docs if the change affects setup, permissions, or public behavior.

For more detail, see [Database Changes](../development/02-database-changes.md).
