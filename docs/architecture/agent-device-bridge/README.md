# Agent Device Bridge

The agent device bridge connects local developer machines to Vector. It lets local Codex, Claude Code, Cursor, GitHub Copilot, OpenCode, and Pi sessions show up as **live activities** on issues, enables bidirectional messaging between Vector and local agents, and supports delegating issue work to a specific device.

Managed launches are owned by the CLI client. The bridge calls provider APIs or provider CLIs locally, normalizes their events, and writes those events to Convex. Vector renders the Convex transcript reactively, so it no longer needs a live terminal connection for normal agent chat.

## Quick Start

```bash
# 1. Log in to the CLI
vcli auth login

# 2. Start the bridge service
vcli service start

# 3. That's it — your device is now registered and the bridge is running.
#    Open Vector and look for the Live Activity section on any issue.
```

## Architecture Overview

```
┌─────────────────────┐         ┌─────────────────────────┐
│   Vector Web App     │ ◄─────► │     Convex Backend       │
│   (issue page, live  │         │  (agentDevices, live     │
│    activity cards)   │         │   activities, commands)  │
└─────────────────────┘         └────────────┬────────────┘
                                             │
                                    Convex SDK (queries/mutations)
                                             │
                                ┌────────────▼────────────┐
                                │   Local Bridge Service    │
                                │  (vcli service start)     │
                                │                           │
                                │  • Device heartbeat       │
                                │  • Agent session runtime  │
                                │  • Agent event sync       │
                                │  • Process discovery      │
                                │  • Command polling        │
                                │  • Message delivery       │
                                └────────────┬────────────┘
                                             │
                                    ps/lsof discovery
                                             │
                                ┌────────────▼────────────┐
                                │  Local Agent Processes    │
                                │  (Codex, Claude, Cursor,  │
                                │   Copilot, OpenCode, Pi)  │
                                └─────────────────────────┘
```

## Components

### 1. Convex Backend (`convex/agentBridge/`)

Seven tables store all bridge state:

| Table                 | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `agentDevices`        | Registered machines with heartbeat status       |
| `deviceWorkspaces`    | Approved working directories for delegated runs |
| `agentProcesses`      | Discovered/managed local agent processes        |
| `delegatedRuns`       | Issue delegation to a device/agent/workspace    |
| `issueLiveActivities` | Issue-bound view of a running agent session     |
| `issueLiveMessages`   | Transcript messages (agent ↔ user)              |
| `agentCommands`       | Outbound command queue (Vector → bridge)        |

Key backend files:

- `convex/agentBridge/queries.ts` — Read queries (authenticated via user session)
- `convex/agentBridge/mutations.ts` — Write mutations (authenticated via user session)
- `convex/agentBridge/bridgePublic.ts` — Public mutations for the bridge CLI (authenticated via device secret)
- `convex/agentBridge/internal.ts` — Staleness cron + simulated bridge fallback
- `convex/_shared/agentBridge.ts` — Shared validators and type constants

### 2. Frontend (`src/components/live-activity/`)

The issue detail page includes a **Live Activity** section between the development section and comments. It shows:

- Active sessions as expandable cards (title, provider, device, status badge)
- Inline transcript with user messages (shown with avatar) and agent messages
- Composer to send messages to the agent
- Past/disconnected sessions collapsed under a toggle
- Attach flow (Popover+Command to attach a running process)
- Delegation flow (device → agent → workspace picker)

Key files:

- `src/components/live-activity/live-activity-card.tsx` — Unified card with header + transcript
- `src/components/live-activity/live-activity-section.tsx` — Section with attach/delegate buttons

### 3. CLI Bridge (`packages/vector-cli/src/bridge-service.ts`)

The bridge runs as a local Node.js process. It uses `ConvexHttpClient` to communicate directly with the Convex backend.

**What it does every cycle:**

| Loop                | Interval | Action                                                   |
| ------------------- | -------- | -------------------------------------------------------- |
| Heartbeat           | 30s      | Marks device as online                                   |
| Command poll        | 5s       | Checks for pending messages/commands from Vector         |
| Process discovery   | 60s      | Finds local Claude Code, Codex, and tmux processes       |
| Terminal snapshots  | 180s     | Refreshes tmux-backed shell session previews when needed |
| Live activity cache | 30s      | Writes `~/.vector/live-activities.json` for the menu bar |

For managed launches, `packages/vector-cli/src/agent-adapters.ts` and `packages/vector-cli/src/local-agents/` own the provider session:

- Codex uses `codex app-server` JSON-RPC.
- Claude uses `@anthropic-ai/claude-agent-sdk`.
- Cursor, Copilot, OpenCode, and Pi are exposed as CLI-owned one-shot providers with native CLI fallbacks. They do not claim resumable inbound messaging until a verifiable provider session id is available.
- Adapters emit normalized `AgentSessionEvent` objects.
- The bridge stores those events in `issueLiveMessages` with structured payload fields for source, provider, title, status, attachments, auth URLs, tool ids, and usage metadata.
- Follow-up user messages resume Codex and Claude sessions by session key instead of typing into a terminal.
- Work session rows store Cells-style settings and state: model, permission mode, thinking level, fast mode, context length, queue, pending approvals, pending plan approval, pending questions, Codex plan state, and usage.

Tmux is still supported for attached shell sessions and manually observed panes. Those sessions continue to use terminal snapshots and pane input.

### 4. macOS Menu Bar (`packages/vector-cli/macos/VectorMenuBar.swift`)

A lightweight native Swift app that shows the Vector icon in the macOS status bar.

- Reads a bounded, secret-free snapshot from `vcli --json service menu-state`
- Shows running, degraded, starting, and offline bridge state
- Switches CLI profiles and reconciles the bridge account/device
- Shows issue list with click-to-open (opens issue in Vector web app)
- Start/Stop/Restart bridge controls
- Refreshes every 8 seconds with subprocess timeouts

## CLI Commands

### Bridge lifecycle

```bash
vcli service start      # Run bridge in foreground (auto-registers device)
vcli service stop       # Stop the bridge
vcli service status     # Show bridge status
vcli service install    # Install as macOS LaunchAgent (auto-start on login)
vcli service uninstall  # Remove LaunchAgent
vcli service logs       # Tail bridge logs

vcli bridge start       # Shortcut: register + install LaunchAgent + start
vcli bridge stop        # Stop + uninstall LaunchAgent
vcli bridge status      # Quick status check
```

### Menu bar

```bash
# Compile the menu bar app (requires Xcode CLI tools)
pnpm --filter @rehpic/vcli build

# Run it
open packages/vector-cli/native/VectorMenuBar.app
```

The menu bar app is bundled with the CLI and launched by the bridge LaunchAgent.

## Data Flow

### Managed launch and reply flow

1. User delegates an issue to a supported local provider from Vector
2. Vector creates an `issueLiveActivities` row plus an `agentCommands` launch command
3. Bridge polls `getPendingCommands`, claims the command, and starts the provider session locally
4. Provider events are normalized as assistant/reasoning/tool/status/error/auth/compaction transcript rows
5. Bridge writes those rows through `postAgentMessage`
6. Vector UI updates in real time via Convex reactivity

### Sending a follow-up message from Vector to the agent

1. User types in the live activity composer on the issue page
2. `appendLiveMessage` mutation saves the message and creates an `agentCommands` entry
3. Bridge polls `getPendingCommands`, picks up the command
4. If the activity has a managed provider session, bridge resumes it by session key and streams normalized events back to Convex
5. If the activity is tmux-backed, bridge sends the text to the pane and refreshes the terminal snapshot
6. Bridge marks the command as `delivered`
7. Vector UI updates in real time via Convex reactivity

### Queue, approvals, and settings

The web UI reads `getAgentSessionSnapshot` for a Cells-style session view. User messages can be sent immediately or queued as:

- `after-turn`
- `after-tool`
- `stop`

The queue is stored on `workSessions.queuedMessages` so the bridge can drain it even if the browser tab closes. Settings changes create `settings_update` commands. Approval, plan approval, and question responses create dedicated command kinds so provider runtimes can unblock local SDK promises when the provider supports that flow.

### Process discovery

1. Bridge discovers local provider and tmux sessions every 60s
2. For each found process, it resolves the working directory via `lsof`
3. It reports each process to Convex via `reportProcess`
4. Users can see discovered processes in the "Attach" popover on any issue

### Staleness

A Convex cron runs every minute (`markStaleDevices`):

- Devices with no heartbeat for 2 min → `stale`
- Devices with no heartbeat for 5 min → `offline`
- Offline devices cascade: processes → `disconnected`, live activities → `disconnected`, pending commands → `expired`

## Configuration

All bridge state lives in `~/.vector/`:

| File                   | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `bridge.json`          | Device registration (ID, secret, convex URL) |
| `bridge.pid`           | Running bridge PID                           |
| `bridge.log`           | Bridge stdout (when running as LaunchAgent)  |
| `bridge.err.log`       | Bridge stderr                                |
| `live-activities.json` | Cached active sessions (for menu bar)        |
| `cli-default.json`     | CLI auth session                             |

## Security

- The bridge authenticates via a `deviceSecret` (UUID generated on first setup)
- Only the device owner can see their device's processes and send commands
- Only configured workspaces are valid delegation targets
- The staleness cron prevents stale devices from accumulating phantom state
- The menu bar app reads local files only — no network access

## Provider requirements

- Codex: `codex` CLI available and logged in.
- Claude: `@anthropic-ai/claude-agent-sdk` dependency available and Claude credentials configured.
- Cursor: `cursor-agent` CLI available for managed CLI fallback.
- GitHub Copilot: `copilot` CLI or SDK credentials available.
- OpenCode: `opencode` CLI available and authenticated.
- Pi: `pi` CLI available. The package is currently deprecated upstream, so Vector marks runtime failures as provider errors instead of faking availability.

## Future Work

- Linux support via `systemd --user`
- SDK-specific streaming parity for Cursor, Copilot, OpenCode, and Pi beyond the CLI fallback path
- Per-device sharing/collaboration controls
