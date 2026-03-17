import { query } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import { canViewProject } from '../access';
import {
  getLeadMembershipFromMembers,
  getProjectLeadSummary,
} from '../_shared/leads';
import { isDefined } from '../_shared/typeGuards';
import { getAuthUserId } from '../authUtils';

export const getByKey = query({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    const project = await ctx.db
      .query('projects')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.projectKey),
      )
      .first();

    if (!project) {
      return null;
    }

    if (!(await canViewProject(ctx, project))) {
      throw new ConvexError('FORBIDDEN');
    }

    const { leadId, lead } = await getProjectLeadSummary(ctx, project);
    return { ...project, leadId, lead };
  },
});

export const list = query({
  args: {
    orgSlug: v.string(),
    teamId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    let allProjects: Doc<'projects'>[];

    if (args.teamId) {
      const team = await ctx.db
        .query('teams')
        .withIndex('by_org_key', q =>
          q.eq('organizationId', org._id).eq('key', args.teamId!),
        )
        .first();

      if (!team) {
        return [];
      }

      allProjects = await ctx.db
        .query('projects')
        .withIndex('by_org_team', q =>
          q.eq('organizationId', org._id).eq('teamId', team._id),
        )
        .collect();
    } else {
      allProjects = await ctx.db
        .query('projects')
        .withIndex('by_organization', q => q.eq('organizationId', org._id))
        .collect();
    }

    const projectPromises = allProjects.map(async project => {
      const canView = await canViewProject(ctx, project);
      return canView ? project : null;
    });
    const projects = (await Promise.all(projectPromises)).filter(
      (project): project is Doc<'projects'> => project !== null,
    );

    const projectMemberships = await Promise.all(
      projects.map(async project => ({
        projectId: project._id,
        members: await ctx.db
          .query('projectMembers')
          .withIndex('by_project', q => q.eq('projectId', project._id))
          .collect(),
      })),
    );
    const projectMembershipMap = new Map(
      projectMemberships.map(({ projectId, members }) => [projectId, members]),
    );

    const leadIds = projects
      .map(project => {
        const members = projectMembershipMap.get(project._id) ?? [];
        return getLeadMembershipFromMembers(members)?.userId ?? project.leadId;
      })
      .filter(isDefined);
    const statusIds = projects
      .map(project => project.statusId)
      .filter(isDefined);

    const leadUsers = await Promise.all(
      leadIds.map(id => ctx.db.get('users', id)),
    );
    const statuses = await Promise.all(
      statusIds.map(id => ctx.db.get('projectStatuses', id)),
    );

    const leadUserMap = new Map(leadIds.map((id, i) => [id, leadUsers[i]]));
    const statusMap = new Map(statusIds.map((id, i) => [id, statuses[i]]));

    return projects.map(project => {
      const leadId =
        getLeadMembershipFromMembers(
          projectMembershipMap.get(project._id) ?? [],
        )?.userId ?? project.leadId;
      const leadUser = leadId ? leadUserMap.get(leadId) : null;
      const status = project.statusId ? statusMap.get(project.statusId) : null;

      return {
        ...project,
        leadId,
        lead: leadUser,
        status,
      };
    });
  },
});

/**
 * List only projects where the current user is a member (for sidebar).
 */
export const listMyProjects = query({
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
      .query('projectMembers')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect();

    const projects = (
      await Promise.all(
        myMemberships.map(async membership => {
          const project = await ctx.db.get('projects', membership.projectId);
          return project && project.organizationId === org._id ? project : null;
        }),
      )
    ).filter((project): project is Doc<'projects'> => project !== null);

    // Keep the legacy field as a fallback until old rows are normalized.
    const allOrgProjects = await ctx.db
      .query('projects')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();
    const ownedProjects = allOrgProjects.filter(
      project =>
        (project.createdBy === userId || project.leadId === userId) &&
        !projects.some(myProject => myProject._id === project._id),
    );
    const combinedProjects = [...projects, ...ownedProjects];

    const projectMemberships = await Promise.all(
      combinedProjects.map(async project => ({
        projectId: project._id,
        members: await ctx.db
          .query('projectMembers')
          .withIndex('by_project', q => q.eq('projectId', project._id))
          .collect(),
      })),
    );
    const projectMembershipMap = new Map(
      projectMemberships.map(({ projectId, members }) => [projectId, members]),
    );

    const leadIds = combinedProjects
      .map(project => {
        const members = projectMembershipMap.get(project._id) ?? [];
        return getLeadMembershipFromMembers(members)?.userId ?? project.leadId;
      })
      .filter(isDefined);
    const statusIds = combinedProjects
      .map(project => project.statusId)
      .filter(isDefined);

    const leadUsers = await Promise.all(
      leadIds.map(id => ctx.db.get('users', id)),
    );
    const statuses = await Promise.all(
      statusIds.map(id => ctx.db.get('projectStatuses', id)),
    );

    const leadUserMap = new Map(leadIds.map((id, i) => [id, leadUsers[i]]));
    const statusMap = new Map(statusIds.map((id, i) => [id, statuses[i]]));

    return combinedProjects.map(project => {
      const leadId =
        getLeadMembershipFromMembers(
          projectMembershipMap.get(project._id) ?? [],
        )?.userId ?? project.leadId;
      const leadUser = leadId ? leadUserMap.get(leadId) : null;
      const status = project.statusId ? statusMap.get(project.statusId) : null;

      return {
        ...project,
        leadId,
        lead: leadUser,
        status,
      };
    });
  },
});

export const listMembers = query({
  args: {
    projectId: v.optional(v.id('projects')),
    orgSlug: v.optional(v.string()),
    projectKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let project: Doc<'projects'> | null = null;

    if (args.projectId) {
      project = await ctx.db.get('projects', args.projectId);
    } else if (args.orgSlug && args.projectKey) {
      const org = await ctx.db
        .query('organizations')
        .withIndex('by_slug', q => q.eq('slug', args.orgSlug!))
        .first();

      if (!org) {
        throw new ConvexError('ORGANIZATION_NOT_FOUND');
      }

      project = await ctx.db
        .query('projects')
        .withIndex('by_org_key', q =>
          q.eq('organizationId', org._id).eq('key', args.projectKey!),
        )
        .first();
    }

    if (!project) {
      return [];
    }

    if (!(await canViewProject(ctx, project))) {
      throw new ConvexError('FORBIDDEN');
    }

    const projectMembers = await ctx.db
      .query('projectMembers')
      .withIndex('by_project', q => q.eq('projectId', project._id))
      .collect();

    const membersWithUsers = await Promise.all(
      projectMembers.map(async member => {
        const user = await ctx.db.get('users', member.userId);
        return { ...member, user };
      }),
    );

    return membersWithUsers;
  },
});
