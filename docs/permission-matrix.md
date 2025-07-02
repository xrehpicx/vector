# Permission Matrix

This document outlines the permissions system used throughout the application. It shows which built-in roles have which permissions by default, and explains how custom roles can be created.

## Permission Constants

All permissions are defined in `src/auth/permission-constants.ts`:

| Permission          | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `org:view`          | View organization details and access the organization |
| `org:manage`        | Update organization settings, logo, etc.              |
| `org:invite`        | Invite new members to the organization                |
| `role:create`       | Create custom roles                                   |
| `role:update`       | Modify existing custom roles                          |
| `role:delete`       | Delete custom roles                                   |
| `role:assign`       | Assign/remove custom roles to/from users              |
| `project:view`      | View project details and access projects              |
| `project:create`    | Create new projects                                   |
| `project:update`    | Update project details, add/remove members            |
| `project:delete`    | Delete projects                                       |
| `team:view`         | View team details and access teams                    |
| `team:create`       | Create new teams                                      |
| `team:update`       | Update team details, add/remove members               |
| `team:delete`       | Delete teams                                          |
| `issue:view`        | View issue details and access issues                  |
| `issue:create`      | Create new issues                                     |
| `issue:update`      | Update issue details, change state/priority           |
| `issue:delete`      | Delete issues                                         |
| `assignment:manage` | Assign/unassign users to/from issues                  |

## Built-in Roles

### Owner (`owner`)

- **Permissions**: `*` (wildcard - all permissions)
- **Description**: Creator of the organization with full control
- **Cannot be**: Assigned to other users, removed from organization

### Admin (`admin`)

- **Permissions**: All permissions except owner-level restrictions
- **Description**: Full management access within the organization
- **Can**: Manage all aspects of the organization except deleting it

### Member (`member`)

- **Permissions**:
  - `org:view` - Can access the organization
  - `project:view` - Can view projects they have access to
  - `team:view` - Can view teams they belong to
  - `issue:view` - Can view issues they have access to
  - `issue:create` - Can create new issues
  - `issue:update` - Can update issues they created or are assigned to
- **Description**: Standard user with read access and limited write permissions

## Permission Matrix

| Permission          | Owner | Admin | Member | Notes                                     |
| ------------------- | ----- | ----- | ------ | ----------------------------------------- |
| `org:view`          | ✅    | ✅    | ✅     | Required for organization access          |
| `org:manage`        | ✅    | ✅    | ❌     | Organization settings                     |
| `org:invite`        | ✅    | ✅    | ❌     | Invite new members                        |
| `role:create`       | ✅    | ✅    | ❌     | Create custom roles                       |
| `role:update`       | ✅    | ✅    | ❌     | Modify custom roles                       |
| `role:delete`       | ✅    | ✅    | ❌     | Delete custom roles                       |
| `role:assign`       | ✅    | ✅    | ❌     | Assign roles to users                     |
| `project:view`      | ✅    | ✅    | ✅     | View accessible projects                  |
| `project:create`    | ✅    | ✅    | ❌     | Create new projects                       |
| `project:update`    | ✅    | ✅    | ❌     | Update project details                    |
| `project:delete`    | ✅    | ✅    | ❌     | Delete projects                           |
| `team:view`         | ✅    | ✅    | ✅     | View accessible teams                     |
| `team:create`       | ✅    | ✅    | ❌     | Create new teams                          |
| `team:update`       | ✅    | ✅    | ❌     | Update team details                       |
| `team:delete`       | ✅    | ✅    | ❌     | Delete teams                              |
| `issue:view`        | ✅    | ✅    | ✅     | View accessible issues                    |
| `issue:create`      | ✅    | ✅    | ✅     | Create new issues                         |
| `issue:update`      | ✅    | ✅    | ✅\*   | Update issues (\*limited to own/assigned) |
| `issue:delete`      | ✅    | ✅    | ❌     | Delete issues                             |
| `assignment:manage` | ✅    | ✅    | ❌     | Manage issue assignments                  |

## Lead-based Permissions

In addition to role-based permissions, the system recognizes "lead" status:

- **Project Leads**: Can perform most project operations on projects they lead
- **Team Leads**: Can perform most team operations on teams they lead
- **Issue Authors**: Can update issues they created
- **Issue Assignees**: Can update issues they're assigned to

These are handled automatically by the permission policy engine.

## Custom Roles

Organizations can create custom roles with any combination of the above permissions. Custom roles are:

- **Organization-scoped**: Only apply within the organization that created them
- **Additive**: Grant additional permissions beyond the user's built-in role
- **Manageable**: Can be created, updated, and deleted by users with appropriate permissions

## Implementation Notes

### Permission Policy Engine

The centralized policy engine (`src/auth/policy-engine.ts`) handles all permission checks with fallback logic:

1. **Platform Admin**: Always allowed (for system maintenance)
2. **Lead Status**: Project/team leads get automatic permissions for their resources
3. **Owner Wildcard**: Organization owners get all permissions
4. **Built-in Role**: Check static permission sets
5. **Custom Roles**: Check assigned custom role permissions

### Performance Optimizations

- **Request-level caching**: Permissions are cached per request to avoid duplicate queries
- **Batch API**: `hasPermissions()` checks multiple permissions in one query
- **Early returns**: Platform admin and lead checks short-circuit expensive database queries

### Security Considerations

- **Membership required**: Users must be organization members before custom roles can be assigned
- **Role validation**: All role operations verify the role belongs to the correct organization
- **Type safety**: Strong TypeScript typing prevents typo-based permission bypasses

## Usage Examples

### Frontend Permission Checks

```typescript
// Single permission
const { hasPermission } = usePermission(orgSlug, PERMISSIONS.PROJECT_CREATE);

// Multiple permissions (preferred for performance)
const { permissions } = usePermissions(orgSlug, [
  PERMISSIONS.PROJECT_CREATE,
  PERMISSIONS.TEAM_CREATE,
]);

// Conditional rendering
<PermissionGate orgSlug={orgSlug} permission={PERMISSIONS.PROJECT_CREATE}>
  <CreateProjectButton />
</PermissionGate>
```

### Backend Permission Checks

```typescript
// Using policy engine (recommended)
await PermissionPolicy.require(ctx, PERMISSIONS.PROJECT_UPDATE, {
  type: "project",
  id: projectId,
});

// Direct permission check
await requirePermission(userId, orgId, PERMISSIONS.PROJECT_CREATE);
```

## Migration Guide

When adding new permissions:

1. Add the permission to `PERMISSION_LIST` in `permission-constants.ts`
2. Update `DEFAULT_ADMIN_PERMISSIONS` if admins should have it by default
3. Add the permission to relevant custom roles via migration script
4. Update this documentation

## Troubleshooting

### Common Issues

1. **Permission denied for org owner**: Check if the permission constant is correctly defined
2. **Custom role not working**: Verify the user is a member of the organization first
3. **Lead permissions not working**: Ensure the resource type is correctly specified in policy engine calls

### Debugging

Enable permission debugging by checking the database:

```sql
-- Check user's built-in role
SELECT role FROM member WHERE user_id = ? AND organization_id = ?;

-- Check user's custom roles
SELECT r.name, p.permission
FROM org_role_assignment a
JOIN org_role r ON r.id = a.role_id
JOIN org_role_permission p ON p.role_id = r.id
WHERE a.user_id = ? AND a.organization_id = ?;
```
