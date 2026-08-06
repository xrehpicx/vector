# Core Workspace Entities

Vector coordinates delivery through conversations, Requests, Work, Tasks,
teams, projects, documents, views, and registered agents. These entities are
native to Vector and form one connected graph rather than separate tools.

The primary delivery path is:

```text
Request (intake and review)
  ↕ many-to-many
Work (outcome and accountable execution context)
  ├── Tasks (optional independently tracked steps)
  ├── Workpad notes and checklists
  ├── Human execution and agent Work Sessions
  ├── GitHub development evidence
  └── Ownership, handoffs, attention, and activity
```

Channels are the workspace's default shared surface. Teams and projects
organize delivery, documents hold durable knowledge, and views provide reusable
operational or public slices.

## Channels and Messages

A Channel is a durable conversation space for a team, project, topic, or direct
conversation. Public channels are discoverable across the workspace; private
channels and direct conversations are visible only to their members.

Core semantics:

- Every channel has a clear name, purpose, owner, membership, and archive state.
- Messages can contain formatted text, images, video, audio, and files.
- A message may start a lightweight thread so one topic can progress without
  interrupting the main timeline.
- Reactions, pins, saved messages, read state, and permission-safe search make
  decisions and context recoverable.
- People can delete their own messages. Channel owners/moderators, workspace
  admins, and custom roles with message-moderation permission can also remove
  other human or agent messages; the timeline retains a deleted-message marker
  without retaining its content.
- Messages can link to or create Requests, Work, Tasks, Projects, and Documents.
  A conversation does not replace those durable delivery entities.
- Notification defaults prioritize direct messages, mentions, replies, and
  followed threads. Ordinary channel traffic remains available without turning
  every message into an inbox item.
- Registered agents join channels explicitly and show their human owner. Their
  wake policy is configured per channel as mentions only, every message, or off.

Use Channels for coordination, decisions, handoffs, and shared context. Promote
an ask to a Request, an accountable outcome to Work, or durable knowledge to a
Document when it needs a stronger lifecycle.

## Registered Agents

A Registered Agent is a user-owned service identity that connects a channel to
a local Codex, Claude, or other compatible coding runtime. It appears alongside
people in conversation while retaining clear ownership and execution
provenance.

Core semantics:

- The owner chooses a connected device, an approved workspace, and a default
  working folder.
- Channel membership and wake policy determine where and when the agent can
  respond.
- An interaction policy determines whether only the owner, selected people, or
  all channel members may trigger it.
- Connectivity is derived from the selected local device and workspace rather
  than a manually claimed online status.
- Each trigger creates an auditable run. Conversation stays readable while
  plans, tools, files, terminal activity, permissions, and errors remain
  available in a run inspector.
- Provider credentials stay on the owner's device. Channel access never grants
  terminal control or expands the local folder boundary.

Use a Registered Agent when a persistent, permissioned collaborator should be
available from shared channels. Use a Work Session when execution belongs
specifically to one Work item or Task.

## Requests

A Request is an incoming ask and its review envelope. It captures what somebody wants without forcing the requester to decide how implementation should be decomposed.

Core semantics:

- Every Request has a concise title and a required expected output.
- Context and review guidance may remain free-form.
- Authorized editors can refine the description and expected output inline as
  the request becomes clearer; both fields support the same rich workpad-style
  notes and checklists used during delivery. They can also adjust the due date
  and priority from the Request detail view.
- Priority expresses intake urgency independently of lifecycle status. Request
  lists can be grouped by priority or status for triage.
- People with access can discuss a Request through threaded comments. The
  discussion timeline also records important Request changes, including edits
  to its description, expected output, and due date.
- A Request can be routed to one person, several people, or a team.
- Workspace admins can describe routing rules in plain language and optionally
  let Vector apply them to new, unrouted Requests. Automatic routing can assign
  a team or recipients, leaves uncertain matches for manual routing, and never
  overrides a routing choice made by a person.
- Routing, claiming, or accepting a Request does not start Work.
- One Request may produce several Work records.
- Several related Requests may be fulfilled by the same Work.
- AI may suggest Work, but manual search, attachment, and creation must always work.
- A Request becomes Ready for review only when all linked Work is ready or complete.
- The requester or another authorized reviewer accepts the result or requests changes.

Use Requests for intake, routing, expected outcomes, and closing the requester feedback loop.

## Work

Work is Vector's primary execution object and product noun. It represents a meaningful outcome with one accountable owner once claimed or started; planned Work may be temporarily unowned.

Core semantics:

- Work contains a live workpad for notes, decisions, and toggleable checklists.
- Tasks are optional; lightweight decomposition remains inside the workpad.
- A Work can deliver multiple Requests and a Request can link to multiple Work records.
- Work may belong to a team and project, but it remains smaller and more outcome-specific than a Project.
- Work has one current accountable owner plus any number of contributors and attached executions.
- Planned Work may be unowned. Starting unowned Work claims it.
- Starting Work is always intentional. Assignment, handoff acceptance, and agent attachment never start it.
- Work records an overall first start and a separate execution start for each ownership period.
- A pending handoff leaves the current owner accountable. Its initiator can refine the handoff message until the recipient accepts or declines, and terminal Work automatically cancels any pending handoff.
- After acceptance, the new owner must explicitly start their own execution period.
- Work states are planned, active, waiting, blocked, ready for review, completed, and canceled.
- Work focus lists use an indexed rank so blocked and review-ready outcomes surface before ordinary active Work, then larger effort and longer-stale activity surface first instead of being buried by newer small changes.
- Agent execution status is separate from aggregate Work status.
- GitHub artifacts are evidence by default. Workspace policy may keep evidence manual, notify the owner when terminal evidence needs review, or update state when the individual Work also opts into GitHub completion. Unlinking or suppressing an attachment is durable for that exact Work/Task scope until a user explicitly links the artifact there again. When the artifact has no other active attachments, it is also treated as human-triaged so later webhook updates do not recreate unmatched Work or Requests behind the user's back.

Use Work for the focused outcome context that humans and agents need to execute, hand off, and review delivery.

### Compatibility identity

During the Issue → Work migration, Work retains the existing `issues` table identity and stable keys internally. This preserves links from GitHub artifacts, comments, activities, documents, and integrations. Product UI, routes, and new APIs use Work terminology. `/issues` routes remain compatibility redirects rather than a second product model.

## Tasks

A Task is an independently trackable step inside exactly one Work record.

Core semantics:

- A Task has zero or one human assignee.
- Task states are todo, in progress, waiting, blocked, done, and canceled.
- Tasks may have their own description, due date, activity, agent attribution, and development association.
- Tasks are not nested. Smaller steps belong in the Work checklist.
- Humans can create Tasks inline from Work.
- An attached agent execution may create a Task only when the Work's agent Task policy permits it.
- Agent-created Tasks retain the authenticated execution, process, and provider provenance.
- Tasks never appear as top-level Work rows.

Use a Task when a step needs independent ownership, lifecycle, blocking, due-date, or attribution. Use a checklist item when it does not.

## Work Sessions and Human Attention

An agent Work Session is a local or managed coding session attached to Work or a Task. It belongs to an authenticated human/device context and reports its own active, waiting, paused, completed, failed, or canceled state. A Work record may have several sessions across different machines and agent providers.

Authorized users can delegate a new session to an online machine and allowed workspace, or attach an existing local session. An attached Codex or Claude session keeps the provider conversation's title and imports its recent visible history, so opening the Work Session on web or iOS continues the same conversation rather than starting with an empty Vector-only transcript. Users with control access can send messages to that session from either app. The local bridge must be running for attachment, delegated launches, history reconciliation, and message delivery.

Attaching or launching an execution does not change Work status. An agent that needs a decision raises a separate human-attention record. This keeps ordinary agent waiting from creating notification noise while making genuine human blockers actionable.

## Teams

Teams represent stable groups of people inside an organization. They provide routing, access, and ownership context around a function or operating area.

Basic functionality:

- membership and role-aware access
- team leads and scoped permissions
- Request routing to a team before an individual claims it
- team detail pages with related Work, projects, documents, and activity
- team-based filtering and navigation

Use teams when delivery should be organized around the people responsible for an area.

## Projects

Projects represent broader initiatives, delivery streams, or milestones that group multiple Work outcomes.

Basic functionality:

- project status, lead, team, dates, and visibility
- project detail pages with related Work, members, documents, and activity
- project-based filtering across Work and views
- optional public/project profile surfaces

Use Projects when several Work outcomes contribute to a longer-running initiative. A Project is broader than Work; it is not a replacement name for an Issue.

## Documents

Documents hold durable collaborative knowledge that does not belong only to one execution context.

Basic functionality:

- rich text editing with TipTap
- folders and nested navigation
- mentions and linked entity references
- comments and collaborative activity
- optional public exposure when explicitly shared
- seamless large-document editing, with oversized content loaded incrementally

Use documents for specifications, decisions, runbooks, meeting context, and knowledge that should outlive one Work record. Keep immediate execution notes in the Work workpad.

## Views

Views are saved, reusable operational lenses over workspace entities. Existing Issue-backed views continue to function over migrated Work identity during compatibility, while new primary navigation uses Requests and Work.

Basic functionality:

- saved filters across teams, projects, states, priorities, and exclusions
- table, kanban, and timeline layouts where appropriate
- private, organization, or public visibility
- public landing and roadmap surfaces

Use views when people need a stable way to monitor or share a subset of delivery without duplicating data.

## Notifications and Reminders

Notifications are event records connected to Requests, Work, Tasks, handoffs, reviews, attention, reminders, and development evidence. Recipient rows track whether an item needs action, is an update, is saved, snoozed, or done.

Reminder rules are durable schedules attached to a Request, Work, or Task. They can target the requester, Request owner, Work owner, Work creator, Task assignee, or watchers; optionally fire only after inactivity; and stop automatically when the target completes or cancels.

## How the Entities Work Together

- Channels hold the workspace's shared coordination and can link or create
  delivery entities.
- Requests define the desired result and requester review.
- Work holds accountable execution and the focused human/agent context.
- Tasks add optional independent tracking without bloating top-level views.
- Teams route and authorize responsibility.
- Projects group multiple Work outcomes into broader initiatives.
- Documents retain durable knowledge.
- Views organize and publish useful slices.
- Registered Agents provide owned, permissioned local execution in channels;
  Work Sessions provide execution attached to Work.
- Notifications, reminders, handoffs, attention, and GitHub evidence connect changes back to the people who need to act.

This connected model is Vector's product identity: a shared workspace for routing requests, supervising parallel human and agent execution, preserving accountability, and verifying outcomes.
