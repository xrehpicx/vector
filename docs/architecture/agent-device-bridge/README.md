# Agent Device Bridge

The agent device bridge connects local developer machines to Vector. It lets local Codex and Claude Code processes show up as **live activities** on issues, enables bidirectional messaging between Vector and local agents, and supports delegating issue work to a specific device.

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
                                │  • Process discovery      │
                                │  • Command polling        │
                                │  • Message forwarding     │
                                └────────────┬────────────┘
                                             │
                                    ps/lsof discovery
                                             │
                                ┌────────────▼────────────┐
                                │  Local Agent Processes    │
                                │  (Claude Code, Codex)     │
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
| `issueLiveMessages`   | Transcript messages (agent ↔ user)             |
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

### 3. CLI Bridge (`src/cli/bridge-service.ts`)

The bridge runs as a local Node.js process. It uses `ConvexHttpClient` to communicate directly with the Convex backend.

**What it does every cycle:**

| Loop                | Interval | Action                                                   |
| ------------------- | -------- | -------------------------------------------------------- |
| Heartbeat           | 30s      | Marks device as online                                   |
| Command poll        | 5s       | Checks for pending messages/commands from Vector         |
| Process discovery   | 60s      | Finds local Claude Code and Codex processes via `ps`     |
| Live activity cache | 30s      | Writes `~/.vector/live-activities.json` for the menu bar |

### 4. macOS Menu Bar (`cli/macos/VectorMenuBar.swift`)

A lightweight native Swift app that shows the Vector icon in the macOS status bar.

- Reads bridge status from `~/.vector/bridge.pid`
- Reads active sessions from `~/.vector/live-activities.json`
- Shows issue list with click-to-open (opens issue in Vector web app)
- Start/Stop/Restart bridge controls
- Refreshes every 10 seconds

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
cd cli/macos
swiftc -o VectorMenuBar VectorMenuBar.swift -framework AppKit

# Run it
./VectorMenuBar
```

The menu bar app is also auto-installed as a LaunchAgent when you run `vcli service install`.

## Data Flow

### Sending a message from Vector to the agent

1. User types in the live activity composer on the issue page
2. `appendLiveMessage` mutation saves the message and creates an `agentCommands` entry
3. Bridge polls `getPendingCommands`, picks up the command
4. Bridge posts a reply via `postAgentMessage`
5. Bridge marks the command as `delivered`
6. Vector UI updates in real-time via Convex reactivity

### Process discovery

1. Bridge runs `ps aux | grep claude` and `ps aux | grep codex` every 60s
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

## Future Work

- Real agent integration via Claude Agent SDK and Codex app-server (currently uses simulated replies)
- `tmux`-backed delegated launches
- Linux support via `systemd --user`
- Per-device sharing/collaboration controls
