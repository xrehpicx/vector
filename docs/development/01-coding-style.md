# Coding Style and Conventions

This document outlines the general coding style and conventions to be followed when contributing to the project.

## Imports

- Always use the `@/` path alias for imports within the `src` directory.
- Prefer static ES imports. Avoid dynamic `await import()` unless there is a clear runtime-loading need.

## Components

- Client Components must have the `'use client'` directive at the top of the file.

## Commit Granularity

- Group logically related edits into a single commit.
- Keep diffs minimal and focused on a single task or feature.

## Moving and Renaming Files

- When reorganizing files, use `git mv` instead of copy-pasting and deleting. This preserves the file's history.

## Dates and Times

- All timestamps must be stored in **UTC** in the database.
- Use **date-fns** for all date parsing and formatting.
- A shared helper module is available at `src/lib/date.ts`. Import and use its functions (`formatDateForDb`, `toDate`, `DATE_PATTERN`) instead of creating your own.
- The client should determine the user's IANA timezone and format dates accordingly.

## Dynamic Route Params in Server Components

- In Next.js App Router server components, the `params` object is an **async** API.
- Always `await` the `params` object before accessing its properties.

  ```tsx
  // Correct usage
  interface PageProps {
    params: Promise<{ projectId: string }>;
  }

  export default async function ProjectPage({ params }: PageProps) {
    const { projectId } = await params;
    // ...
  }
  ```
