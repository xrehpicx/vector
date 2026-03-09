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
