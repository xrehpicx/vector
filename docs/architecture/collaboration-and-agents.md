# Collaboration and Registered Agents

Vector's default workspace surface is a permissioned conversation system.
Channels coordinate people and agents; Requests, Work, Tasks, Projects, and
Documents remain the durable delivery graph that conversations can link to or
create.

## Product Shape

The collaboration experience combines:

- work-oriented channels, message-rooted threads, search, and follow-up queues
- visible presence, role-gated spaces, and rich inline media
- an attention model centered on direct messages, mentions, replies, followed
  threads, and explicit watches rather than every message

The primary desktop layout is:

```text
workspace navigation | channel or direct timeline | contextual inspector
```

The contextual inspector shows a thread, channel details, pins/files, or a live
agent run. On small screens those contexts become sheets rather than permanent
columns.

## Authorization Layers

Collaboration requires both workspace permission and resource access:

1. Organization permissions determine whether a user may view, post, moderate,
   create channels, or work with registered agents.
2. Channel membership gates private and direct spaces.
3. Agent channel membership determines where an agent is visible.
4. Agent interaction policy limits who may trigger it.
5. Agent control permission is separate from interaction.

Messages store structured user and agent IDs for mentions. Agent triggers never
depend on parsing display text.

## Registered Agent Model

Registered agents are user-owned service principals rather than authentication
users. This keeps Better Auth identities, organization membership, human
presence, ownership, and notifications accurate while allowing the UI to render
people and agents through one actor model.

An agent registration binds:

- one human owner
- one local device
- one owner-approved device workspace
- one absolute default working folder inside that workspace
- one provider and optional model
- one local permission mode
- one interaction policy

Connectivity is derived from the selected device heartbeat and workspace.
Credentials never leave the local device.

Browser attachment downloads are proxied through an authenticated app route,
which re-checks channel access on every request. Local agent runs receive an
opaque Convex Storage bearer URL only inside their device-authenticated command
payload. The ACP prompt treats that URL as sensitive and instructs the agent
not to repeat it in shared replies.

## Trigger and Execution Flow

```text
human message
  → persist message and structured mentions
  → evaluate channel membership, wake mode, and interaction access
  → create one idempotent run per message and agent
  → enqueue a command for the owner's local device
  → local bridge opens or resumes an ACP session
  → stream sanitized activity into the run inspector
  → post the final response as the registered agent
```

Only human-authored messages trigger agents by default, which prevents feedback
loops. Each conversation scope has at most one active prompt for an agent;
different channels or threads may run in parallel.

## ACP Boundary

The hosted Convex bridge remains the authenticated delivery and recovery layer.
ACP runs locally over newline-delimited JSON-RPC on stdio:

- `initialize`
- `session/new` or supported `session/load`
- `session/prompt`
- streamed `session/update`
- `session/request_permission`
- `session/cancel`

Codex and Claude use project-pinned ACP adapters. The bridge validates that the
requested working directory resolves inside the registered workspace before it
starts a session. Local permissions default to asking; channel access never
implies shell or filesystem approval.

Development bridge testing must use an absolute isolated `VECTOR_HOME`, a
separate profile, and the foreground process. The development CLI must not
install, start, stop, or overwrite the global `com.vector.bridge` service used
by an installed Vector CLI.
