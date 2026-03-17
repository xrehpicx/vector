# Core Workspace Entities

Vector’s main workspace model is built around five core entities: issues, teams, projects, documents, and views. These are the objects people work with every day, and they are designed to connect to each other rather than live in separate tools.

## Issues

Issues are the core unit of execution in Vector. They represent work that needs to be tracked, discussed, prioritized, assigned, and moved through a workflow.

Basic functionality:

- status and priority management
- assignees and per-assignee workflow state
- table, kanban, and timeline/list-style issue views
- comments, activity, and linked development work
- relationships to teams, projects, parent issues, and saved views

Use issues when the workspace needs a concrete piece of work with ownership, progress, and history.

## Teams

Teams represent a stable group of people inside an organization. They are used to group work, ownership, and collaboration around a function or operating area.

Basic functionality:

- team membership and role-aware access
- team detail pages with related issues, projects, and documents
- team-based filtering and navigation across the workspace
- public/team profile surfaces when explicitly exposed

Use teams when work should be organized around the people responsible for it.

## Projects

Projects represent a larger delivery stream, initiative, or milestone that groups multiple issues together under shared ownership and status.

Basic functionality:

- project status tracking
- project lead and team association
- project detail pages with related issues, members, and documents
- project-based filtering across issue and view surfaces
- optional public/project profile surfaces when explicitly exposed

Use projects when multiple issues contribute to the same outcome and need shared context.

## Documents

Documents hold longer-form collaborative context that does not fit well into issue comments or project metadata. They are the knowledge layer of the workspace.

Basic functionality:

- rich text editing with TipTap
- folders, nested navigation, and document organization
- mentions, linked entities, and related document references
- comments and collaborative activity
- optional public document exposure when explicitly shared

Use documents for specs, notes, decisions, meeting context, runbooks, and other durable written knowledge.

## Views

Views are saved, reusable ways of looking at issues. They package filters, layout preferences, grouping, and visibility rules into a named workspace surface.

Basic functionality:

- saved issue filters across teams, projects, states, priorities, and exclusions
- table, kanban, and timeline layouts
- private, organization, or public visibility
- shared/public landing surfaces for an organization
- reusable links into the same issue data from different perspectives

Use views when people need a stable operational lens on the issue set without duplicating data.

## How The Entities Work Together

- Issues are the execution layer.
- Teams define who owns broad areas of work.
- Projects group related issues around an initiative or delivery target.
- Documents capture longer-form context for teams, projects, or issues.
- Views provide reusable ways to browse and share the issue graph.

In practice, most workflows move across multiple entities. A team may own a project, the project may contain many issues, the issues may be discussed in documents, and a view may be used to monitor just the slice of work that matters to a given audience.
