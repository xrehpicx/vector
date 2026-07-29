# Agent Instructions for Vector

## UX & Design

When working on **anything UX-related** in this project — new pages, components, dialogs, tables, selectors, styling, layout, loading states, or micro-interactions — **always use the `vector-design` skill** (`.agents/skills/vector-design/SKILL.md`).

This skill documents:

- The dense, Linear-inspired design language (sizing, spacing, typography)
- Layout patterns (page+tabs+table, sidebar, detail page)
- The Popover+Command selector pattern used across all selectors
- Creation dialog structure
- Table row pattern with motion/react animations
- Dynamic icon rendering (use `DynamicIcon` component, not raw `getDynamicIcon` in triggers)
- Permission-aware wrapping for RBAC

## Optimistic Updates

Every selector/dropdown that mutates data on Convex **must use optimistic updates** via `useOptimisticValue` from `src/hooks/use-optimistic.ts`. This is what makes the UI feel instant.

See `.agents/skills/vector-design/optimistic.md` for:

- How the hook works (state-during-render pattern, safety timeout)
- The selector integration pattern (set optimistic FIRST, fire mutation SECOND)
- Which selectors already have optimistic updates
- When NOT to use optimistic updates (creation dialogs, deletes, navigation)

## Key Rules

1. **Never use "Loading..." text.** Always use animated `Skeleton` components matching the loaded content shape.
2. **Never show spinners for inline property changes.** Optimistic state IS the feedback.
3. **Inline everything.** Properties are changed via in-place Popover+Command dropdowns, never separate pages.
4. **Use `DynamicIcon` component** (not `getDynamicIcon()`) in selector trigger buttons to satisfy React Compiler rules.
5. **Wrap editable selectors** in `PermissionAwareSelector` for RBAC.

## Tech Stack

- **Framework:** Next.js (App Router)
- **UI:** shadcn/ui + Tailwind CSS v4
- **Backend/DB:** Convex (reactive queries + mutations)
- **Animation:** motion/react (`AnimatePresence`, `layout`)
- **Auth:** Better Auth
- **Icons:** Lucide React (with dynamic icon map in `src/lib/dynamic-icons.tsx`)

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
