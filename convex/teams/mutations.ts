import { mutation, type MutationCtx } from '../_generated/server';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { getOrganizationBySlug, requireAuthUser } from '../authz';
import { canDeleteTeam, canEditTeam, canManageTeamMembers } from '../access';
import {
  recordActivity,
  resolveTeamScope,
  snapshotForTeam,
} from '../activities/lib';
import { getTeamLeadSummary, setTeamLeadMemberRole } from '../_shared/leads';
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

function userLabel(user: Doc<'users'> | null | undefined): string | undefined {
  if (!user) {
    return undefined;
  }
  return user.name ?? user.email ?? user.username ?? undefined;
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
    if (args.data.description && args.data.description.length > 2000) {
      throw new ConvexError('INVALID_INPUT');
    }

    const teamId = await ctx.db.insert('teams', {
      organizationId: org._id,
      key: args.data.key.trim(),
      name: args.data.name.trim(),
      description: args.data.description?.trim(),
      icon: args.data.icon,
      color: args.data.color,
      visibility: args.data.visibility || 'organization',
      createdBy: userId,
    });

    const creatorRole =
      args.data.leadId && args.data.leadId !== userId ? 'member' : 'lead';
    await ctx.db.insert('teamMembers', {
      teamId,
      userId,
      role: creatorRole,
      joinedAt: Date.now(),
    });
    await syncTeamRoleAssignment(ctx, teamId, userId, creatorRole);

    const createdTeam = await ctx.db.get('teams', teamId);
    if (!createdTeam) {
      throw new ConvexError('TEAM_NOT_FOUND');
    }

    if (args.data.leadId && args.data.leadId !== userId) {
      await setTeamLeadMemberRole(ctx, createdTeam, args.data.leadId);
    }

    await recordActivity(ctx, {
      scope: resolveTeamScope(createdTeam),
      entityType: 'team',
      eventType: 'team_created',
      actorId: userId,
      snapshot: snapshotForTeam(createdTeam),
    });

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
    const userId = await requireAuthUser(ctx);
    const team = await requireTeamEditAccess(ctx, args.teamId);
    const previousLeadSummary = await getTeamLeadSummary(ctx, team);
    const previousLead = previousLeadSummary.lead;

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

    const { leadId: nextLeadId, ...rest } = args.data;
    if (Object.keys(rest).length > 0) {
      await ctx.db.patch('teams', team._id, rest);
    }

    if (nextLeadId !== undefined) {
      await setTeamLeadMemberRole(ctx, team, nextLeadId);
    }

    const snapshot = snapshotForTeam({
      ...team,
      name: args.data.name ?? team.name,
    });

    if (args.data.name !== undefined && args.data.name !== team.name) {
      await recordActivity(ctx, {
        scope: resolveTeamScope(team),
        entityType: 'team',
        eventType: 'team_name_changed',
        actorId: userId,
        details: {
          field: 'name',
          fromLabel: team.name,
          toLabel: args.data.name,
        },
        snapshot,
      });
    }

    if (
      args.data.description !== undefined &&
      args.data.description !== team.description
    ) {
      await recordActivity(ctx, {
        scope: resolveTeamScope(team),
        entityType: 'team',
        eventType: 'team_description_changed',
        actorId: userId,
        details: {
          field: 'description',
        },
        snapshot,
      });
    }

    if (nextLeadId !== undefined && nextLeadId !== previousLeadSummary.leadId) {
      const nextLead = nextLeadId
        ? await ctx.db.get('users', nextLeadId)
        : null;
      await recordActivity(ctx, {
        scope: resolveTeamScope(team),
        entityType: 'team',
        eventType: 'team_lead_changed',
        actorId: userId,
        subjectUserId: nextLeadId ?? undefined,
        details: {
          field: 'lead',
          fromId: previousLeadSummary.leadId,
          fromLabel: userLabel(previousLead),
          toId: nextLeadId,
          toLabel: userLabel(nextLead),
        },
        snapshot,
      });
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
    const userId = await requireAuthUser(ctx);
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
    if (args.role === 'lead') {
      await setTeamLeadMemberRole(ctx, team, args.userId);
    } else {
      await syncTeamRoleAssignment(ctx, team._id, args.userId, args.role);
    }

    await recordActivity(ctx, {
      scope: resolveTeamScope(team),
      entityType: 'team',
      eventType: 'team_member_added',
      actorId: userId,
      subjectUserId: args.userId,
      details: {
        field: 'role',
        toLabel: args.role,
      },
      snapshot: snapshotForTeam(team),
    });

    return { membershipId };
  },
});

export const removeMember = mutation({
  args: {
    membershipId: v.id('teamMembers'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
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

    await recordActivity(ctx, {
      scope: resolveTeamScope(team),
      entityType: 'team',
      eventType: 'team_member_removed',
      actorId: userId,
      subjectUserId: membership.userId,
      details: {
        field: 'role',
        fromLabel: membership.role,
      },
      snapshot: snapshotForTeam(team),
    });

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
    const userId = await requireAuthUser(ctx);
    const team = await requireTeamEditAccess(ctx, args.teamId);
    const previousVisibility = team.visibility;

    await ctx.db.patch('teams', team._id, {
      visibility: args.visibility,
    });

    if (args.visibility !== previousVisibility) {
      await recordActivity(ctx, {
        scope: resolveTeamScope(team),
        entityType: 'team',
        eventType: 'team_visibility_changed',
        actorId: userId,
        details: {
          field: 'visibility',
          fromLabel: previousVisibility,
          toLabel: args.visibility,
        },
        snapshot: snapshotForTeam(team),
      });
    }

    return { success: true };
  },
});
