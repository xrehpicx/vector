# Key Features

## Authentication and Access

- Better Auth integration backed by Convex user data
- Username, email/password, and email OTP support in the current auth setup
- First-admin bootstrap flow through `/setup-admin`
- Organization, team, and project-scoped permission handling
- Custom roles plus built-in owner/admin/member roles

## Project Management

- Teams, projects, and issues in the same application
- Dense detail views with inline property editing
- Kanban and table views for issue management
- Issue priorities, assignment states, assignees, teams, and projects
- Project and team detail pages with scoped activity and membership management

## Documents and Activity

- Rich document editor with markdown, mentions, slash commands, and collaboration-oriented UI
- Activity feeds for issues, teams, projects, and documents
- Organization settings for workflow states, priorities, members, and roles

## Collaboration

- Public, private, announcement, direct, and group-direct channels
- Message threads, reactions, pins, saved messages, read state, and typing
- Text, image, video, audio, and file messages with permission-aware access
- Permission-aware search across channel message text and attached file names
- Message links to Requests, Work, Tasks, Projects, and Documents
- Attention-safe notification defaults centered on mentions, replies, direct
  messages, and followed work

## Registered Agents

- User-owned agent identities with visible ownership
- Codex and Claude runtimes connected through a local ACP bridge
- Device, approved workspace, and default working-folder selection
- Per-channel mention, every-message, or off wake policies
- Owner-only, selected-user, or channel-member interaction access
- Live run inspector for status, plans, tools, terminal activity, files,
  permissions, and errors

## Notifications

- In-app notification inbox and preferences
- Optional SMTP-based email notifications
- Optional browser push notifications via VAPID keys

## Onboarding and Membership

- Local bootstrap flow for the first administrator
- Organization setup flow for new deployments
- Member invitation flows through the organization UI

## Notes

- Migration-phase ideas and legacy implementation notes live under `docs/migration/` and `archive/`.
- Those files are historical reference material and should not be treated as the current product contract.
