---
name: vector-cli-usage
description: Explain how to use the installed Vector CLI in this repository. Use when users ask for CLI onboarding, command examples, auth/profile/org workflows, scripting guidance, or a detailed explanation of how to operate `vcli` after installation.
---

# Vector CLI Usage

Use this skill when the user wants an explanation of the installed Vector CLI, not when they want new CLI features implemented.

This skill is for answering questions like:

- "How do I use the Vector CLI?"
- "Explain the CLI commands"
- "How do auth, profiles, and org selection work?"
- "What commands should I run after installing the CLI?"
- "How do I script the CLI with `--json`?"

## Verify The Current CLI First

Do not rely on stale command memory. Before giving a detailed answer, verify the current branch's CLI surface from:

- `src/cli/index.ts`
- `src/cli/auth.ts`
- `src/cli/session.ts`
- `src/cli/index.test.ts`
- `src/cli/auth.test.ts`

Prefer checking the real help output:

```bash
pnpm exec tsx src/cli/index.ts --help
pnpm exec tsx src/cli/index.ts auth --help
pnpm exec tsx src/cli/index.ts issue --help
```

If the user is using the installed binary instead of the repo entrypoint, mirror the same examples with:

```bash
vcli --help
vcli auth --help
```

Use whichever form matches the user's setup:

- Repo-local examples: `pnpm exec tsx src/cli/index.ts ...`
- Installed binary examples: `vcli ...`

## What To Explain

When the user asks for a detailed explanation, structure the answer in this order:

1. What the CLI talks to
2. How auth and session storage work
3. How org context works
4. The main command groups
5. Common end-to-end workflows
6. Scripting and troubleshooting notes

Keep examples concrete and copy-pasteable.

## Core Concepts

### App URL and Convex URL

The CLI uses:

- `--app-url` for the Next.js app and Better Auth routes
- `--convex-url` for the Convex deployment

The app URL must come from:

- `--app-url <url>`
- the saved profile session
- `NEXT_PUBLIC_APP_URL`

Convex URL defaults come from:

- `NEXT_PUBLIC_CONVEX_URL` or `CONVEX_URL`

If the local app origin is not already stored in the profile, say that explicitly and show `--app-url`.

### Profiles

Profiles let one machine keep separate CLI sessions.

Session files are stored in:

```text
~/.vector/cli-<profile>.json
```

Recommend:

- `default` for normal use
- named profiles like `work`, `staging`, or `demo` for parallel environments

Examples:

```bash
vcli --profile work auth login you@example.com --password 'secret'
vcli --profile staging --app-url http://localhost:3001 auth whoami
```

### Org Context

Most workspace commands need an active org.

The user can:

- pass `--org <slug>` on each command, or
- set an active org once with `org use <slug>`

Explain this clearly because many commands fail without org context.

## Auth Workflow

Explain auth with these commands first:

```bash
vcli auth signup --email you@example.com --username yourname --password 'secret'
vcli auth login you@example.com --password 'secret'
vcli auth whoami
vcli auth logout
```

Notes to include:

- Signup uses email, username, and password.
- Login accepts either email or username as the identifier.
- `whoami` shows the current user, org memberships, and active org.
- Logout clears the stored session for the selected profile.

If the user wants a first-run walkthrough, recommend:

```bash
vcli auth signup ...
vcli org create --name "Acme" --slug acme
vcli org use acme
vcli auth whoami
```

## Main Command Groups

Mention command groups in practical terms instead of listing them with no context.

### Workspace And Discovery

- `org`
- `invite`
- `search`
- `refdata`
- `permission`
- `activity`
- `notification`

### Settings And Metadata

- `role`
- `priority`
- `state`
- `status`

### Core Entities

- `team`
- `project`
- `issue`
- `document`
- `folder`

### Platform Admin

- `admin`

Call out that `admin` commands require platform-admin privileges.

## Common Workflows To Show

### 1. Create And Work Inside A New Org

```bash
vcli auth signup --email you@example.com --username you --password 'secret'
vcli org create --name "Acme" --slug acme
vcli org use acme
vcli team create --key eng --name "Engineering"
vcli project create --key api --name "API" --team eng
vcli issue create --title "Ship CLI" --project api --team eng
```

### 2. Invite Another User

```bash
vcli org invite acme --email teammate@example.com
vcli invite list
vcli invite accept <inviteId>
```

Explain that invite acceptance happens from the invited user's profile/session.

### 3. Inspect Workspace Metadata Before Writing Commands

```bash
vcli refdata acme
vcli search --org acme "billing"
vcli permission check issue:create --org acme
```

Use this workflow when the user wants to discover valid project keys, members, states, priorities, or permissions before mutating data.

### 4. Script The CLI

Recommend `--json` for automation:

```bash
vcli --json issue list --org acme
vcli --json notification inbox --filter unread
```

If the user is scripting, mention:

- prefer `--json`
- prefer explicit `--profile`
- prefer explicit `--org`

## Important Behavior Notes

- `org members` uses the roles-aware member query and includes custom-role state.
- Auth is session-based and profile-scoped.
- Some commands need an org slug even if the user is logged in.
- Team and project keys are validated by the backend; recommend short slug-like keys.
- Platform admin commands are separate from normal org-admin commands.

## Troubleshooting Guidance

When troubleshooting, start from the actual error and map it to the likely fix:

- `Not logged in`
  Run `vcli auth login` or `vcli auth signup`.

- `app URL is required`
  Pass `--app-url <url>`, set `NEXT_PUBLIC_APP_URL`, or log in once with `--app-url` so the selected profile stores it.


- `Organization slug is required`
  Pass `--org <slug>` or run `vcli org use <slug>`.

- Auth errors against the wrong server
  Make sure `--app-url` matches the running app origin.

- Convex connection errors
  Verify `NEXT_PUBLIC_CONVEX_URL` or pass `--convex-url`.

- Validation errors on create/update commands
  Check keys, slugs, required options, and org context. Suggest `refdata` or `search` first.

## Response Style For This Skill

When answering with this skill:

- Prefer installed-binary examples if the user says the CLI is installed.
- Prefer repo-entrypoint examples if the user is developing inside this repo.
- Group commands by workflow, not by file.
- Include exact commands, not pseudocode.
- Mention `--json`, `--profile`, and `--org` whenever they materially improve the workflow.
- If the user asked for a "detailed explanation", include both concept-level explanation and concrete examples.
