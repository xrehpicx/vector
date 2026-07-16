<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/xrehpicx/vector/main/public/icons/vector-wordmark-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/xrehpicx/vector/main/public/icons/vector-wordmark.png">
    <img alt="Vector" src="https://raw.githubusercontent.com/xrehpicx/vector/main/public/icons/vector-wordmark.png" width="220">
  </picture>
</p>

<p align="center">CLI for interacting with a Vector workspace from the terminal.</p>

This package wraps the same auth and Convex-backed workflows used by the app, so people and coding agents can manage Requests, Work, Tasks, organizations, projects, documents, notifications, and admin settings without opening the UI.

Vector's delivery model has three levels:

- **Request** captures an intake, the expected output, routing, and requester review.
- **Work** is the durable outcome context: workpad, ownership history, linked Requests, agent executions, GitHub evidence, and review state.
- **Task** is an optional tracked step within Work. A Work can also use only its live checklist and notes.

Accepting or being assigned a Request never starts Work. Use `vcli work start` (or `vcli work status ... active`) for that explicit transition.

## Install

```bash
npm install -g @rehpic/vcli
yarn global add @rehpic/vcli
pnpm add -g @rehpic/vcli
bun add -g @rehpic/vcli
```

Then verify the install:

```bash
vcli --help
```

## Requirements

- Node.js `>=22.19.0`
- A running Vector app
- Access to the app's Convex deployment

The CLI talks to:

- the Next.js app for auth routes
- the Convex deployment for queries, mutations, and actions

The app URL is required. `vcli` resolves it from:

- `--app-url <url>`
- the saved profile session
- `NEXT_PUBLIC_APP_URL`

The Convex URL resolves from:

- `--convex-url <url>`
- the saved profile session
- the app's `/api/config` endpoint
- `NEXT_PUBLIC_CONVEX_URL` or `CONVEX_URL` as local fallbacks when the app reports the default local URL

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

Starting the bridge with an explicit profile makes it the daemon's active
profile and repairs the macOS LaunchAgent if Node or the CLI moved:

```bash
vcli --profile work service start
vcli service status
```

The status command reports a degraded bridge when heartbeats fail instead of
leaving it stuck at "Starting". On macOS, the native menu bar app is installed
with the bridge, uses the active profile, and requires macOS 14 or newer.

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
vcli request create --org acme --title "Ship CLI" --expected-output "A published CLI with installation docs" --recipients alice@example.com
vcli work create --org acme --title "Ship CLI" --request REQ-1 --owner alice@example.com --project api
vcli work start API-1
vcli task create API-1 --title "Publish npm package" --assignee alice@example.com
vcli document create --org acme --title "CLI Notes"
vcli folder create --org acme --name "Runbooks"
```

Request, Work, and Task workflows:

```bash
vcli request list --org acme --scope inbox
vcli request route REQ-1 "alice@example.com,bob@example.com"
vcli request claim REQ-1
vcli request link-work REQ-1 API-1

vcli work list --org acme --scope active
vcli work list --org acme --scope mine
vcli work context API-1
vcli work watch API-1 --events tasks,requests
vcli work status API-1 waiting
vcli work attention API-1 --title "Need a product decision" --task 2 --execution <liveActivityId>
vcli work handoff API-1 bob@example.com --summary "Backend is complete; UI remains"
vcli work ready-for-review API-1

vcli task list API-1
vcli task create API-1 --title "Update docs"
vcli task create API-1 --title "Add tests" --execution <liveActivityId>
vcli task status API-1 2 blocked
vcli task assign API-1 2 bob@example.com
vcli task assign API-1 2
```

`work watch` uses a live Convex subscription rather than polling. Watch all
changes with `vcli work watch API-1`, or filter to `work`, `tasks`, `requests`,
`attention`, `handoffs`, and `executions` with `--events`. Event types are
granular, including `task.completed` and `request.added`. For agents, global
`--json` emits one NDJSON object per event. Combine `--once` with
`--timeout <seconds>` for a bounded wait, and add `--initial` when the current
snapshot should be emitted before future changes.

The `--execution` flag is required when an agent wants its Task or attention request attributed to a live Vector execution. It also enforces that Work's agent Task policy permits creation.

The legacy `vcli issue` commands remain temporarily available for compatibility. New automation should use `request`, `work`, and `task`.

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

Update metadata without unintentionally clearing an existing icon, or clear it
explicitly when needed:

```bash
vcli priority update urgent --name "Urgent" --color "#DC2626"
vcli priority update urgent --name "Urgent" --color "#DC2626" --clear-icon
vcli state update review --name "Review" --position 3 --type in_progress --color "#F59E0B" --clear-icon
vcli status update paused --name "Paused" --position 3 --type planned --color "#6B7280" --clear-icon
```

Platform admin:

```bash
vcli admin branding
vcli admin signup-policy
```

## JSON Output

Use `--json` for automation and scripts:

```bash
vcli --json work list --org acme
vcli --json request list --org acme
vcli --json notification inbox --filter unread
vcli --json work watch API-1 --events tasks,requests --once --timeout 1800
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

- Make sure `--app-url` points at the right Vector app first, since `vcli` fetches the Convex URL from that app when possible.
- Otherwise set `--convex-url`, `NEXT_PUBLIC_CONVEX_URL`, or `CONVEX_URL`.

Bridge or menu bar is stale after updating Node or the CLI

- Run `vcli service start` again. It regenerates and restarts the LaunchAgent.
- Use `vcli service logs` if `vcli service status` reports a degraded bridge.
- Stable updates use the npm `latest` channel. Menu-bar automatic updates are
  opt-in; use `vcli update` for an explicit update.

Validation errors when creating teams or projects

- Use short slug-like keys such as `eng`, `api`, or `mobile-platform`.

## AI Agent Skill

Install the Vector CLI skill for your AI coding agent:

```bash
npx skills add xrehpicx/vector-skill
```

## Help

Inspect command groups directly:

```bash
vcli auth --help
vcli org --help
vcli request --help
vcli work --help
vcli task --help
vcli notification --help
vcli admin --help
```
