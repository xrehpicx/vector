import { mutation, type MutationCtx } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import {
  getOrganizationBySlug,
  requireAuthUser,
  requireOrgPermission,
} from '../authz';
import { PERMISSIONS } from '../_shared/permissions';
import { syncOrganizationRoleAssignment } from '../roles';
import { createNotificationEvent } from '../notifications/lib';
import {
  ISSUE_PRIORITY_DEFAULTS,
  ISSUE_STATE_DEFAULTS,
  PROJECT_STATUS_DEFAULTS,
} from '../../src/lib/defaults';
import {
  getDefaultKanbanBorderTags,
  normalizeKanbanBorderTags,
  KANBAN_BORDER_COLOR_OPTIONS,
} from '../../src/lib/kanban-border-tags';
import {
  normalizeSocialLinkUrl,
  SOCIAL_LINK_PLATFORMS,
} from '../../src/lib/social-links';

const socialLinkPlatformValidator = v.union(
  ...SOCIAL_LINK_PLATFORMS.map(platform => v.literal(platform)),
);

const socialLinkValidator = v.object({
  platform: socialLinkPlatformValidator,
  url: v.string(),
});

const kanbanBorderTagValidator = v.union(
  ...KANBAN_BORDER_COLOR_OPTIONS.map(option => v.literal(option.value)),
);

async function requireOrgAccess(
  ctx: MutationCtx,
  orgSlug: string,
  permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
) {
  await requireAuthUser(ctx);
  const org = await getOrganizationBySlug(ctx, orgSlug);
  await requireOrgPermission(ctx, org._id, permission);
  return org;
}

export const revokeInvite = mutation({
  args: {
    inviteId: v.id('invitations'),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const invite = await ctx.db.get('invitations', args.inviteId);

    if (!invite) {
      throw new ConvexError('INVITE_NOT_FOUND');
    }
    if (invite.status !== 'pending') {
      throw new ConvexError('INVITE_NOT_PENDING');
    }

    await requireOrgPermission(
      ctx,
      invite.organizationId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    await ctx.db.patch('invitations', invite._id, {
      status: 'revoked',
      revokedAt: Date.now(),
    });
  },
});

export const declineInvitation = mutation({
  args: {
    inviteId: v.id('invitations'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const user = await ctx.db.get('users', userId);
    if (!user) {
      throw new ConvexError('USER_NOT_FOUND');
    }

    const invite = await ctx.db.get('invitations', args.inviteId);
    if (!invite) {
      throw new ConvexError('INVITATION_NOT_FOUND');
    }
    if (invite.status !== 'pending') {
      throw new ConvexError('INVITATION_NOT_PENDING');
    }
    if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
      throw new ConvexError('NOT_YOUR_INVITATION');
    }

    await ctx.db.patch('invitations', invite._id, {
      status: 'revoked',
      revokedAt: Date.now(),
    });
    return { success: true } as const;
  },
});

export const acceptInvitation = mutation({
  args: {
    inviteId: v.id('invitations'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const user = await ctx.db.get('users', userId);
    if (!user) {
      throw new ConvexError('USER_NOT_FOUND');
    }

    const invite = await ctx.db.get('invitations', args.inviteId);

    if (!invite) {
      throw new ConvexError('INVITATION_NOT_FOUND');
    }
    if (invite.status !== 'pending') {
      throw new ConvexError('INVITATION_NOT_PENDING');
    }
    if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
      throw new ConvexError(
        `This invitation is for ${invite.email}, but you are logged in as ${user.email}.`,
      );
    }
    if (invite.expiresAt < Date.now()) {
      await ctx.db.patch('invitations', invite._id, { status: 'expired' });
      throw new ConvexError('INVITATION_EXPIRED');
    }

    await ctx.db.patch('invitations', invite._id, {
      status: 'accepted',
      acceptedAt: Date.now(),
    });

    const existingMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', invite.organizationId).eq('userId', userId),
      )
      .first();

    if (!existingMembership) {
      await ctx.db.insert('members', {
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
      });
      await syncOrganizationRoleAssignment(
        ctx,
        invite.organizationId,
        userId,
        invite.role,
      );
    }

    return { success: true } as const;
  },
});

export const resendInvite = mutation({
  args: {
    token: v.id('invitations'),
  },
  handler: async (ctx, args) => {
    const inviterId = await requireAuthUser(ctx);
    const invite = await ctx.db.get('invitations', args.token);

    if (!invite) {
      throw new ConvexError('INVITE_NOT_FOUND');
    }

    await requireOrgPermission(
      ctx,
      invite.organizationId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await ctx.db.patch('invitations', invite._id, {
      expiresAt: expiresAt.getTime(),
    });

    const [org, existingUser, inviter] = await Promise.all([
      ctx.db.get('organizations', invite.organizationId),
      ctx.db
        .query('users')
        .withIndex('email', q => q.eq('email', invite.email.toLowerCase()))
        .first(),
      ctx.db.get('users', inviterId),
    ]);

    if (org) {
      await createNotificationEvent(ctx, {
        type: 'organization_invite',
        actorId: inviterId,
        organizationId: invite.organizationId,
        invitationId: invite._id,
        payload: {
          organizationName: org.name,
          inviterName:
            inviter?.name ?? inviter?.username ?? inviter?.email ?? 'Someone',
          roleLabel: invite.role,
          href: existingUser ? '/settings/invites' : '/auth/signup',
        },
        recipients: [
          {
            userId: existingUser?._id,
            email: invite.email,
          },
        ],
      });
    }
  },
});

export const removeMember = mutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    await requireOrgPermission(ctx, org._id, PERMISSIONS.ORG_MANAGE_MEMBERS);

    const member = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', args.userId),
      )
      .first();

    if (!member) {
      throw new ConvexError('MEMBER_NOT_FOUND');
    }

    if (member.role === 'owner') {
      throw new ConvexError('CANNOT_REMOVE_OWNER');
    }

    const orgAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', args.userId),
      )
      .collect();
    for (const assignment of orgAssignments) {
      await ctx.db.delete('roleAssignments', assignment._id);
    }

    const legacyOrgAssignments = await ctx.db
      .query('orgRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', args.userId))
      .collect();
    for (const assignment of legacyOrgAssignments) {
      if (assignment.organizationId === org._id) {
        await ctx.db.delete('orgRoleAssignments', assignment._id);
      }
    }

    const legacyTeamAssignments = await ctx.db
      .query('teamRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', args.userId))
      .collect();
    for (const assignment of legacyTeamAssignments) {
      const team = await ctx.db.get('teams', assignment.teamId);
      if (team?.organizationId === org._id) {
        await ctx.db.delete('teamRoleAssignments', assignment._id);
      }
    }

    const legacyProjectAssignments = await ctx.db
      .query('projectRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', args.userId))
      .collect();
    for (const assignment of legacyProjectAssignments) {
      const project = await ctx.db.get('projects', assignment.projectId);
      if (project?.organizationId === org._id) {
        await ctx.db.delete('projectRoleAssignments', assignment._id);
      }
    }

    const teamMemberships = await ctx.db
      .query('teamMembers')
      .withIndex('by_user', q => q.eq('userId', args.userId))
      .collect();
    for (const membership of teamMemberships) {
      const team = await ctx.db.get('teams', membership.teamId);
      if (team?.organizationId === org._id) {
        await ctx.db.delete('teamMembers', membership._id);
      }
    }

    const projectMemberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', q => q.eq('userId', args.userId))
      .collect();
    for (const membership of projectMemberships) {
      const project = await ctx.db.get('projects', membership.projectId);
      if (project?.organizationId === org._id) {
        await ctx.db.delete('projectMembers', membership._id);
      }
    }

    await ctx.db.delete('members', member._id);
  },
});

export const updateMemberRole = mutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    role: v.union(v.literal('member'), v.literal('admin')),
  },
  handler: async (ctx, args) => {
    await requireAuthUser(ctx);
    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    await requireOrgPermission(ctx, org._id, PERMISSIONS.ORG_MANAGE_MEMBERS);

    const member = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', args.userId),
      )
      .first();

    if (!member) {
      throw new ConvexError('MEMBER_NOT_FOUND');
    }

    if (member.role === 'owner') {
      throw new ConvexError('CANNOT_CHANGE_OWNER_ROLE');
    }

    await ctx.db.patch('members', member._id, { role: args.role });
    await syncOrganizationRoleAssignment(ctx, org._id, args.userId, args.role);
    return { success: true } as const;
  },
});

export const create = mutation({
  args: {
    data: v.object({
      name: v.string(),
      slug: v.string(),
      logo: v.optional(v.id('_storage')),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);

    if (!args.data.name.trim()) {
      throw new ConvexError('ORGANIZATION_NAME_REQUIRED');
    }
    if (!args.data.slug.trim()) {
      throw new ConvexError('ORGANIZATION_SLUG_REQUIRED');
    }
    if (args.data.name.length > 100) {
      throw new ConvexError('ORGANIZATION_NAME_TOO_LONG');
    }
    if (args.data.slug.length > 50) {
      throw new ConvexError('ORGANIZATION_SLUG_TOO_LONG');
    }

    const existingOrg = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.data.slug))
      .first();

    if (existingOrg) {
      throw new ConvexError('ORGANIZATION_SLUG_UNIQUE');
    }

    const orgId = await ctx.db.insert('organizations', {
      name: args.data.name.trim(),
      slug: args.data.slug.trim(),
      logo: args.data.logo,
      kanbanBorderTags: getDefaultKanbanBorderTags(),
    });

    await ctx.db.insert('members', {
      organizationId: orgId,
      userId,
      role: 'owner',
    });
    await syncOrganizationRoleAssignment(ctx, orgId, userId, 'owner');

    for (const state of ISSUE_STATE_DEFAULTS) {
      await ctx.db.insert('issueStates', {
        organizationId: orgId,
        name: state.name,
        position: state.position,
        color: state.color,
        icon: state.icon,
        type: state.type,
      });
    }

    for (const priority of ISSUE_PRIORITY_DEFAULTS) {
      await ctx.db.insert('issuePriorities', {
        organizationId: orgId,
        name: priority.name,
        weight: priority.weight,
        color: priority.color,
        icon: priority.icon,
      });
    }

    for (const status of PROJECT_STATUS_DEFAULTS) {
      await ctx.db.insert('projectStatuses', {
        organizationId: orgId,
        name: status.name,
        position: status.position,
        color: status.color,
        icon: status.icon,
        type: status.type,
      });
    }

    return { orgId } as const;
  },
});

export const update = mutation({
  args: {
    orgSlug: v.string(),
    data: v.object({
      name: v.optional(v.string()),
      slug: v.optional(v.string()),
      logo: v.optional(v.id('_storage')),
      subtitle: v.optional(v.union(v.string(), v.null())),
      publicDescription: v.optional(v.union(v.string(), v.null())),
      publicLandingViewId: v.optional(v.union(v.id('views'), v.null())),
      publicSocialLinks: v.optional(
        v.union(v.array(socialLinkValidator), v.null()),
      ),
      agentContext: v.optional(v.union(v.string(), v.null())),
      agentContextDocumentId: v.optional(v.union(v.id('documents'), v.null())),
    }),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    if (args.data.name && !args.data.name.trim()) {
      throw new ConvexError('ORGANIZATION_NAME_EMPTY');
    }
    if (args.data.name && args.data.name.length > 100) {
      throw new ConvexError('ORGANIZATION_NAME_TOO_LONG');
    }
    if (args.data.slug && !args.data.slug.trim()) {
      throw new ConvexError('ORGANIZATION_SLUG_EMPTY');
    }
    if (args.data.slug && args.data.slug.length > 50) {
      throw new ConvexError('ORGANIZATION_SLUG_TOO_LONG');
    }
    if (
      args.data.subtitle !== undefined &&
      args.data.subtitle !== null &&
      args.data.subtitle.trim().length > 120
    ) {
      throw new ConvexError('ORGANIZATION_SUBTITLE_TOO_LONG');
    }
    if (
      args.data.publicDescription !== undefined &&
      args.data.publicDescription !== null &&
      args.data.publicDescription.trim().length > 10_000
    ) {
      throw new ConvexError('PUBLIC_DESCRIPTION_TOO_LONG');
    }

    if (args.data?.slug && args.data.slug.trim() !== org.slug) {
      const existingOrg = await ctx.db
        .query('organizations')
        .withIndex('by_slug', q => q.eq('slug', args.data.slug!.trim()))
        .first();

      if (existingOrg) {
        throw new ConvexError('ORGANIZATION_SLUG_UNIQUE');
      }
    }

    if (args.data.publicLandingViewId) {
      const landingView = await ctx.db.get(
        'views',
        args.data.publicLandingViewId,
      );
      if (!landingView || landingView.organizationId !== org._id) {
        throw new ConvexError('PUBLIC_LANDING_VIEW_NOT_FOUND');
      }
      if (landingView.visibility !== 'public') {
        throw new ConvexError('PUBLIC_LANDING_VIEW_MUST_BE_PUBLIC');
      }
    }

    let normalizedSocialLinks:
      | Array<{
          platform: (typeof SOCIAL_LINK_PLATFORMS)[number];
          url: string;
        }>
      | undefined;
    if (args.data.publicSocialLinks !== undefined) {
      const socialLinks = args.data.publicSocialLinks ?? [];
      if (socialLinks.length > 6) {
        throw new ConvexError('TOO_MANY_PUBLIC_SOCIAL_LINKS');
      }

      const seenPlatforms = new Set<string>();
      normalizedSocialLinks = socialLinks.map(link => {
        if (seenPlatforms.has(link.platform)) {
          throw new ConvexError('DUPLICATE_PUBLIC_SOCIAL_LINK');
        }
        seenPlatforms.add(link.platform);

        const normalizedUrl = normalizeSocialLinkUrl(link.url);
        if (!normalizedUrl) {
          throw new ConvexError(`INVALID_PUBLIC_SOCIAL_LINK:${link.platform}`);
        }

        return {
          platform: link.platform,
          url: normalizedUrl,
        };
      });
    }

    const updateData: Record<string, unknown> = {};

    if (args.data.name !== undefined) {
      updateData.name = args.data.name.trim();
    }
    if (args.data.slug !== undefined) {
      updateData.slug = args.data.slug.trim();
    }
    if (args.data.logo !== undefined) {
      updateData.logo = args.data.logo;
    }
    if (args.data.subtitle !== undefined) {
      const trimmed = args.data.subtitle?.trim() ?? '';
      updateData.subtitle = trimmed || undefined;
    }
    if (args.data.publicDescription !== undefined) {
      const trimmed = args.data.publicDescription?.trim() ?? '';
      updateData.publicDescription = trimmed || undefined;
    }
    if (args.data.publicLandingViewId !== undefined) {
      updateData.publicLandingViewId =
        args.data.publicLandingViewId ?? undefined;
    }
    if (args.data.publicSocialLinks !== undefined) {
      updateData.publicSocialLinks =
        normalizedSocialLinks && normalizedSocialLinks.length > 0
          ? normalizedSocialLinks
          : undefined;
    }
    if (args.data.agentContext !== undefined) {
      const trimmed = args.data.agentContext?.trim() ?? '';
      updateData.agentContext = trimmed || undefined;
    }
    if (args.data.agentContextDocumentId !== undefined) {
      if (args.data.agentContextDocumentId) {
        const doc = await ctx.db.get(
          'documents',
          args.data.agentContextDocumentId,
        );
        if (!doc || doc.organizationId !== org._id) {
          throw new ConvexError('DOCUMENT_NOT_FOUND');
        }
      }
      updateData.agentContextDocumentId =
        args.data.agentContextDocumentId ?? undefined;
    }

    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch('organizations', org._id, updateData);
    }

    return { success: true } as const;
  },
});

export const createIssuePriority = mutation({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    weight: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const id = await ctx.db.insert('issuePriorities', {
      organizationId: org._id,
      name: args.name,
      weight: args.weight,
      color: args.color,
      icon: args.icon,
    });

    return { id } as const;
  },
});

export const updateIssuePriority = mutation({
  args: {
    orgSlug: v.string(),
    priorityId: v.id('issuePriorities'),
    name: v.string(),
    weight: v.optional(v.number()),
    color: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const priority = await ctx.db.get('issuePriorities', args.priorityId);
    if (!priority || priority.organizationId !== org._id) {
      throw new ConvexError('PRIORITY_NOT_FOUND');
    }

    await ctx.db.patch('issuePriorities', args.priorityId, {
      name: args.name,
      weight: args.weight,
      color: args.color,
      icon: args.icon,
    });
  },
});

export const resetIssuePriorities = mutation({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const priorities = await ctx.db
      .query('issuePriorities')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    for (const p of priorities) {
      await ctx.db.delete('issuePriorities', p._id);
    }

    for (const priority of ISSUE_PRIORITY_DEFAULTS) {
      await ctx.db.insert('issuePriorities', {
        organizationId: org._id,
        name: priority.name,
        weight: priority.weight,
        color: priority.color,
        icon: priority.icon,
      });
    }
  },
});

export const updateKanbanBorderTag = mutation({
  args: {
    orgSlug: v.string(),
    tagId: kanbanBorderTagValidator,
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const normalizedTags = normalizeKanbanBorderTags(org.kanbanBorderTags);
    const trimmedName = args.name.trim();

    await ctx.db.patch('organizations', org._id, {
      kanbanBorderTags: normalizedTags.map(tag =>
        tag.id === args.tagId
          ? {
              ...tag,
              name: trimmedName,
              color: args.color.trim() || tag.color,
            }
          : tag,
      ),
    });
  },
});

export const resetKanbanBorderTags = mutation({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    await ctx.db.patch('organizations', org._id, {
      kanbanBorderTags: getDefaultKanbanBorderTags(),
    });
  },
});

export const deleteIssuePriority = mutation({
  args: {
    orgSlug: v.string(),
    priorityId: v.id('issuePriorities'),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const priority = await ctx.db.get('issuePriorities', args.priorityId);
    if (!priority || priority.organizationId !== org._id) {
      throw new ConvexError('PRIORITY_NOT_FOUND');
    }

    await ctx.db.delete('issuePriorities', args.priorityId);
  },
});

export const createIssueState = mutation({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    position: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal('backlog'),
      v.literal('todo'),
      v.literal('in_progress'),
      v.literal('done'),
      v.literal('canceled'),
    ),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const id = await ctx.db.insert('issueStates', {
      organizationId: org._id,
      name: args.name,
      position: args.position,
      color: args.color,
      icon: args.icon,
      type: args.type,
    });

    return { id } as const;
  },
});

export const updateIssueState = mutation({
  args: {
    orgSlug: v.string(),
    stateId: v.id('issueStates'),
    name: v.string(),
    position: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal('backlog'),
      v.literal('todo'),
      v.literal('in_progress'),
      v.literal('done'),
      v.literal('canceled'),
    ),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const state = await ctx.db.get('issueStates', args.stateId);
    if (!state || state.organizationId !== org._id) {
      throw new ConvexError('STATE_NOT_FOUND');
    }

    await ctx.db.patch('issueStates', args.stateId, {
      name: args.name,
      position: args.position,
      color: args.color,
      icon: args.icon,
      type: args.type,
    });
  },
});

export const createProjectStatus = mutation({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    position: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal('backlog'),
      v.literal('planned'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('canceled'),
    ),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const id = await ctx.db.insert('projectStatuses', {
      organizationId: org._id,
      name: args.name,
      position: args.position,
      color: args.color,
      icon: args.icon,
      type: args.type,
    });

    return { id } as const;
  },
});

export const updateProjectStatus = mutation({
  args: {
    orgSlug: v.string(),
    statusId: v.id('projectStatuses'),
    name: v.string(),
    position: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal('backlog'),
      v.literal('planned'),
      v.literal('in_progress'),
      v.literal('completed'),
      v.literal('canceled'),
    ),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const status = await ctx.db.get('projectStatuses', args.statusId);
    if (!status || status.organizationId !== org._id) {
      throw new ConvexError('STATUS_NOT_FOUND');
    }

    await ctx.db.patch('projectStatuses', args.statusId, {
      name: args.name,
      position: args.position,
      color: args.color,
      icon: args.icon,
      type: args.type,
    });
  },
});

export const deleteIssueState = mutation({
  args: {
    orgSlug: v.string(),
    stateId: v.id('issueStates'),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const state = await ctx.db.get('issueStates', args.stateId);
    if (!state || state.organizationId !== org._id) {
      throw new ConvexError('STATE_NOT_FOUND');
    }

    await ctx.db.delete('issueStates', args.stateId);
  },
});

export const deleteProjectStatus = mutation({
  args: {
    orgSlug: v.string(),
    statusId: v.id('projectStatuses'),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const status = await ctx.db.get('projectStatuses', args.statusId);
    if (!status || status.organizationId !== org._id) {
      throw new ConvexError('STATUS_NOT_FOUND');
    }

    await ctx.db.delete('projectStatuses', args.statusId);
  },
});

export const resetIssueStates = mutation({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const states = await ctx.db
      .query('issueStates')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    for (const s of states) {
      await ctx.db.delete('issueStates', s._id);
    }

    for (const state of ISSUE_STATE_DEFAULTS) {
      await ctx.db.insert('issueStates', {
        organizationId: org._id,
        name: state.name,
        position: state.position,
        color: state.color,
        icon: state.icon,
        type: state.type,
      });
    }
  },
});

export const resetProjectStatuses = mutation({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    const statuses = await ctx.db
      .query('projectStatuses')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    for (const s of statuses) {
      await ctx.db.delete('projectStatuses', s._id);
    }

    for (const status of PROJECT_STATUS_DEFAULTS) {
      await ctx.db.insert('projectStatuses', {
        organizationId: org._id,
        name: status.name,
        position: status.position,
        color: status.color,
        icon: status.icon,
        type: status.type,
      });
    }
  },
});

export const invite = mutation({
  args: {
    orgSlug: v.string(),
    email: v.string(),
    role: v.union(v.literal('member'), v.literal('admin')),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const existingUser = await ctx.db
      .query('users')
      .withIndex('email', q => q.eq('email', args.email))
      .first();

    if (existingUser) {
      const existingMembership = await ctx.db
        .query('members')
        .withIndex('by_org_user', q =>
          q.eq('organizationId', org._id).eq('userId', existingUser._id),
        )
        .first();

      if (existingMembership) {
        throw new ConvexError('USER_ALREADY_MEMBER');
      }
    }

    const inviteId = await ctx.db.insert('invitations', {
      organizationId: org._id,
      email: args.email.toLowerCase(),
      role: args.role,
      status: 'pending',
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      inviterId: userId,
    });

    const inviter = await ctx.db.get('users', userId);

    await createNotificationEvent(ctx, {
      type: 'organization_invite',
      actorId: userId,
      organizationId: org._id,
      invitationId: inviteId,
      payload: {
        organizationName: org.name,
        inviterName:
          inviter?.name ?? inviter?.username ?? inviter?.email ?? 'Someone',
        roleLabel: args.role,
        href: existingUser ? '/settings/invites' : '/auth/signup',
      },
      recipients: [
        {
          userId: existingUser?._id,
          email: args.email,
        },
      ],
    });

    return { inviteId } as const;
  },
});

export const generateLogoUploadUrl = mutation({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOrgAccess(ctx, args.orgSlug, PERMISSIONS.ORG_MANAGE_SETTINGS);

    return await ctx.storage.generateUploadUrl();
  },
});

export const updateLogoWithStorageId = mutation({
  args: {
    orgSlug: v.string(),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgAccess(
      ctx,
      args.orgSlug,
      PERMISSIONS.ORG_MANAGE_SETTINGS,
    );

    await ctx.db.patch('organizations', org._id, {
      logo: args.storageId,
    });

    return { success: true } as const;
  },
});
