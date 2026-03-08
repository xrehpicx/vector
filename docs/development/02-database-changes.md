# Database Changes

Vector uses Convex as the operational data store, so schema changes are made in Convex rather than through SQL migrations.

## Schema Definition

- Main schema file: `convex/schema.ts`
- Domain-specific backend logic lives under `convex/<domain>/...`
- Shared validators and permission helpers live under `convex/_shared/...`

## Typical Workflow

1. Update `convex/schema.ts` or the relevant Convex domain module.
2. Keep `pnpm run convex:dev` running so generated bindings stay current.
3. Run:

   ```bash
   pnpm convex typecheck
   ```

4. Verify affected UI and backend flows.
5. Update docs if the schema change affects setup, permissions, or visible behavior.

## Notes

- Avoid duplicating data-model types manually when generated Convex types already exist.
- Prefer evolving existing domain modules over creating ad hoc one-off backend files.
- If a change affects permission behavior, also review `convex/access.ts`, `convex/roles/index.ts`, and `convex/_shared/permissions.ts`.
