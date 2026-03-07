---
name: convex-typecheck-guard
description: Enforce `pnpm convex typecheck` whenever work changes files under `convex/`. Use this for any Convex backend edit, schema change, permission update, migration, query, mutation, action, or generated API-affecting change.
---

# Convex Typecheck Guard

Use this skill whenever you modify any file under `convex/`.

## Required Rule

After changing `convex/**`, run:

```bash
pnpm convex typecheck
```

## When To Run It

- After the first batch of Convex edits.
- Again after any later Convex edit in the same task.
- Before commit, push, or final handoff if Convex files changed.

## Expected Behavior

- Treat a failing `pnpm convex typecheck` as a blocker.
- Fix the reported errors before claiming the Convex changes are done.
- If hooks or formatting tools modify Convex files after a successful run, run `pnpm convex typecheck` again on the final state.

## Scope Notes

- This applies even if the user only asked for a small Convex change.
- If you only changed non-Convex files, this skill does not require a Convex typecheck.
