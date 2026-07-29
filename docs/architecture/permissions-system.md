# Vector Permission System

This document describes the current permission system in Vector: the data model, the backend authorization helpers, the frontend hooks/components, and the expected implementation patterns for new features.

## Goals

- One permission vocabulary shared by backend and frontend.
- One primary scoped role model for organization, team, and project access.
- Safe defaults: no organization membership means no permissions.
- Small API surface for common cases:
  - backend hard enforcement with `require*`
  - backend boolean checks with `can*` helpers
  - frontend reactive checks with `useScopedPermission`

## Current Model

The system is centered around:

- `PERMISSIONS` in [permissions.ts](/Users/raj/projects/vector/convex/_shared/permissions.ts)
- the resolver in [authz.ts](/Users/raj/projects/vector/convex/authz.ts)
- entity-aware access helpers in [access.ts](/Users/raj/projects/vector/convex/access.ts)
- public permission queries in [utils.ts](/Users/raj/projects/vector/convex/permissions/utils.ts)
- frontend hooks in [use-permissions.tsx](/Users/raj/projects/vector/src/hooks/use-permissions.tsx)
- frontend wrappers in [permission-aware.tsx](/Users/raj/projects/vector/src/components/ui/permission-aware.tsx)

### Core Concepts

- `members` is the organization membership edge and built-in org role source (`owner`, `admin`, `member`).
- `teamMembers` and `projectMembers` are scoped membership edges and also supply built-in lead/member permission bundles.
- `roles`, `rolePermissions`, and `roleAssignments` are the unified scoped custom-role tables.
- Legacy tables still exist during cutover:
  - `orgRoles`, `orgRolePermissions`, `orgRoleAssignments`
  - `teamRoles`, `teamRolePermissions`, `teamRoleAssignments`
  - `projectRoles`, `projectRolePermissions`, `projectRoleAssignments`

## Permission Vocabulary

The canonical permission list lives in [permissions.ts](/Users/raj/projects/vector/convex/_shared/permissions.ts).

Examples:

```ts
PERMISSIONS.ORG_MANAGE_MEMBERS;
PERMISSIONS.PROJECT_EDIT;
PERMISSIONS.TEAM_MEMBER_ADD;
PERMISSIONS.ISSUE_ASSIGNMENT_UPDATE;
PERMISSIONS.CHANNEL_MESSAGE_SEND;
PERMISSIONS.AGENT_INTERACT;
```

Wildcard behavior:

- `*` grants everything.
- `team:*` matches all `team:` permissions.
- `project:*` matches all `project:` permissions.
- `issue:*` matches all `issue:` permissions.
- `channel:*` matches all `channel:` permissions.
- `agent:*` matches all registered-agent permissions.

Only `owner` gets the universal wildcard by default.

## Default Roles

Built-in org roles:

- `owner`: `*`
- `admin`: broad explicit permission bundle, not a wildcard
- `member`: basic org/project/team visibility plus limited issue rights

Built-in scoped roles:

- team:
  - `lead`: `team:*` + `issue:*`
  - `member`: team visibility + limited issue rights
- project:
  - `lead`: `project:*` + `issue:*`
  - `member`: project visibility + limited issue rights

These bundles are defined in [permissions.ts](/Users/raj/projects/vector/convex/_shared/permissions.ts).

## Data Model

The main schema lives in [schema.ts](/Users/raj/projects/vector/convex/schema.ts).

### Unified Tables

`roles`

- `organizationId`
- `scopeType`: `organization | team | project`
- optional `teamId`
- optional `projectId`
- `key`
- `name`
- `description`
- `system`
- optional `systemKey`

`rolePermissions`

- `roleId`
- `permission`

`roleAssignments`

- `roleId`
- `userId`
- `organizationId`
- optional `teamId`
- optional `projectId`
- `assignedAt`

### Membership Tables

These still matter for authorization:

- `members`
- `teamMembers`
- `projectMembers`
- `channelMembers`

Organization, team, and project membership rows supply role permissions.
`channelMembers` is an additional resource visibility edge: a private or direct
channel is inaccessible without that membership even when the caller has the
workspace-wide `channel:view` permission.

Registered agents are service identities, not Better Auth users or organization
members. Their channel access is stored in `agentChannelMemberships`. A human's
ability to invoke an agent is the intersection of:

- organization and channel membership
- `agent:interact`
- the agent's owner/selected-user/channel-member interaction policy
- the agent's channel membership and wake policy

`agent:control` is intentionally separate from interaction. Adding an agent to
a channel never grants terminal or session control.

## How Permissions Are Resolved

The resolver is [authz.ts](/Users/raj/projects/vector/convex/authz.ts).

At a high level:

1. Find org membership in `members`.
2. If no org membership, return no permissions.
3. If org role is `owner`, return `*`.
4. Add built-in org permissions from `members.role`.
5. If a `teamId` scope exists, add built-in team permissions from `teamMembers.role`.
6. If a `projectId` scope exists, add built-in project permissions from `projectMembers.role`.
7. Add unified scoped custom-role permissions from `roleAssignments` + `rolePermissions`.
8. Add legacy custom-role permissions from old role tables during migration cutover.

Scope matching rules:

- org-scoped assignments apply anywhere inside the org
- team-scoped assignments only apply when `scope.teamId` matches
- project-scoped assignments only apply when `scope.projectId` matches

## Backend APIs

### Low-Level Auth Helpers

Use [authz.ts](/Users/raj/projects/vector/convex/authz.ts) when you need explicit permission enforcement.

Main helpers:

- `requireAuthUser(ctx)`
- `requireOrganizationMember(ctx, organizationId, userId?)`
- `getOrganizationBySlug(ctx, orgSlug)`
- `getEffectivePermissions(ctx, scope, userId)`
- `hasScopedPermission(ctx, scope, userId, permission)`
- `getPermissionMap(ctx, scope, userId, permissions)`
- `requireScopedPermission(ctx, scope, permission)`
- `requireOrgPermission(ctx, organizationId, permission)`

### Public Convex Permission Queries

Use [utils.ts](/Users/raj/projects/vector/convex/permissions/utils.ts) when the client needs a reactive yes/no answer.

Exports:

- `has`
- `hasMultiple`

These are what the frontend hooks call.

### Entity-Aware Access Helpers

Use [access.ts](/Users/raj/projects/vector/convex/access.ts) when the rule is tied to a resource type and visibility semantics matter.

Examples:

- `canViewIssue`
- `canEditIssue`
- `canUpdateAssignmentState`
- `canViewTeam`
- `canEditTeam`
- `canManageTeamMembers`
- `canViewProject`
- `canEditProject`
- `canManageProjectMembers`

These helpers combine permissions with resource-specific rules like:

- public visibility
- organization visibility
- private visibility
- creator self-access
- assignee self-access

## Backend Usage Patterns

### 1. Org-scoped mutation

Use this when the action is on the organization itself or an org-owned config row.

```ts
const org = await getOrganizationBySlug(ctx, args.orgSlug);
await requireOrgPermission(ctx, org._id, PERMISSIONS.ORG_MANAGE_MEMBERS);
```

Example: invites, members, priorities, states, statuses, org settings.

### 2. Team-scoped mutation

Use this when the action is scoped to a team.

```ts
const team = await ctx.db.get('teams', args.teamId);
if (!team) throw new ConvexError('TEAM_NOT_FOUND');

await requireScopedPermission(
  ctx,
  { organizationId: team.organizationId, teamId: team._id },
  PERMISSIONS.TEAM_MEMBER_ADD,
);
```

### 3. Project-scoped mutation

```ts
const project = await ctx.db.get('projects', args.projectId);
if (!project) throw new ConvexError('PROJECT_NOT_FOUND');

await requireScopedPermission(
  ctx,
  { organizationId: project.organizationId, projectId: project._id },
  PERMISSIONS.PROJECT_EDIT,
);
```

### 4. Entity-aware boolean check

Use `access.ts` when visibility or self-access matters.

```ts
if (!(await canEditProject(ctx, project))) {
  throw new ConvexError('FORBIDDEN');
}
```

### 5. Batch permission checks

Use `getPermissionMap` through `hasMultiple` or directly on the backend when you need several booleans for the same scope.

```ts
const results = await getPermissionMap(
  ctx,
  { organizationId: org._id, projectId: project._id },
  userId,
  [PERMISSIONS.PROJECT_EDIT, PERMISSIONS.PROJECT_DELETE],
);
```

### 6. Channel and registered-agent access

Collaboration functions first require the relevant workspace permission, then
apply resource membership:

```ts
await requireOrgPermission(
  ctx,
  channel.organizationId,
  PERMISSIONS.CHANNEL_VIEW,
);
await requireChannelMember(ctx, channel, userId);
```

Public workspace channels may be joined by organization members. Private,
direct, and group-direct channels always require an existing membership.
Sending, moderation, membership management, agent interaction, and agent
control each use their dedicated permissions.

## Backend Rules For New Features

When you add a new backend query or mutation:

1. Authenticate first if the function is not intentionally public.
2. Resolve the owning entity.
3. Verify the entity belongs to the expected organization.
4. Use `requireOrgPermission`, `requireScopedPermission`, or an appropriate `can*` helper.
5. If you accept foreign IDs, validate they belong to the same org/scope.
6. If you mutate scoped membership or role state, clean up or sync role assignments too.

## Sync Rules When Membership Changes

Role syncing is handled in [index.ts](/Users/raj/projects/vector/convex/roles/index.ts).

Use:

- `syncOrganizationRoleAssignment`
- `syncTeamRoleAssignment`
- `syncProjectRoleAssignment`

Call them when:

- an organization member is created or their org role changes
- a team member is added or their built-in role changes
- a project member is added or their built-in role changes
- a lead is assigned during create/update flows

When removing membership, also remove scoped assignments. Current mutations already do this for both unified and legacy assignment tables.

## Custom Role APIs

Organization custom roles are managed in [index.ts](/Users/raj/projects/vector/convex/roles/index.ts).

Important functions:

- `list`
- `create`
- `get`
- `getPermissions`
- `update`
- `assign`
- `removeAssignment`

Team and project custom roles:

- `createTeamRole`
- `createProjectRole`
- `assignUserToTeamRole`
- `assignUserToProjectRole`
- `getTeamRoles`
- `getProjectRoles`

Important constraints:

- permissions must use `permissionValidator`
- assigned role must belong to the same organization and scope
- target user must already be a member of the relevant organization/team/project

## Frontend APIs

### Hooks

The main hooks are in [use-permissions.tsx](/Users/raj/projects/vector/src/hooks/use-permissions.tsx).

Use:

- `useScopedPermission(scope, permission)`
- `useScopedPermissions(scope, permissions)`
- `usePermission(orgSlug, permission)` for org-only checks
- `usePermissionChecker` / `useScopedPermissionChecker` for repeated checks in one component

Scope shape:

```ts
{
  orgSlug: string;
  teamId?: Id<'teams'>;
  projectId?: Id<'projects'>;
}
```

### UI Wrappers

The main wrappers are in [permission-aware.tsx](/Users/raj/projects/vector/src/components/ui/permission-aware.tsx).

Use:

- `PermissionAware`
- `PermissionAwareSelector`
- `PermissionGate`
- `usePermissionCheck`

## Frontend Usage Patterns

### 1. Simple org-level check

```tsx
const { hasPermission, isLoading } = useScopedPermission(
  { orgSlug },
  PERMISSIONS.ORG_MANAGE_ROLES,
);
```

### 2. Scoped project check

```tsx
const { hasPermission: canEditProject } = useScopedPermission(
  { orgSlug, projectId },
  PERMISSIONS.PROJECT_EDIT,
);
```

### 3. Hide or show UI

```tsx
<PermissionGate
  orgSlug={orgSlug}
  permission={PERMISSIONS.ORG_MANAGE_MEMBERS}
  fallback={null}
>
  <InviteButton />
</PermissionGate>
```

### 4. Wrap an editable selector

Vector expects inline selectors to be permission-aware.

```tsx
<PermissionAwareSelector
  orgSlug={orgSlug}
  scope={{ orgSlug, projectId }}
  permission={PERMISSIONS.PROJECT_EDIT}
  fallbackMessage="You don't have permission to change this selection"
>
  <ProjectStatusSelector ... />
</PermissionAwareSelector>
```

### 5. Disable actions instead of hiding them

```tsx
const { hasPermission: canManage } = useScopedPermission(
  { orgSlug },
  PERMISSIONS.ISSUE_ASSIGN,
);

<Button disabled={!canManage}>Assign</Button>;
```

## UI Conventions In This Repo

For Vector UI work:

- prefer `useScopedPermission` over hardcoded role comparisons
- use `PermissionAwareSelector` around inline editable selectors
- prefer reactive permission queries instead of duplicating role logic in the client
- keep permission strings sourced from `PERMISSIONS`

Do not do this:

```tsx
if (user.role === 'admin') { ... }
```

Prefer:

```tsx
const { hasPermission } = useScopedPermission(
  { orgSlug },
  PERMISSIONS.ORG_MANAGE_MEMBERS,
);
```

## Legacy Compatibility

The system is in migration mode.

That means:

- unified role tables are the target model
- legacy org/team/project custom role tables still exist
- `authz.ts` still reads legacy custom-role assignments during cutover
- organization role UI currently supports both unified and legacy org custom role IDs

Implication:

- do not remove legacy reads/writes unless you are also completing the migration and cutover plan

## Migration Script

The backfill entrypoint is [run-permission-migrations.ts](/Users/raj/projects/vector/scripts/run-permission-migrations.ts).

It runs:

```bash
pnpm convex run internal.migrations.index.migrateUnifiedRoles ...
```

Requirements:

- `CONVEX_URL`
- `CONVEX_ADMIN_KEY`

The mutation itself is internal-only.

## Validation Rules

### If You Change `convex/**`

You must run:

```bash
pnpm convex typecheck
```

This is now also captured by the `convex-typecheck-guard` skill.

### If You Change UI Permission Surfaces

Also run:

```bash
pnpm build
```

This catches type drift between Convex return shapes and Next.js consumers.

## Practical Examples

### Example: protect an org mutation

```ts
export const revokeInvite = mutation({
  args: { inviteId: v.id('invitations') },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const invite = await ctx.db.get('invitations', args.inviteId);
    if (!invite) throw new ConvexError('INVITE_NOT_FOUND');

    await requireOrgPermission(
      ctx,
      invite.organizationId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    await ctx.db.patch('invitations', invite._id, { status: 'revoked' });
  },
});
```

### Example: protect a project mutation

```ts
await requireScopedPermission(
  ctx,
  { organizationId: project.organizationId, projectId: project._id },
  PERMISSIONS.PROJECT_MEMBER_ADD,
);
```

### Example: resource-aware access

```ts
if (!(await canViewProject(ctx, project))) {
  throw new ConvexError('FORBIDDEN');
}
```

### Example: gated UI

```tsx
const { hasPermission: canAssignRoles } = useScopedPermission(
  { orgSlug },
  PERMISSIONS.ORG_MANAGE_ROLES,
);

return canAssignRoles ? <AssignRoleButton /> : null;
```

## Checklist For Permission Work

- add any new permission string to `PERMISSIONS`
- use `permissionValidator` for stored custom-role permissions
- enforce scope ownership on every incoming foreign ID
- prefer `can*` helpers for visibility-aware resource checks
- prefer `require*` helpers for hard authorization boundaries
- use frontend hooks/components instead of hardcoded role checks
- run `pnpm convex typecheck` after every Convex edit batch
- run `pnpm build` when permission data shapes affect the UI
