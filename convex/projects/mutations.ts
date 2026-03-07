import { mutation, type MutationCtx } from '../_generated/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { getOrganizationBySlug, requireAuthUser } from '../authz';
import {
  canDeleteProject,
  canEditProject,
  canManageProjectMembers,
} from '../access';
import { PERMISSIONS, requirePermission } from '../permissions/utils';
import { syncProjectRoleAssignment } from '../roles';

async function requireProjectEditAccess(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
) {
  const project = await ctx.db.get('projects', projectId);
  if (!project) {
    throw new ConvexError('PROJECT_NOT_FOUND');
  }

  if (!(await canEditProject(ctx, project))) {
    throw new ConvexError('FORBIDDEN');
  }

  return project;
}

export const create = mutation({
  args: {
    orgSlug: v.string(),
    data: v.object({
      key: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      leadId: v.optional(v.id('users')),
      teamId: v.optional(v.id('teams')),
      statusId: v.optional(v.id('projectStatuses')),
      visibility: v.optional(
        v.union(
          v.literal('private'),
          v.literal('organization'),
          v.literal('public'),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const org = await getOrganizationBySlug(ctx, args.orgSlug);

    await requirePermission(ctx, org._id, PERMISSIONS.PROJECT_CREATE);

    const existingProject = await ctx.db
      .query('projects')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.data.key),
      )
      .first();
    if (existingProject) {
      throw new ConvexError('PROJECT_KEY_EXISTS');
    }

    if (args.data.leadId) {
      const leadMembership = await ctx.db
        .query('members')
        .withIndex('by_org_user', q =>
          q.eq('organizationId', org._id).eq('userId', args.data.leadId!),
        )
        .first();
      if (!leadMembership) {
        throw new ConvexError('INVALID_PROJECT_LEAD');
      }
    }

    if (args.data.teamId) {
      const team = await ctx.db.get('teams', args.data.teamId);
      if (!team || team.organizationId !== org._id) {
        throw new ConvexError('INVALID_TEAM');
      }
    }

    if (args.data.statusId) {
      const status = await ctx.db.get('projectStatuses', args.data.statusId);
      if (!status || status.organizationId !== org._id) {
        throw new ConvexError('INVALID_PROJECT_STATUS');
      }
    }

    if (!args.data.key.trim() || !args.data.name.trim()) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (args.data.key.length > 20 || args.data.name.length > 100) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (args.data.description && args.data.description.length > 1000) {
      throw new ConvexError('INVALID_INPUT');
    }

    const projectId = await ctx.db.insert('projects', {
      organizationId: org._id,
      key: args.data.key.trim(),
      name: args.data.name.trim(),
      description: args.data.description?.trim(),
      leadId: args.data.leadId,
      teamId: args.data.teamId,
      statusId: args.data.statusId,
      createdBy: userId,
      visibility: args.data.visibility || 'organization',
    });

    await ctx.db.insert('projectMembers', {
      projectId,
      userId,
      role: 'lead',
      joinedAt: Date.now(),
    });
    await syncProjectRoleAssignment(ctx, projectId, userId, 'lead');

    if (args.data.leadId && args.data.leadId !== userId) {
      const existingLeadMembership = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', q =>
          q.eq('projectId', projectId).eq('userId', args.data.leadId!),
        )
        .first();

      if (!existingLeadMembership) {
        await ctx.db.insert('projectMembers', {
          projectId,
          userId: args.data.leadId,
          role: 'lead',
          joinedAt: Date.now(),
        });
      }
      await syncProjectRoleAssignment(ctx, projectId, args.data.leadId, 'lead');
    }

    return { projectId } as const;
  },
});

export const update = mutation({
  args: {
    projectId: v.id('projects'),
    data: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      leadId: v.optional(v.id('users')),
      teamId: v.optional(v.id('teams')),
      statusId: v.optional(v.id('projectStatuses')),
      icon: v.optional(v.string()),
      color: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectEditAccess(ctx, args.projectId);

    if (args.data.leadId) {
      const leadMembership = await ctx.db
        .query('members')
        .withIndex('by_org_user', q =>
          q
            .eq('organizationId', project.organizationId)
            .eq('userId', args.data.leadId!),
        )
        .first();
      if (!leadMembership) {
        throw new ConvexError('INVALID_PROJECT_LEAD');
      }
    }

    if (args.data.teamId) {
      const team = await ctx.db.get('teams', args.data.teamId);
      if (!team || team.organizationId !== project.organizationId) {
        throw new ConvexError('INVALID_TEAM');
      }
    }

    if (args.data.statusId) {
      const status = await ctx.db.get('projectStatuses', args.data.statusId);
      if (!status || status.organizationId !== project.organizationId) {
        throw new ConvexError('INVALID_PROJECT_STATUS');
      }
    }

    await ctx.db.patch('projects', project._id, { ...args.data });

    if (args.data.leadId) {
      const existingLeadMembership = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', q =>
          q.eq('projectId', project._id).eq('userId', args.data.leadId!),
        )
        .first();
      if (!existingLeadMembership) {
        await ctx.db.insert('projectMembers', {
          projectId: project._id,
          userId: args.data.leadId,
          role: 'lead',
          joinedAt: Date.now(),
        });
      }
      await syncProjectRoleAssignment(
        ctx,
        project._id,
        args.data.leadId,
        'lead',
      );
    }

    return { success: true } as const;
  },
});

export const changeStatus = mutation({
  args: {
    projectId: v.id('projects'),
    statusId: v.union(v.id('projectStatuses'), v.null()),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectEditAccess(ctx, args.projectId);

    if (args.statusId) {
      const status = await ctx.db.get('projectStatuses', args.statusId);
      if (!status || status.organizationId !== project.organizationId) {
        throw new ConvexError('INVALID_PROJECT_STATUS');
      }
    }

    await ctx.db.patch('projects', project._id, {
      statusId: args.statusId ?? undefined,
    });
  },
});

export const changeTeam = mutation({
  args: {
    projectId: v.id('projects'),
    teamId: v.union(v.id('teams'), v.null()),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectEditAccess(ctx, args.projectId);

    if (args.teamId) {
      const team = await ctx.db.get('teams', args.teamId);
      if (!team || team.organizationId !== project.organizationId) {
        throw new ConvexError('INVALID_TEAM');
      }
    }

    await ctx.db.patch('projects', project._id, {
      teamId: args.teamId ?? undefined,
    });
  },
});

export const changeLead = mutation({
  args: {
    projectId: v.id('projects'),
    leadId: v.union(v.id('users'), v.null()),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectEditAccess(ctx, args.projectId);

    if (args.leadId) {
      const leadMembership = await ctx.db
        .query('members')
        .withIndex('by_org_user', q =>
          q
            .eq('organizationId', project.organizationId)
            .eq('userId', args.leadId!),
        )
        .first();
      if (!leadMembership) {
        throw new ConvexError('INVALID_PROJECT_LEAD');
      }

      const projectMembership = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', q =>
          q.eq('projectId', project._id).eq('userId', args.leadId!),
        )
        .first();
      if (!projectMembership) {
        await ctx.db.insert('projectMembers', {
          projectId: project._id,
          userId: args.leadId,
          role: 'lead',
          joinedAt: Date.now(),
        });
      }

      await syncProjectRoleAssignment(ctx, project._id, args.leadId, 'lead');
    }

    await ctx.db.patch('projects', project._id, {
      leadId: args.leadId ?? undefined,
    });
  },
});

export const addMember = mutation({
  args: {
    projectId: v.id('projects'),
    userId: v.id('users'),
    role: v.union(v.literal('lead'), v.literal('member')),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get('projects', args.projectId);
    if (!project) {
      throw new ConvexError('PROJECT_NOT_FOUND');
    }

    if (!(await canManageProjectMembers(ctx, project, 'add'))) {
      throw new ConvexError('FORBIDDEN');
    }

    const targetUserMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q
          .eq('organizationId', project.organizationId)
          .eq('userId', args.userId),
      )
      .first();
    if (!targetUserMembership) {
      throw new ConvexError('USER_NOT_MEMBER');
    }

    const existingMember = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', q =>
        q.eq('projectId', project._id).eq('userId', args.userId),
      )
      .first();
    if (existingMember) {
      throw new ConvexError('USER_ALREADY_MEMBER');
    }

    const membershipId = await ctx.db.insert('projectMembers', {
      projectId: project._id,
      userId: args.userId,
      role: args.role,
      joinedAt: Date.now(),
    });
    await syncProjectRoleAssignment(ctx, project._id, args.userId, args.role);

    return { membershipId } as const;
  },
});

export const removeMember = mutation({
  args: {
    membershipId: v.id('projectMembers'),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get('projectMembers', args.membershipId);
    if (!membership) {
      throw new ConvexError('PROJECT_MEMBERSHIP_NOT_FOUND');
    }

    const project = await ctx.db.get('projects', membership.projectId);
    if (!project) {
      throw new ConvexError('PROJECT_NOT_FOUND');
    }

    if (!(await canManageProjectMembers(ctx, project, 'remove'))) {
      throw new ConvexError('FORBIDDEN');
    }

    const scopedAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_project_user', q =>
        q.eq('projectId', project._id).eq('userId', membership.userId),
      )
      .collect();
    for (const assignment of scopedAssignments) {
      await ctx.db.delete('roleAssignments', assignment._id);
    }

    const legacyAssignments = await ctx.db
      .query('projectRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', membership.userId))
      .collect();
    for (const assignment of legacyAssignments) {
      if (assignment.projectId === project._id) {
        await ctx.db.delete('projectRoleAssignments', assignment._id);
      }
    }

    await ctx.db.delete('projectMembers', args.membershipId);
    return { success: true } as const;
  },
});

export const deleteProject = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get('projects', args.projectId);
    if (!project) {
      throw new ConvexError('PROJECT_NOT_FOUND');
    }

    if (!(await canDeleteProject(ctx, project))) {
      throw new ConvexError('FORBIDDEN');
    }

    const projectMembers = await ctx.db
      .query('projectMembers')
      .withIndex('by_project', q => q.eq('projectId', project._id))
      .collect();
    for (const member of projectMembers) {
      await ctx.db.delete('projectMembers', member._id);
    }

    const projectAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_project_user', q => q.eq('projectId', project._id))
      .collect();
    for (const assignment of projectAssignments) {
      await ctx.db.delete('roleAssignments', assignment._id);
    }

    const legacyAssignments = await ctx.db
      .query('projectRoleAssignments')
      .withIndex('by_project', q => q.eq('projectId', project._id))
      .collect();
    for (const assignment of legacyAssignments) {
      await ctx.db.delete('projectRoleAssignments', assignment._id);
    }

    const projectTeams = await ctx.db
      .query('projectTeams')
      .withIndex('by_project', q => q.eq('projectId', project._id))
      .collect();
    for (const team of projectTeams) {
      await ctx.db.delete('projectTeams', team._id);
    }

    await ctx.db.delete('projects', project._id);
    return { success: true } as const;
  },
});

export const changeVisibility = mutation({
  args: {
    projectId: v.id('projects'),
    visibility: v.union(
      v.literal('private'),
      v.literal('organization'),
      v.literal('public'),
    ),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectEditAccess(ctx, args.projectId);

    await ctx.db.patch('projects', project._id, {
      visibility: args.visibility,
    });

    return { success: true } as const;
  },
});
