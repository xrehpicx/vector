import { query } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import { canViewTeam } from '../access';
import {
  getLeadMembershipFromMembers,
  getTeamLeadSummary,
} from '../_shared/leads';
import { isDefined } from '../_shared/typeGuards';
import { getAuthUserId } from '../authUtils';

/**
 * Get team by organization slug and team key
 */
export const getByKey = query({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    const team = await ctx.db
      .query('teams')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.teamKey),
      )
      .first();

    if (!team) {
      throw new ConvexError('TEAM_NOT_FOUND');
    }

    if (!(await canViewTeam(ctx, team))) {
      throw new ConvexError('FORBIDDEN');
    }

    const { leadId, lead } = await getTeamLeadSummary(ctx, team);

    return {
      ...team,
      leadId,
      lead,
    };
  },
});

/**
 * List teams in organization
 */
export const list = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    const allTeams = await ctx.db
      .query('teams')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    const teamPromises = allTeams.map(async team => {
      const canView = await canViewTeam(ctx, team);
      return canView ? team : null;
    });
    const teams = (await Promise.all(teamPromises)).filter(
      (team): team is Doc<'teams'> => team !== null,
    );

    const teamMemberships = await Promise.all(
      teams.map(async team => ({
        teamId: team._id,
        members: await ctx.db
          .query('teamMembers')
          .withIndex('by_team', q => q.eq('teamId', team._id))
          .collect(),
      })),
    );
    const teamMembershipMap = new Map(
      teamMemberships.map(({ teamId, members }) => [teamId, members]),
    );

    const leadIds = teams
      .map(team => {
        const members = teamMembershipMap.get(team._id) ?? [];
        return getLeadMembershipFromMembers(members)?.userId ?? team.leadId;
      })
      .filter(isDefined);
    const leadUsers = await Promise.all(
      leadIds.map(id => ctx.db.get('users', id)),
    );
    const leadUserMap = new Map(leadIds.map((id, i) => [id, leadUsers[i]]));

    return teams.map(team => {
      const members = teamMembershipMap.get(team._id) ?? [];
      const leadId =
        getLeadMembershipFromMembers(members)?.userId ?? team.leadId;
      const leadUser = leadId ? leadUserMap.get(leadId) : null;

      return {
        ...team,
        leadId,
        lead: leadUser,
        memberCount: members.length,
      };
    });
  },
});

/**
 * List only teams where the current user is a member (for sidebar).
 */
export const listMyTeams = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    const myMemberships = await ctx.db
      .query('teamMembers')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect();

    const teams = (
      await Promise.all(
        myMemberships.map(async membership => {
          const team = await ctx.db.get('teams', membership.teamId);
          return team && team.organizationId === org._id ? team : null;
        }),
      )
    ).filter((team): team is Doc<'teams'> => team !== null);

    const allOrgTeams = await ctx.db
      .query('teams')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();
    const createdTeams = allOrgTeams.filter(
      team =>
        team.createdBy === userId &&
        !teams.some(myTeam => myTeam._id === team._id),
    );
    const combinedTeams = [...teams, ...createdTeams];

    const teamMemberships = await Promise.all(
      combinedTeams.map(async team => ({
        teamId: team._id,
        members: await ctx.db
          .query('teamMembers')
          .withIndex('by_team', q => q.eq('teamId', team._id))
          .collect(),
      })),
    );
    const teamMembershipMap = new Map(
      teamMemberships.map(({ teamId, members }) => [teamId, members]),
    );

    const leadIds = combinedTeams
      .map(team => {
        const members = teamMembershipMap.get(team._id) ?? [];
        return getLeadMembershipFromMembers(members)?.userId ?? team.leadId;
      })
      .filter(isDefined);
    const leadUsers = await Promise.all(
      leadIds.map(id => ctx.db.get('users', id)),
    );
    const leadUserMap = new Map(leadIds.map((id, i) => [id, leadUsers[i]]));

    return combinedTeams.map(team => {
      const members = teamMembershipMap.get(team._id) ?? [];
      const leadId =
        getLeadMembershipFromMembers(members)?.userId ?? team.leadId;
      const leadUser = leadId ? leadUserMap.get(leadId) : null;

      return {
        ...team,
        leadId,
        lead: leadUser,
        memberCount: members.length,
      };
    });
  },
});

/**
 * List team members
 */
export const listMembers = query({
  args: {
    teamId: v.optional(v.id('teams')),
  },
  handler: async (ctx, args) => {
    if (!args.teamId) {
      throw new ConvexError('TEAM_NOT_FOUND');
    }
    const team = await ctx.db.get('teams', args.teamId);
    if (!team) {
      throw new ConvexError('TEAM_NOT_FOUND');
    }

    if (!(await canViewTeam(ctx, team))) {
      throw new ConvexError('FORBIDDEN');
    }

    const teamMembers = await ctx.db
      .query('teamMembers')
      .withIndex('by_team', q => q.eq('teamId', team._id))
      .collect();

    const membersWithUsers = await Promise.all(
      teamMembers.map(async member => {
        const user = await ctx.db.get('users', member.userId);
        return {
          ...member,
          user,
        };
      }),
    );

    return membersWithUsers;
  },
});
