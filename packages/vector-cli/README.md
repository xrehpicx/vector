# Vector CLI

CLI for interacting with a Vector workspace from the terminal.

This package wraps the same auth and Convex-backed workflows used by the app, so you can manage orgs, roles, teams, projects, issues, documents, notifications, and admin settings without opening the UI.

## Install

```bash
npm install -g @rechpic/vcli
```

Then verify the install:

```bash
vcli --help
```

## Requirements

- Node.js `>=20.19.0`
- A running Vector app
- Access to the app's Convex deployment

The CLI talks to:

- the Next.js app for auth routes
- the Convex deployment for queries, mutations, and actions

The app URL is required. `vcli` resolves it from:

- `--app-url <url>`
- the saved profile session
- `NEXT_PUBLIC_APP_URL`

The Convex URL still defaults from:

- `NEXT_PUBLIC_CONVEX_URL` or `CONVEX_URL`

You can override either with flags:

```bash
vcli --app-url http://localhost:3000 --convex-url https://<deployment>.convex.cloud --help
```

## First Run

Sign up or log in:

```bash
vcli --app-url http://localhost:3000 auth signup --email you@example.com --username you --password 'secret'
vcli --app-url http://localhost:3000 auth login you@example.com --password 'secret'
vcli auth whoami
```

Create and select an org:

```bash
vcli org create --name "Acme" --slug acme
vcli org use acme
```

From there, most commands can rely on the active org. You can always override it with `--org <slug>`.

## Profiles

Sessions are stored per profile in:

```text
~/.vector/cli-<profile>.json
```

Examples:

```bash
vcli --profile work auth login you@example.com --password 'secret'
vcli --profile staging --app-url http://localhost:3001 auth whoami
```

Use profiles when you work across multiple environments or accounts.

## Common Commands

Inspect the current session:

```bash
vcli auth whoami
vcli org current
vcli org members acme
```

Discover workspace metadata before mutating:

```bash
vcli refdata acme
vcli search --org acme "billing"
vcli permission check issue:create --org acme
```

Create core entities:

```bash
vcli team create --org acme --key eng --name "Engineering"
vcli project create --org acme --key api --name "API" --team eng
vcli issue create --org acme --title "Ship CLI" --project api --team eng
vcli document create --org acme --title "CLI Notes"
vcli folder create --org acme --name "Runbooks"
```

Issue workflows:

```bash
vcli issue list --org acme
vcli issue assignments API-1
vcli issue set-priority API-1 High
vcli issue replace-assignees API-1 "alice,bob"
vcli issue comment API-1 --body "Investigating now."
```

Invites and notifications:

```bash
vcli org invite acme --email teammate@example.com
vcli invite list
vcli invite accept <inviteId>
vcli notification inbox --filter unread
vcli notification unread-count
```

Settings metadata:

```bash
vcli priority list acme
vcli state list acme
vcli status list acme
vcli role list acme
```

Platform admin:

```bash
vcli admin branding
vcli admin signup-policy
```

## JSON Output

Use `--json` for automation and scripts:

```bash
vcli --json issue list --org acme
vcli --json notification inbox --filter unread
```

For scripts, prefer:

- `--json`
- `--profile`
- `--org`

## Troubleshooting

`Not logged in`

- Run `vcli auth login` or `vcli auth signup`.

`app URL is required`

- Pass `--app-url <url>`, set `NEXT_PUBLIC_APP_URL`, or log in once with `--app-url` so the selected profile stores it.

`Organization slug is required`

- Pass `--org <slug>` or run `vcli org use <slug>`.

Auth errors against the wrong app

- Make sure `--app-url` points at the running Vector app origin.

Convex connection errors

- Set `--convex-url`, `NEXT_PUBLIC_CONVEX_URL`, or `CONVEX_URL`.

Validation errors when creating teams or projects

- Use short slug-like keys such as `eng`, `api`, or `mobile-platform`.

## Help

Inspect command groups directly:

```bash
vcli auth --help
vcli org --help
vcli issue --help
vcli notification --help
vcli admin --help
```
