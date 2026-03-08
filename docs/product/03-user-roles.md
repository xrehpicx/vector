# User Roles

Vector uses an organization role model plus scoped team and project system roles.

## Organization Roles

These are the built-in organization-wide roles:

| Role     | Scope        | Summary                                                                                 |
| -------- | ------------ | --------------------------------------------------------------------------------------- |
| `owner`  | Organization | Full access via wildcard permission                                                     |
| `admin`  | Organization | Broad administrative access across org settings, teams, projects, issues, and documents |
| `member` | Organization | Baseline access to view org resources and create/edit issues and documents              |

## Scoped Team and Project Roles

In addition to organization roles, Vector manages scoped system roles for membership in a specific team or project:

| Role             | Scope   | Summary                                            |
| ---------------- | ------- | -------------------------------------------------- |
| `team:lead`      | Team    | Broad team and issue access within that team       |
| `team:member`    | Team    | Basic team-scoped access                           |
| `project:lead`   | Project | Broad project and issue access within that project |
| `project:member` | Project | Basic project-scoped access                        |

## Custom Roles

Organizations can also define custom roles and assign them at organization, team, or project scope.

## How Access Is Resolved

At runtime, access is derived from:

1. Built-in organization role
2. Custom role assignments
3. Team-scoped system roles
4. Project-scoped system roles
5. Resource-specific access rules in backend checks

For implementation details, see [Authentication and Permissions](../architecture/03-authentication-and-permissions.md).
