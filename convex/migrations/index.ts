import { ConvexError } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { PERMISSION_VALUES, type Permission } from '../_shared/permissions';
import {
  createDefaultProjectRoles,
  createDefaultTeamRoles,
  syncOrganizationRoleAssignment,
  syncProjectRoleAssignment,
  syncTeamRoleAssignment,
} from '../roles';

const knownPermissions = new Set<Permission>(PERMISSION_VALUES);

function assertKnownPermission(
  permission: string,
): asserts permission is Permission {
  if (!knownPermissions.has(permission as Permission)) {
    throw new ConvexError(`UNKNOWN_PERMISSION:${permission}`);
  }
}

export const migrateUnifiedRoles = internalMutation({
  args: {},
  handler: async ctx => {
    const organizations = await ctx.db.query('organizations').collect();
    for (const organization of organizations) {
      const members = await ctx.db
        .query('members')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .collect();

      for (const member of members) {
        await syncOrganizationRoleAssignment(
          ctx,
          organization._id,
          member.userId,
          member.role,
        );
      }
    }

    const teams = await ctx.db.query('teams').collect();
    for (const team of teams) {
      await createDefaultTeamRoles(ctx, team._id);

      const teamMembers = await ctx.db
        .query('teamMembers')
        .withIndex('by_team', q => q.eq('teamId', team._id))
        .collect();

      for (const member of teamMembers) {
        await syncTeamRoleAssignment(ctx, team._id, member.userId, member.role);
      }

      const legacyCustomRoles = await ctx.db
        .query('teamRoles')
        .withIndex('by_team', q => q.eq('teamId', team._id))
        .collect();

      for (const legacyRole of legacyCustomRoles.filter(role => !role.system)) {
        const key = `legacy:team:${legacyRole._id}`;
        const existingRole = await ctx.db
          .query('roles')
          .withIndex('by_org_key', q =>
            q.eq('organizationId', team.organizationId).eq('key', key),
          )
          .first();

        const roleId =
          existingRole?._id ??
          (await ctx.db.insert('roles', {
            organizationId: team.organizationId,
            scopeType: 'team',
            teamId: team._id,
            key,
            name: legacyRole.name,
            description: legacyRole.description,
            system: false,
          }));

        const existingPermissions = await ctx.db
          .query('rolePermissions')
          .withIndex('by_role', q => q.eq('roleId', roleId))
          .collect();

        if (existingPermissions.length === 0) {
          const legacyPermissions = await ctx.db
            .query('teamRolePermissions')
            .withIndex('by_role', q => q.eq('roleId', legacyRole._id))
            .collect();

          for (const permission of legacyPermissions) {
            assertKnownPermission(permission.permission);
            await ctx.db.insert('rolePermissions', {
              roleId,
              permission: permission.permission,
            });
          }
        }

        const assignments = await ctx.db
          .query('teamRoleAssignments')
          .withIndex('by_role', q => q.eq('roleId', legacyRole._id))
          .collect();

        for (const assignment of assignments) {
          const existingAssignment = await ctx.db
            .query('roleAssignments')
            .withIndex('by_role_user', q =>
              q.eq('roleId', roleId).eq('userId', assignment.userId),
            )
            .first();

          if (!existingAssignment) {
            await ctx.db.insert('roleAssignments', {
              roleId,
              userId: assignment.userId,
              organizationId: team.organizationId,
              teamId: team._id,
              assignedAt: assignment.assignedAt,
            });
          }
        }
      }
    }

    const projects = await ctx.db.query('projects').collect();
    for (const project of projects) {
      await createDefaultProjectRoles(ctx, project._id);

      const projectMembers = await ctx.db
        .query('projectMembers')
        .withIndex('by_project', q => q.eq('projectId', project._id))
        .collect();

      for (const member of projectMembers) {
        const role = member.role === 'lead' ? 'lead' : 'member';
        await syncProjectRoleAssignment(ctx, project._id, member.userId, role);
      }

      const legacyCustomRoles = await ctx.db
        .query('projectRoles')
        .withIndex('by_project', q => q.eq('projectId', project._id))
        .collect();

      for (const legacyRole of legacyCustomRoles.filter(role => !role.system)) {
        const key = `legacy:project:${legacyRole._id}`;
        const existingRole = await ctx.db
          .query('roles')
          .withIndex('by_org_key', q =>
            q.eq('organizationId', project.organizationId).eq('key', key),
          )
          .first();

        const roleId =
          existingRole?._id ??
          (await ctx.db.insert('roles', {
            organizationId: project.organizationId,
            scopeType: 'project',
            projectId: project._id,
            key,
            name: legacyRole.name,
            description: legacyRole.description,
            system: false,
          }));

        const existingPermissions = await ctx.db
          .query('rolePermissions')
          .withIndex('by_role', q => q.eq('roleId', roleId))
          .collect();

        if (existingPermissions.length === 0) {
          const legacyPermissions = await ctx.db
            .query('projectRolePermissions')
            .withIndex('by_role', q => q.eq('roleId', legacyRole._id))
            .collect();

          for (const permission of legacyPermissions) {
            assertKnownPermission(permission.permission);
            await ctx.db.insert('rolePermissions', {
              roleId,
              permission: permission.permission,
            });
          }
        }

        const assignments = await ctx.db
          .query('projectRoleAssignments')
          .withIndex('by_role', q => q.eq('roleId', legacyRole._id))
          .collect();

        for (const assignment of assignments) {
          const existingAssignment = await ctx.db
            .query('roleAssignments')
            .withIndex('by_role_user', q =>
              q.eq('roleId', roleId).eq('userId', assignment.userId),
            )
            .first();

          if (!existingAssignment) {
            await ctx.db.insert('roleAssignments', {
              roleId,
              userId: assignment.userId,
              organizationId: project.organizationId,
              projectId: project._id,
              assignedAt: assignment.assignedAt,
            });
          }
        }
      }
    }

    const orgs = await ctx.db.query('organizations').collect();
    for (const org of orgs) {
      const legacyCustomRoles = await ctx.db
        .query('orgRoles')
        .withIndex('by_organization', q => q.eq('organizationId', org._id))
        .collect();

      for (const legacyRole of legacyCustomRoles.filter(role => !role.system)) {
        const key = `legacy:org:${legacyRole._id}`;
        const existingRole = await ctx.db
          .query('roles')
          .withIndex('by_org_key', q =>
            q.eq('organizationId', org._id).eq('key', key),
          )
          .first();

        const roleId =
          existingRole?._id ??
          (await ctx.db.insert('roles', {
            organizationId: org._id,
            scopeType: 'organization',
            key,
            name: legacyRole.name,
            description: legacyRole.description,
            system: false,
          }));

        const existingPermissions = await ctx.db
          .query('rolePermissions')
          .withIndex('by_role', q => q.eq('roleId', roleId))
          .collect();

        if (existingPermissions.length === 0) {
          const legacyPermissions = await ctx.db
            .query('orgRolePermissions')
            .withIndex('by_role', q => q.eq('roleId', legacyRole._id))
            .collect();

          for (const permission of legacyPermissions) {
            assertKnownPermission(permission.permission);
            await ctx.db.insert('rolePermissions', {
              roleId,
              permission: permission.permission,
            });
          }
        }

        const assignments = await ctx.db
          .query('orgRoleAssignments')
          .withIndex('by_role', q => q.eq('roleId', legacyRole._id))
          .collect();

        for (const assignment of assignments) {
          const existingAssignment = await ctx.db
            .query('roleAssignments')
            .withIndex('by_role_user', q =>
              q.eq('roleId', roleId).eq('userId', assignment.userId),
            )
            .first();

          if (!existingAssignment) {
            await ctx.db.insert('roleAssignments', {
              roleId,
              userId: assignment.userId,
              organizationId: org._id,
              assignedAt: assignment.assignedAt,
            });
          }
        }
      }
    }

    return {
      success: true,
      message: 'Unified roles and assignments migrated successfully',
    };
  },
});

export const migrateDefaultRoles = migrateUnifiedRoles;
export const migrateTeamMembers = migrateUnifiedRoles;
export const migrateProjectMembers = migrateUnifiedRoles;
