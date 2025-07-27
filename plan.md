# Migration Plan: tRPC to Convex

This document outlines the plan for completing the migration from tRPC to Convex.

## Learnings So Far

- **Type Safety is Key:** The migration has highlighted the importance of strong typing. Using `v.union` in the Convex schema for enum-like fields and `as const` for default value arrays has been crucial for avoiding runtime errors.
- **`id` vs `_id`:** Convex uses `_id` for document IDs, while the legacy code and some UI components expect `id`. It's important to map these correctly when passing data to components.
- **`orgSlug` vs `orgId`:** The URL parameter is the `orgSlug`, not the database `_id`. I've started renaming the route parameter to `orgSlug` to avoid confusion. This should be done consistently across the app.
- **Convex Hooks:** `useQuery` returns `undefined` while loading, not an `isLoading` boolean. `useMutation` does not return an `isPending` property, so loading states must be handled manually with `useState`.
- **Server-Side Logic:** All server-side data fetching and permission checks in page and layout components must be moved into client components using Convex hooks.

## Remaining Files to Refactor

The following files still use tRPC and need to be migrated to Convex:

- `src/components/issues/issues-table.tsx`
- `src/components/issues/issue-selectors.tsx`
- `src/app/api/trpc/[trpc]/route.ts`
- `src/components/projects/project-members.tsx`
- `src/components/organization/states-management-dialog.tsx`
- `src/components/organization/states-management-popover.tsx`
- `src/components/organization/custom-roles-manager.tsx`
- `src/components/organization/priorities-management-dialog.tsx`
- `src/app/[orgSlug]/(main)/teams/[teamKey]/page.tsx`

## Next Steps

1.  **Refactor Remaining Components:** Go through the list above and refactor each component to use Convex hooks instead of tRPC.
2.  **Implement Missing Convex Functions:** As new components are refactored, implement any missing Convex queries and mutations that they depend on.
3.  **Complete `orgSlug` Renaming:** Ensure that all references to the organization URL parameter are named `orgSlug` for clarity.
4.  **Remove Legacy Code:** Once all components are refactored, remove the `trpc` directory and any other unused legacy code.
5.  **Remove `[trpc]` API Route:** Delete the `src/app/api/trpc/[trpc]/route.ts` file.
6.  **Comprehensive Testing:** Thoroughly test the application to ensure that all features work as expected with the new Convex backend.

## Mistakes to Avoid

- **Do not use `any`:** Avoid using `any` as a type. If there is a type mismatch, fix the root cause by updating the schema, the data transformation, or the component props. [[memory:4475326]]
- **Do not change `params` prop type:** The `params` prop in page components must be a `Promise`. Do not change it.
- **Check Convex Docs:** When unsure about how a Convex hook works, consult the documentation before making assumptions.
- **Handle loading states correctly:** Remember that `useQuery` returns `undefined` while loading and that `useMutation` does not provide an `isPending` state.
- **Be careful with IDs:** Always ensure that you are using the correct ID (`_id` vs `id`) and that you are casting string IDs to the `Id` type when calling mutations.
