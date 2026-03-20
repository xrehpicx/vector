<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/xrehpicx/vector/main/public/icons/vector-wordmark-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/xrehpicx/vector/main/public/icons/vector-wordmark.png">
    <img alt="Vector" src="https://raw.githubusercontent.com/xrehpicx/vector/main/public/icons/vector-wordmark.png" width="220">
  </picture>
  <p>Open source issue tracking and project management built because there was no truly open source alternative to Linear.</p>
</div>

Vector exists because I wanted the speed and focus of Linear, but without giving up source access, self-hosting, or the ability to shape the product for my own team.

Most tools in this category are either:

- not actually open source
- source-available but not realistically self-hostable
- open source, but missing the product quality and workflows that make Linear compelling

So I made this.

Vector is for teams that want a real open source Linear-style workspace for:

- issues, projects, and teams
- docs and linked project context
- work sessions that keep active execution tied to the issue
- permissions and org-level administration
- GitHub-linked development workflows
- self-hosting and code-level customization

Quick links: [Why Vector Exists](#why-vector-exists) · [Features](#features) · [Entity Model](#entity-model) · [Screenshots](#screenshots) · [Quick Start](#quick-start) · [Environment Variables](#environment-variables) · [Development](#development) · [Documentation](#documentation) · [Contributing](#contributing)

![Issues Kanban Board](public/screenshots/issues-kanban.png)

## Why Vector Exists

Linear set the bar for fast, focused project management. The problem was that there was no true open source alternative that felt serious enough to adopt and extend.

Vector was built to close that gap:

- open source from day one
- designed for self-hosting, not just cloud-only usage
- built to be modified by the team using it
- shaped around the workflows people actually want from Linear-style tooling

The goal is not to clone every Linear feature. The goal is to build an opinionated, high-quality open source alternative for teams that want control over their tooling.

## Features

- Multi-tenant organizations
- Projects, issues, teams, and role-based permissions
- Kanban and table views for issue tracking
- Saved views with table, kanban, and timeline layouts
- Public views that can power a shareable roadmap surface
- Issue-linked work sessions with attach, delegate, and shared terminal flows
- Rich document editor with markdown, mentions, and slash commands
- Real-time data updates with Convex
- Optional email and web-push notification delivery
- Better Auth integration with Convex-backed user data
- Type-safe frontend and backend with TypeScript

## What You Get

- A focused issue tracker with table and kanban views
- Saved views for teams, projects, and custom slices of work
- Public roadmap publishing from a public saved view
- Work sessions that let you manage the issue and do the work in the same place
- Projects, teams, and org-level workflows in one app
- Rich collaborative docs with mentions and slash commands
- Role-based permissions for multi-tenant organizations
- GitHub linking for pull requests, issues, and commits
- A CLI for terminal-first workflows
- A codebase you can actually run, inspect, fork, and change

## Entity Model

Vector’s core workspace entities are:

- Issues: the unit of work that moves through statuses, priorities, assignments, and discussion.
- Teams: groups of people that own work and organize responsibility.
- Projects: larger initiatives that collect related issues under shared ownership and status.
- Documents: longer-form collaborative knowledge like specs, notes, and context.
- Views: saved issue configurations that define filters, layout, grouping, and sharing behavior.

For the fuller explanation of how these entities relate and what each one is for, see [docs/product/04-entities.md](docs/product/04-entities.md).

Views are also how Vector exposes a public roadmap: make a saved view public, then select it as the organization's public landing view to publish that slice of work at your public org URL.

## Screenshots

<details>
<summary>Issues — Table View</summary>

![Issues Table View](public/screenshots/issues-table.png)

</details>

<details>
<summary>Project Detail</summary>

![Project Detail](public/screenshots/project-detail.png)

</details>

<details>
<summary>Documents</summary>

![Documents List](public/screenshots/documents.png)

</details>

<details>
<summary>Document Editor</summary>

![Document Detail](public/screenshots/document-detail.png)

</details>

## Stack

- Next.js 16 and React 19
- Convex for database, functions, realtime, and storage
- Better Auth with the Convex adapter
- Tailwind CSS v4, Base UI/Radix primitives, and shadcn/ui
- ESLint, Prettier, Husky, and pnpm

## CLI

Vector also ships with a dedicated CLI package for terminal workflows.

The CLI powers the device bridge behind work sessions, so you can connect a machine to Vector, attach an existing agent session to an issue, or launch a managed Codex, Claude, or shell session from the issue itself and follow it from the same view.

- Package README: [packages/vector-cli/README.md](packages/vector-cli/README.md)
- Local repo entrypoint: `pnpm exec tsx src/cli/index.ts --help`
- Published package target: `@rehpic/vcli`
- AI agent skill: `npx skills add xrehpicx/vector-skill`

## Project Status

Vector is under active development. The top-level docs in this repository reflect the current contributor workflow. Some files under `docs/migration/` remain as historical implementation notes from earlier architecture work and should not be treated as onboarding documentation.

## Quick Start

### Requirements

- Node.js `>=20.19.0`
- `pnpm`
- A local Convex dev deployment

### Local Setup

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Create local environment variables.

   ```bash
   cp sample.env .env.local
   ```

3. Update `.env.local` with your local values.

   Minimum app setup usually includes:
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
   - `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000`
   - `BETTER_AUTH_SECRET=<your-secret>`
   - `NEXT_PUBLIC_CONVEX_URL=<your-local-convex-url>`
   - `CONVEX_SITE_URL=http://127.0.0.1:3211`
   - `NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211`

   `NEXT_PUBLIC_CONVEX_URL` alone is not enough for local auth helpers. The Next.js server also uses `CONVEX_SITE_URL` or `NEXT_PUBLIC_CONVEX_SITE_URL`.

   If you want the assistant enabled locally, also set these in the Convex environment:
   - `OPENROUTER_API_KEY=<your-openrouter-api-key>`
   - `OPENROUTER_MODEL=moonshotai/kimi-k2.5:nitro` (optional override)

   Example:

   ```bash
   pnpm convex env set OPENROUTER_API_KEY <your-openrouter-api-key>
   pnpm convex env set OPENROUTER_MODEL moonshotai/kimi-k2.5:nitro
   ```

4. Start Convex in one terminal.

   ```bash
   pnpm run convex:dev
   ```

5. Start Next.js in another terminal.

   ```bash
   pnpm run dev
   ```

6. Open `http://localhost:3000`.

   On a fresh local instance, visit `/setup-admin` to create the first administrator account.

## Environment Variables

Copy `sample.env` to `.env.local` and update the values.

For local development, Next.js and Convex can both read from the same root env file, so a single `.env.local` is enough. For production, split variables by the runtime that actually reads them.

The implementation is currently split across three env readers:

- Next.js app code, with limited validation in `src/env.ts`
- Convex runtime code in `convex/*`, which reads `process.env` directly
- the Vector CLI, which separately loads `.env.local` and `.env`

### Minimum Local Setup

If you only want the app running locally, start with these:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000
BETTER_AUTH_SECRET=<your-secret>
NEXT_PUBLIC_CONVEX_URL=<your-local-convex-url>
CONVEX_SITE_URL=http://127.0.0.1:3211
NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211
```

Optional for local development:

- SMTP variables if you want real email delivery instead of local logging
- VAPID variables if you want browser push notifications
- `OPENROUTER_API_KEY` if you want the Convex assistant enabled
- `OPENROUTER_MODEL` to override the default assistant model
- GitHub OAuth and GitHub App variables if you want to test GitHub integration locally
- `CONVEX_URL` / `CONVEX_ADMIN_KEY` for migration scripts and CLI-only workflows

### Set In Next.js Environment (`.env.local`, Vercel)

| Variable                       | Why it belongs here                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`       | Read by the browser Convex providers and Next.js server code that talks to Convex. |
| `CONVEX_SITE_URL`              | Read by `src/lib/auth-server.ts` on the Next.js server for auth helper requests.   |
| `NEXT_PUBLIC_CONVEX_SITE_URL`  | Fallback for `CONVEX_SITE_URL` in `src/lib/auth-server.ts`.                        |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Read in browser push-subscription code.                                            |

### Set In Convex Environment

| Variable                      | Why it belongs here                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`          | Read in `convex/auth.ts` to sign Better Auth tokens and encrypt JWKS private keys.                                                                                |
| `NEXT_PUBLIC_APP_URL`         | Read in `convex/auth.ts` as the Better Auth base URL.                                                                                                             |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Read in `convex/auth.ts` for the auth callback allowlist.                                                                                                         |
| `SMTP_HOST`                   | SMTP server hostname for sending emails (OTP codes and notifications).                                                                                            |
| `SMTP_PORT`                   | SMTP port (default `587`, use `465` for SSL).                                                                                                                     |
| `SMTP_USER`                   | SMTP username for authentication.                                                                                                                                 |
| `SMTP_PASS`                   | SMTP password for authentication.                                                                                                                                 |
| `SMTP_FROM`                   | Sender address for outgoing emails, e.g. `Vector <noreply@yourdomain.com>`. Falls back to `SMTP_USER` if not set. Must be a valid email or `Name <email>` format. |
| `VAPID_PUBLIC_KEY`            | Read in `convex/notifications/actions.ts` for push delivery.                                                                                                      |
| `VAPID_PRIVATE_KEY`           | Read in `convex/notifications/actions.ts` for push delivery.                                                                                                      |
| `VAPID_SUBJECT`               | Read in `convex/notifications/actions.ts` for push delivery.                                                                                                      |
| `OPENROUTER_API_KEY`          | Required by `convex/ai/provider.ts` for the organization assistant and all agent responses.                                                                       |
| `OPENROUTER_MODEL`            | Optional model override for `convex/ai/provider.ts`. Defaults to `moonshotai/kimi-k2.5:nitro`.                                                                    |
| `GITHUB_CLIENT_ID`            | Optional GitHub OAuth provider configuration in `convex/auth.ts`.                                                                                                 |
| `GITHUB_CLIENT_SECRET`        | Optional GitHub OAuth provider configuration in `convex/auth.ts`.                                                                                                 |
| `GITHUB_APP_ID`               | Optional GitHub App integration configuration in `convex/github/node.ts`.                                                                                         |
| `GITHUB_APP_PRIVATE_KEY`      | Optional GitHub App private key in `convex/github/node.ts`.                                                                                                       |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Optional encryption key for stored GitHub fallback tokens in `convex/github/node.ts`.                                                                             |

`NEXT_PUBLIC_APP_URL` has a public-looking prefix, but the current code reads it from Convex auth code rather than browser code.

SMTP and VAPID settings are optional. If you leave them unset locally, the core app still runs. `OPENROUTER_API_KEY` is only required if you want the assistant feature to work. GitHub webhook secrets are generated per workspace in Vector settings rather than coming from an env var.

### Local CLI / Convex Tooling Only

| Variable            | Why it belongs here                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `CONVEX_URL`        | Used by `scripts/run-permission-migrations.ts` when invoking `pnpm convex run`.                |
| `CONVEX_ADMIN_KEY`  | Only needed by `scripts/run-permission-migrations.ts` for admin-only migrations.               |
| `CONVEX_DEPLOYMENT` | Managed by the Convex CLI during local development. It is not read by the application runtime. |

For the exhaustive runtime-by-runtime breakdown, see [docs/getting-started/02-environment-variables.md](docs/getting-started/02-environment-variables.md).

## Development

| Command                  | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `pnpm run dev`           | Start the Next.js development server                      |
| `pnpm run convex:dev`    | Run the local Convex backend and code generation          |
| `pnpm run lint`          | Run ESLint                                                |
| `pnpm run build`         | Build the production app                                  |
| `pnpm run format`        | Format the repository with Prettier                       |
| `pnpm run project:setup` | Install dependencies, prepare hooks, and print next steps |

## Documentation

Start with:

- Contributor docs: [docs/index.md](docs/index.md)
- Entity model: [docs/product/04-entities.md](docs/product/04-entities.md)
- Local setup: [docs/getting-started/01-local-setup.md](docs/getting-started/01-local-setup.md)
- Environment variables: [docs/getting-started/02-environment-variables.md](docs/getting-started/02-environment-variables.md)
- Common commands: [docs/getting-started/04-common-commands.md](docs/getting-started/04-common-commands.md)
- GitHub development tracking test guide: [docs/development/09-github-development-tracking.md](docs/development/09-github-development-tracking.md)

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), then check [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md) for the expected collaboration and reporting process.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
