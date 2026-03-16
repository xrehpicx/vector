# Vector CLI

CLI for interacting with a Vector workspace from the terminal.

This package wraps the same auth and Convex-backed workflows used by the app, so you can manage orgs, roles, teams, projects, issues, documents, notifications, and admin settings without opening the UI.

## Install

```bash
npm install -g vecli
```

Then verify the install:

```bash
vecli --help
```

## Requirements

- Node.js `>=20.19.0`
- A running Vector app
- Access to the app's Convex deployment

The CLI talks to:

- the Next.js app for auth routes
- the Convex deployment for queries, mutations, and actions

The app URL is required. `vecli` resolves it from:

- `--app-url <url>`
- the saved profile session
- `NEXT_PUBLIC_APP_URL`

The Convex URL still defaults from:

- `NEXT_PUBLIC_CONVEX_URL` or `CONVEX_URL` for Convex

You can override either with flags:

```bash
vecli --app-url http://localhost:3000 --convex-url https://<deployment>.convex.cloud --help
```

## First Run

Sign up or log in:

```bash
vecli --app-url http://localhost:3000 auth signup --email you@example.com --username you --password 'secret'
vecli --app-url http://localhost:3000 auth login you@example.com --password 'secret'
vecli auth whoami
```

Create and select an org:

```bash
vecli org create --name "Acme" --slug acme
vecli org use acme
```

From there, most commands can rely on the active org. You can always override it with `--org <slug>`.

## Profiles

Sessions are stored per profile in:

```text
~/.vector/cli-<profile>.json
```

Examples:

```bash
vecli --profile work auth login you@example.com --password 'secret'
vecli --profile staging --app-url http://localhost:3001 auth whoami
```

Use profiles when you work across multiple environments or accounts.

## Common Commands

Inspect the current session:

```bash
vecli auth whoami
vecli org current
vecli org members acme
```

Discover workspace metadata before mutating:

```bash
vecli refdata acme
vecli search --org acme "billing"
vecli permission check issue:create --org acme
```

Create core entities:

```bash
vecli team create --org acme --key eng --name "Engineering"
vecli project create --org acme --key api --name "API" --team eng
vecli issue create --org acme --title "Ship CLI" --project api --team eng
vecli document create --org acme --title "CLI Notes"
vecli folder create --org acme --name "Runbooks"
```

Issue workflows:

```bash
vecli issue list --org acme
vecli issue assignments API-1
vecli issue set-priority API-1 High
vecli issue replace-assignees API-1 "alice,bob"
vecli issue comment API-1 --body "Investigating now."
```

Invites and notifications:

```bash
vecli org invite acme --email teammate@example.com
vecli invite list
vecli invite accept <inviteId>
vecli notification inbox --filter unread
vecli notification unread-count
```

Settings metadata:

```bash
vecli priority list acme
vecli state list acme
vecli status list acme
vecli role list acme
```

Platform admin:

```bash
vecli admin branding
vecli admin signup-policy
```

## JSON Output

Use `--json` for automation and scripts:

```bash
vecli --json issue list --org acme
vecli --json notification inbox --filter unread
```

For scripts, prefer:

- `--json`
- `--profile`
- `--org`

## Troubleshooting

`Not logged in`

- Run `vecli auth login` or `vecli auth signup`.

`app URL is required`

- Pass `--app-url <url>`, set `NEXT_PUBLIC_APP_URL`, or log in once with `--app-url` so the selected profile stores it.

`Organization slug is required`

- Pass `--org <slug>` or run `vecli org use <slug>`.

Auth errors against the wrong app

- Make sure `--app-url` points at the running Vector app origin.

Convex connection errors

- Set `--convex-url`, `NEXT_PUBLIC_CONVEX_URL`, or `CONVEX_URL`.

Validation errors when creating teams or projects

- Use short slug-like keys such as `eng`, `api`, or `mobile-platform`.

## Help

Inspect command groups directly:

```bash
vecli auth --help
vecli org --help
vecli issue --help
vecli notification --help
vecli admin --help
```
