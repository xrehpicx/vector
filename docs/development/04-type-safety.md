# Type Safety

Maintaining strict type safety is a core principle of this project. This guide outlines the rules for writing type-safe code. The goal is to catch errors at compile time, not at runtime.

## Type Inference over Hard-coding

Derive types from Convex-generated types and query return types whenever possible. This keeps the frontend and backend aligned with the actual schema and function outputs.

```typescript
import { FunctionReturnType } from 'convex/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

type Project = FunctionReturnType<
  typeof api.organizations.queries.listProjects
>[number];

function loadProject(projectId: Id<'projects'>) {
  return projectId;
}

// Good: both types stay aligned with generated backend types.
```

## Avoid Unsafe Types

### The `any` type

The `any` type is a powerful tool, but it disables all type-checking for that variable. Its use is strongly discouraged.

- **Justification is mandatory**: In the rare case that `any` is truly necessary (e.g., for complex generic functions or workarounds), you **must** add a comment explaining _why_ it's needed and, if possible, a `// TODO:` to fix it later.
- **Prefer `unknown`**: If you have a variable of an unknown type, prefer `unknown` over `any`. `unknown` is type-safe because it forces you to perform explicit type checks before you can use the variable.

### Non-Null Assertions (`!`)

Avoid using the non-null assertion operator (`!`). It tells the compiler to trust you that a value is not `null` or `undefined`, which can lead to runtime errors if that trust is misplaced.

Instead of `const user = session!.user;`, handle the possibility of a null session gracefully:

```typescript
if (!session) {
  throw new Error('Unauthenticated');
}
const user = session.user;
```
