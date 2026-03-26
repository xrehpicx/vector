import { query, type QueryCtx } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { getAuthUserId } from '../authUtils';
import { canViewIssue, canViewTeam, canViewProject } from '../access';
import { requireOrgPermission } from '../authz';
import { PERMISSIONS } from '../_shared/permissions';
import { normalizeKanbanBorderTags } from '../../src/lib/kanban-border-tags';

async function requireOrganizationMembership(ctx: QueryCtx, orgSlug: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError('UNAUTHORIZED');
  }

  const org = await ctx.db
    .query('organizations')
    .withIndex('by_slug', q => q.eq('slug', orgSlug))
    .first();

  if (!org) {
    throw new ConvexError('ORGANIZATION_NOT_FOUND');
  }

  const membership = await ctx.db
    .query('members')
    .withIndex('by_org_user', q =>
      q.eq('organizationId', org._id).eq('userId', userId),
    )
    .first();

  if (!membership) {
    throw new ConvexError('FORBIDDEN');
  }

  return { userId, org, membership };
}

async function loadUsersById(ctx: QueryCtx, userIds: readonly Id<'users'>[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const users = await Promise.all(
    uniqueUserIds.map(id => ctx.db.get('users', id)),
  );

  return new Map(
    uniqueUserIds.flatMap((id, index) => {
      const user = users[index];
      return user ? [[id, user]] : [];
    }),
  );
}

async function listOrganizationMembersInternal(
  ctx: QueryCtx,
  organizationId: Id<'organizations'>,
) {
  const members = await ctx.db
    .query('members')
    .withIndex('by_organization', q => q.eq('organizationId', organizationId))
    .collect();

  const userMap = await loadUsersById(
    ctx,
    members.map(member => member.userId),
  );

  return members.map(member => {
    const user = userMap.get(member.userId);
    return {
      ...member,
      user: user
        ? {
            _id: user._id,
            name: user.name,
            email: user.email,
            image: user.image,
            username: user.username,
            role: user.role,
          }
        : null,
    };
  });
}

async function listVisibleTeamsInternal(
  ctx: QueryCtx,
  organizationId: Id<'organizations'>,
) {
  const allTeams = await ctx.db
    .query('teams')
    .withIndex('by_organization', q => q.eq('organizationId', organizationId))
    .collect();

  const visibility = await Promise.all(
    allTeams.map(async team => ({
      team,
      canView: await canViewTeam(ctx, team),
    })),
  );

  return visibility.flatMap(({ team, canView }) => (canView ? [team] : []));
}

async function listVisibleProjectsInternal(
  ctx: QueryCtx,
  organizationId: Id<'organizations'>,
) {
  const allProjects = await ctx.db
    .query('projects')
    .withIndex('by_organization', q => q.eq('organizationId', organizationId))
    .collect();

  const visibility = await Promise.all(
    allProjects.map(async project => ({
      project,
      canView: await canViewProject(ctx, project),
    })),
  );
  const visibleProjects = visibility.flatMap(({ project, canView }) =>
    canView ? [project] : [],
  );

  const statusIds = Array.from(
    new Set(
      visibleProjects
        .map(project => project.statusId)
        .filter((id): id is Id<'projectStatuses'> => Boolean(id)),
    ),
  );
  const statuses = await Promise.all(
    statusIds.map(id => ctx.db.get('projectStatuses', id)),
  );
  const statusMap = new Map(
    statusIds.flatMap((id, index) => {
      const status = statuses[index];
      return status ? [[id, status]] : [];
    }),
  );

  return visibleProjects.map(project => {
    const status = project.statusId ? statusMap.get(project.statusId) : null;
    return {
      ...project,
      statusColor: status?.color,
      statusIcon: status?.icon,
    };
  });
}

/**
 * Get organization by slug
 */
export const getBySlug = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);
    return org;
  },
});

export const getPublicProfileBySlug = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      return null;
    }

    const publicLandingView = org.publicLandingViewId
      ? await ctx.db.get('views', org.publicLandingViewId)
      : null;
    const logoUrl = org.logo ? await ctx.storage.getUrl(org.logo) : null;

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      logoUrl,
      subtitle: org.subtitle ?? null,
      publicDescription: org.publicDescription ?? null,
      publicLandingViewId:
        publicLandingView &&
        publicLandingView.organizationId === org._id &&
        publicLandingView.visibility === 'public'
          ? (publicLandingView._id as string)
          : null,
      publicSocialLinks: org.publicSocialLinks ?? [],
    };
  },
});

/**
 * List organization members with roles
 */
export const listMembersWithRoles = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    // Find organization
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    // Verify user is a member
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();

    if (!membership) {
      throw new ConvexError('FORBIDDEN');
    }

    const members = await ctx.db
      .query('members')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    const users = await Promise.all(
      members.map(m => ctx.db.get('users', m.userId)),
    );

    const allAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();
    const legacyAssignments = await ctx.db
      .query('orgRoleAssignments')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    const roleDefs = await Promise.all(
      allAssignments.map(r => ctx.db.get('roles', r.roleId)),
    );
    const legacyRoleIds = Array.from(
      new Set(legacyAssignments.map(assignment => assignment.roleId)),
    );
    const legacyRoleDefs = await Promise.all(
      legacyRoleIds.map(roleId => ctx.db.get('orgRoles', roleId)),
    );
    const legacyRoleMap = new Map(
      legacyRoleDefs
        .filter((role): role is NonNullable<typeof role> => role !== null)
        .map(role => [role._id, role]),
    );
    const migratedLegacyKeys = new Set(
      roleDefs
        .filter((role): role is NonNullable<typeof role> => role !== null)
        .map(role => role.key),
    );

    return members.map((m, i) => {
      const user = users[i];
      const userRoles = allAssignments.filter(
        r => r.userId === m.userId && !r.teamId && !r.projectId,
      );
      const customRoles = userRoles
        .map(ur => roleDefs.find(rd => rd?._id === ur.roleId))
        .filter((r): r is NonNullable<typeof r> => !!r && !r.system);
      const legacyCustomRoles = legacyAssignments
        .filter(assignment => assignment.userId === m.userId)
        .map(assignment => legacyRoleMap.get(assignment.roleId))
        .filter(
          (role): role is NonNullable<typeof role> =>
            !!role &&
            !role.system &&
            !migratedLegacyKeys.has(`legacy:org:${role._id}`),
        )
        .map(role => ({
          _id: role._id,
          _creationTime: role._creationTime,
          organizationId: role.organizationId,
          scopeType: 'organization' as const,
          key: `legacy:org:${role._id}`,
          name: role.name,
          description: role.description,
          system: role.system,
        }));
      const allCustomRoles = [...customRoles, ...legacyCustomRoles];
      return {
        ...m,
        name: user?.name,
        email: user?.email,
        image: user?.image,
        roleId: allCustomRoles[0]?._id ?? null,
        roleName: allCustomRoles[0]?.name ?? null,
        customRoles: allCustomRoles,
      };
    });
  },
});

export const listInvites = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    // Find organization
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    // Verify user is a member
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();

    if (!membership) {
      throw new ConvexError('FORBIDDEN');
    }

    await requireOrgPermission(ctx, org._id, PERMISSIONS.ORG_MANAGE_MEMBERS);

    const invites = await ctx.db
      .query('invitations')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .filter(q => q.eq(q.field('status'), 'pending'))
      .collect();

    return invites.filter(invite => invite.expiresAt >= Date.now());
  },
});

/**
 * Get organization statistics
 */
export const getOrganizationStats = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    // Find organization
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    // Verify user is a member
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();

    if (!membership) {
      throw new ConvexError('FORBIDDEN');
    }

    // Get counts
    const memberCount = await ctx.db
      .query('members')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect()
      .then(members => members.length);

    const projectCount = await ctx.db
      .query('projects')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect()
      .then(projects => projects.length);

    const teamCount = await ctx.db
      .query('teams')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect()
      .then(teams => teams.length);

    const issueCount = await ctx.db
      .query('issues')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect()
      .then(issues => issues.length);

    return {
      memberCount,
      projectCount,
      teamCount,
      issueCount,
    };
  },
});

/**
 * List recent projects
 */
export const getRecentProjects = query({
  args: {
    orgSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    // Find organization
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    // Verify user is a member
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();

    if (!membership) {
      throw new ConvexError('FORBIDDEN');
    }

    // Get recent projects
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    const visibleProjects = (
      await Promise.all(
        projects.map(async project =>
          (await canViewProject(ctx, project)) ? project : null,
        ),
      )
    ).filter((project): project is Doc<'projects'> => project !== null);

    return visibleProjects
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, args.limit ?? 5);
  },
});

/**
 * List recent issues
 */
export const getRecentIssues = query({
  args: {
    orgSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    // Find organization
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    // Verify user is a member
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();

    if (!membership) {
      throw new ConvexError('FORBIDDEN');
    }

    // Get recent issues
    const issues = await ctx.db
      .query('issues')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    // Filter issues based on visibility permissions
    const issuePromises = issues.map(async issue => {
      const canView = await canViewIssue(ctx, issue);
      return canView ? issue : null;
    });
    const visibleIssues = (await Promise.all(issuePromises)).filter(
      (issue): issue is Doc<'issues'> => issue !== null,
    );

    // Sort by creation time (newest first) and limit
    const sortedIssues = visibleIssues
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, args.limit ?? 10);

    return sortedIssues;
  },
});

/**
 * List organization members
 */
export const listMembers = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);
    return listOrganizationMembersInternal(ctx, org._id);
  },
});

/**
 * Search organization members
 */
export const searchMembers = query({
  args: {
    orgSlug: v.string(),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    // Find organization
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError('ORGANIZATION_NOT_FOUND');
    }

    // Verify user is a member
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();

    if (!membership) {
      throw new ConvexError('FORBIDDEN');
    }

    // Get all members
    const members = await ctx.db
      .query('members')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    // Get user details for each member
    const memberUserIds = members.map(m => m.userId);
    const users = await Promise.all(
      memberUserIds.map(id => ctx.db.get('users', id)),
    );
    const userMap = new Map(memberUserIds.map((id, i) => [id, users[i]]));

    // Filter and search
    let results = members.map(member => {
      const user = userMap.get(member.userId);
      return {
        ...member,
        user: user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              image: user.image,
              username: user.username,
              role: user.role,
            }
          : null,
      };
    });

    // Apply search filter
    if (args.query) {
      const searchTerm = args.query.toLowerCase();
      results = results.filter(
        member =>
          member.user &&
          (member.user.name?.toLowerCase().includes(searchTerm) ||
            member.user.email?.toLowerCase().includes(searchTerm) ||
            member.user.username?.toLowerCase().includes(searchTerm)),
      );
    }

    // Apply limit
    if (args.limit) {
      results = results.slice(0, args.limit);
    }

    return results;
  },
});

/**
 * List organization teams
 */
export const listTeams = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);
    return listVisibleTeamsInternal(ctx, org._id);
  },
});

/**
 * List organization projects
 */
export const listProjects = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);
    return listVisibleProjectsInternal(ctx, org._id);
  },
});

/**
 * List issue states
 */
export const listIssueStates = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);
    const states = await ctx.db
      .query('issueStates')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    return states;
  },
});

/**
 * List project statuses
 */
export const listProjectStatuses = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);
    const statuses = await ctx.db
      .query('projectStatuses')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    return statuses;
  },
});

/**
 * List issue priorities
 */
export const listIssuePriorities = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);
    const priorities = await ctx.db
      .query('issuePriorities')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    return priorities;
  },
});

export const listKanbanBorderTags = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);
    return normalizeKanbanBorderTags(org.kanbanBorderTags);
  },
});

export const getWorkspaceOptions = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrganizationMembership(ctx, args.orgSlug);

    const [members, teams, projects, issueStates, issuePriorities, statuses] =
      await Promise.all([
        listOrganizationMembersInternal(ctx, org._id),
        listVisibleTeamsInternal(ctx, org._id),
        listVisibleProjectsInternal(ctx, org._id),
        ctx.db
          .query('issueStates')
          .withIndex('by_organization', q => q.eq('organizationId', org._id))
          .collect(),
        ctx.db
          .query('issuePriorities')
          .withIndex('by_organization', q => q.eq('organizationId', org._id))
          .collect(),
        ctx.db
          .query('projectStatuses')
          .withIndex('by_organization', q => q.eq('organizationId', org._id))
          .collect(),
      ]);

    return {
      members,
      teams,
      projects,
      issueStates,
      issuePriorities,
      projectStatuses: statuses,
    };
  },
});

export const getOrgMember = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org) {
      return null;
    }

    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();

    return membership;
  },
});

/**
 * Get organization logo URL
 */
export const getLogoUrl = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    // Find organization
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();

    if (!org || !org.logo) {
      return null;
    }

    // Generate URL for the logo
    return await ctx.storage.getUrl(org.logo);
  },
});

/**
 * Get file URL by storage ID string (for API routes)
 */
export const getFileUrlByString = query({
  args: {
    storageIdString: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageIdString);
  },
});
