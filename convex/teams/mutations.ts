import { mutation, type MutationCtx } from '../_generated/server';
import { ConvexError, v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { getOrganizationBySlug, requireAuthUser } from '../authz';
import { canDeleteTeam, canEditTeam, canManageTeamMembers } from '../access';
import { PERMISSIONS, requirePermission } from '../permissions/utils';
import { syncTeamRoleAssignment } from '../roles';

async function requireTeamEditAccess(ctx: MutationCtx, teamId: Id<'teams'>) {
  const team = await ctx.db.get('teams', teamId);
  if (!team) {
    throw new ConvexError('TEAM_NOT_FOUND');
  }

  if (!(await canEditTeam(ctx, team))) {
    throw new ConvexError('FORBIDDEN');
  }

  return team;
}

export const create = mutation({
  args: {
    orgSlug: v.string(),
    data: v.object({
      key: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      leadId: v.optional(v.id('users')),
      icon: v.optional(v.string()),
      color: v.optional(v.string()),
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
    await requirePermission(ctx, org._id, PERMISSIONS.TEAM_CREATE);

    const existingTeam = await ctx.db
      .query('teams')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.data.key),
      )
      .first();
    if (existingTeam) {
      throw new ConvexError('TEAM_KEY_EXISTS');
    }

    if (args.data.leadId) {
      const leadMembership = await ctx.db
        .query('members')
        .withIndex('by_org_user', q =>
          q.eq('organizationId', org._id).eq('userId', args.data.leadId!),
        )
        .first();
      if (!leadMembership) {
        throw new ConvexError('INVALID_TEAM_LEAD');
      }
    }

    if (!args.data.key.trim() || !args.data.name.trim()) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (args.data.key.length > 10 || args.data.name.length > 100) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (args.data.description && args.data.description.length > 500) {
      throw new ConvexError('INVALID_INPUT');
    }

    const teamId = await ctx.db.insert('teams', {
      organizationId: org._id,
      key: args.data.key.trim(),
      name: args.data.name.trim(),
      description: args.data.description?.trim(),
      leadId: args.data.leadId,
      icon: args.data.icon,
      color: args.data.color,
      visibility: args.data.visibility || 'organization',
      createdBy: userId,
    });

    await ctx.db.insert('teamMembers', {
      teamId,
      userId,
      role: 'lead',
      joinedAt: Date.now(),
    });
    await syncTeamRoleAssignment(ctx, teamId, userId, 'lead');

    if (args.data.leadId && args.data.leadId !== userId) {
      const leadMembership = await ctx.db
        .query('teamMembers')
        .withIndex('by_team_user', q =>
          q.eq('teamId', teamId).eq('userId', args.data.leadId!),
        )
        .first();
      if (!leadMembership) {
        await ctx.db.insert('teamMembers', {
          teamId,
          userId: args.data.leadId,
          role: 'lead',
          joinedAt: Date.now(),
        });
      }
      await syncTeamRoleAssignment(ctx, teamId, args.data.leadId, 'lead');
    }

    return { teamId };
  },
});

export const update = mutation({
  args: {
    teamId: v.id('teams'),
    data: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      leadId: v.optional(v.id('users')),
      icon: v.optional(v.string()),
      color: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const team = await requireTeamEditAccess(ctx, args.teamId);

    if (args.data.leadId) {
      const leadMembership = await ctx.db
        .query('members')
        .withIndex('by_org_user', q =>
          q
            .eq('organizationId', team.organizationId)
            .eq('userId', args.data.leadId!),
        )
        .first();
      if (!leadMembership) {
        throw new ConvexError('INVALID_TEAM_LEAD');
      }
    }

    await ctx.db.patch('teams', team._id, { ...args.data });

    if (args.data.leadId) {
      const existingLeadMembership = await ctx.db
        .query('teamMembers')
        .withIndex('by_team_user', q =>
          q.eq('teamId', team._id).eq('userId', args.data.leadId!),
        )
        .first();
      if (!existingLeadMembership) {
        await ctx.db.insert('teamMembers', {
          teamId: team._id,
          userId: args.data.leadId,
          role: 'lead',
          joinedAt: Date.now(),
        });
      }
      await syncTeamRoleAssignment(ctx, team._id, args.data.leadId, 'lead');
    }

    return { success: true };
  },
});

export const addMember = mutation({
  args: {
    teamId: v.id('teams'),
    userId: v.id('users'),
    role: v.union(v.literal('lead'), v.literal('member')),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get('teams', args.teamId);
    if (!team) {
      throw new ConvexError('TEAM_NOT_FOUND');
    }

    if (!(await canManageTeamMembers(ctx, team, 'add'))) {
      throw new ConvexError('FORBIDDEN');
    }

    const targetUserMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', team.organizationId).eq('userId', args.userId),
      )
      .first();
    if (!targetUserMembership) {
      throw new ConvexError('USER_NOT_MEMBER');
    }

    const existingMember = await ctx.db
      .query('teamMembers')
      .withIndex('by_team_user', q =>
        q.eq('teamId', team._id).eq('userId', args.userId),
      )
      .first();
    if (existingMember) {
      throw new ConvexError('USER_ALREADY_MEMBER');
    }

    const membershipId = await ctx.db.insert('teamMembers', {
      teamId: team._id,
      userId: args.userId,
      role: args.role,
      joinedAt: Date.now(),
    });
    await syncTeamRoleAssignment(ctx, team._id, args.userId, args.role);

    return { membershipId };
  },
});

export const removeMember = mutation({
  args: {
    membershipId: v.id('teamMembers'),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get('teamMembers', args.membershipId);
    if (!membership) {
      throw new ConvexError('TEAM_MEMBERSHIP_NOT_FOUND');
    }

    const team = await ctx.db.get('teams', membership.teamId);
    if (!team) {
      throw new ConvexError('TEAM_NOT_FOUND');
    }

    if (!(await canManageTeamMembers(ctx, team, 'remove'))) {
      throw new ConvexError('FORBIDDEN');
    }

    const scopedAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_team_user', q =>
        q.eq('teamId', team._id).eq('userId', membership.userId),
      )
      .collect();
    for (const assignment of scopedAssignments) {
      await ctx.db.delete('roleAssignments', assignment._id);
    }

    const legacyAssignments = await ctx.db
      .query('teamRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', membership.userId))
      .collect();
    for (const assignment of legacyAssignments) {
      if (assignment.teamId === team._id) {
        await ctx.db.delete('teamRoleAssignments', assignment._id);
      }
    }

    await ctx.db.delete('teamMembers', args.membershipId);

    return { success: true };
  },
});

export const deleteTeam = mutation({
  args: {
    teamId: v.id('teams'),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get('teams', args.teamId);
    if (!team) {
      throw new ConvexError('TEAM_NOT_FOUND');
    }

    if (!(await canDeleteTeam(ctx, team))) {
      throw new ConvexError('FORBIDDEN');
    }

    const teamMembers = await ctx.db
      .query('teamMembers')
      .withIndex('by_team', q => q.eq('teamId', team._id))
      .collect();
    for (const member of teamMembers) {
      await ctx.db.delete('teamMembers', member._id);
    }

    const teamAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_team_user', q => q.eq('teamId', team._id))
      .collect();
    for (const assignment of teamAssignments) {
      await ctx.db.delete('roleAssignments', assignment._id);
    }

    const legacyAssignments = await ctx.db
      .query('teamRoleAssignments')
      .withIndex('by_team', q => q.eq('teamId', team._id))
      .collect();
    for (const assignment of legacyAssignments) {
      await ctx.db.delete('teamRoleAssignments', assignment._id);
    }

    await ctx.db.delete('teams', team._id);

    return { success: true };
  },
});

export const changeVisibility = mutation({
  args: {
    teamId: v.id('teams'),
    visibility: v.union(
      v.literal('private'),
      v.literal('organization'),
      v.literal('public'),
    ),
  },
  handler: async (ctx, args) => {
    const team = await requireTeamEditAccess(ctx, args.teamId);

    await ctx.db.patch('teams', team._id, {
      visibility: args.visibility,
    });

    return { success: true };
  },
});
