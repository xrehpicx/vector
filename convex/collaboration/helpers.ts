import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { PERMISSIONS, type Permission } from '../_shared/permissions';
import {
  getOrganizationBySlug,
  hasScopedPermission,
  requireAuthUser,
  requireOrganizationMember,
  requireOrgPermission,
} from '../authz';
import { canViewDocument, canViewIssue, canViewProject } from '../access';
import { canViewRequest } from '../requests/lib';

export const MAX_CHANNELS = 200;
export const MAX_CHANNEL_MEMBERS = 500;
export const MAX_MESSAGES = 100;
export const MAX_REACTIONS_PER_MESSAGE = 200;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_AGENTS_PER_CHANNEL = 100;
export const MAX_AGENT_RUNS = 100;
export const MAX_RUN_EVENTS = 200;
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const DEVICE_ONLINE_WINDOW_MS = 120_000;

type DbCtx = QueryCtx | MutationCtx;

export function boundedLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new ConvexError(`LIMIT_MUST_BE_BETWEEN_1_AND_${maximum}`);
  }
  return value;
}

export function cleanRequired(
  value: string,
  field: string,
  maximum: number,
): string {
  const cleaned = value.trim();
  if (!cleaned) throw new ConvexError(`${field}_REQUIRED`);
  if (cleaned.length > maximum) {
    throw new ConvexError(`${field}_TOO_LONG`);
  }
  return cleaned;
}

export function cleanOptional(
  value: string | null | undefined,
  field: string,
  maximum: number,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  if (cleaned.length > maximum) {
    throw new ConvexError(`${field}_TOO_LONG`);
  }
  return cleaned;
}

export function normalizeChannelSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (!slug) throw new ConvexError('CHANNEL_SLUG_REQUIRED');
  return slug;
}

export function normalizeAgentHandle(value: string): string {
  const handle = value.trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(handle)) {
    throw new ConvexError('INVALID_AGENT_HANDLE');
  }
  return handle;
}

export function toUserSummary(user: Doc<'users'> | null) {
  return user
    ? {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        image: user.image,
      }
    : null;
}

export async function requireOrgContext(
  ctx: DbCtx,
  orgSlug: string,
  permission?: Permission,
) {
  const userId = await requireAuthUser(ctx);
  const organization = await getOrganizationBySlug(ctx, orgSlug);
  const membership = await requireOrganizationMember(
    ctx,
    organization._id,
    userId,
  );
  if (permission) {
    await requireOrgPermission(ctx, organization._id, permission);
  }
  return { userId, organization, membership };
}

export async function getChannelMembership(
  ctx: DbCtx,
  channelId: Id<'channels'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('channelMembers')
    .withIndex('by_channel_id_and_user_id', q =>
      q.eq('channelId', channelId).eq('userId', userId),
    )
    .first();
}

export async function canUserAccessChannel(
  ctx: DbCtx,
  channel: Doc<'channels'>,
  userId: Id<'users'>,
): Promise<boolean> {
  const orgMembership = await ctx.db
    .query('members')
    .withIndex('by_org_user', q =>
      q.eq('organizationId', channel.organizationId).eq('userId', userId),
    )
    .first();
  if (!orgMembership) return false;

  const canView = await hasScopedPermission(
    ctx,
    { organizationId: channel.organizationId },
    userId,
    PERMISSIONS.CHANNEL_VIEW,
  );
  if (!canView) return false;

  if (channel.kind === 'public' || channel.kind === 'announcement') {
    return true;
  }

  return Boolean(await getChannelMembership(ctx, channel._id, userId));
}

export async function requireChannelAccess(
  ctx: DbCtx,
  channelId: Id<'channels'>,
  options?: { includeArchived?: boolean },
) {
  const userId = await requireAuthUser(ctx);
  const channel = await ctx.db.get('channels', channelId);
  if (!channel) throw new ConvexError('CHANNEL_NOT_FOUND');
  if (channel.archivedAt && !options?.includeArchived) {
    throw new ConvexError('CHANNEL_ARCHIVED');
  }
  if (!(await canUserAccessChannel(ctx, channel, userId))) {
    throw new ConvexError('FORBIDDEN');
  }
  const membership = await getChannelMembership(ctx, channelId, userId);
  return { userId, channel, membership };
}

export async function requireChannelPermission(
  ctx: DbCtx,
  channelId: Id<'channels'>,
  permission: Permission,
  options?: { includeArchived?: boolean },
) {
  const access = await requireChannelAccess(ctx, channelId, options);
  const allowed = await hasScopedPermission(
    ctx,
    { organizationId: access.channel.organizationId },
    access.userId,
    permission,
  );
  if (!allowed) throw new ConvexError('FORBIDDEN');
  return access;
}

export async function requireChannelManager(
  ctx: DbCtx,
  channelId: Id<'channels'>,
  permission: Permission = PERMISSIONS.CHANNEL_MANAGE_MEMBERS,
) {
  const access = await requireChannelAccess(ctx, channelId, {
    includeArchived: true,
  });
  const channelRoleAllowed =
    access.membership?.role === 'owner' ||
    access.membership?.role === 'moderator';
  if (channelRoleAllowed) return access;
  const [globallyAllowed, specificallyAllowed] = await Promise.all([
    hasScopedPermission(
      ctx,
      { organizationId: access.channel.organizationId },
      access.userId,
      PERMISSIONS.CHANNEL_MANAGE_MEMBERS,
    ),
    hasScopedPermission(
      ctx,
      { organizationId: access.channel.organizationId },
      access.userId,
      permission,
    ),
  ]);
  if (!globallyAllowed || !specificallyAllowed) {
    throw new ConvexError('FORBIDDEN');
  }
  return access;
}

export async function ensureChannelMembership(
  ctx: MutationCtx,
  channel: Doc<'channels'>,
  userId: Id<'users'>,
  defaults?: {
    role?: Doc<'channelMembers'>['role'];
    notificationMode?: Doc<'channelMembers'>['notificationMode'];
  },
) {
  const existing = await getChannelMembership(ctx, channel._id, userId);
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert('channelMembers', {
    organizationId: channel.organizationId,
    channelId: channel._id,
    userId,
    role: defaults?.role ?? 'member',
    notificationMode: defaults?.notificationMode ?? 'mentions',
    joinedAt: now,
  });
  const created = await ctx.db.get('channelMembers', id);
  if (!created) throw new ConvexError('CHANNEL_MEMBERSHIP_CREATE_FAILED');
  return created;
}

export async function requireMessageAccess(
  ctx: DbCtx,
  messageId: Id<'channelMessages'>,
) {
  const message = await ctx.db.get('channelMessages', messageId);
  if (!message) throw new ConvexError('MESSAGE_NOT_FOUND');
  const access = await requireChannelAccess(ctx, message.channelId, {
    includeArchived: true,
  });
  return { ...access, message };
}

export async function getAgentChannelMembership(
  ctx: DbCtx,
  channelId: Id<'channels'>,
  agentId: Id<'registeredAgents'>,
) {
  return await ctx.db
    .query('agentChannelMemberships')
    .withIndex('by_channel_id_and_agent_id', q =>
      q.eq('channelId', channelId).eq('agentId', agentId),
    )
    .first();
}

export async function hasAgentInteractionAccess(
  ctx: DbCtx,
  agent: Doc<'registeredAgents'>,
  userId: Id<'users'>,
  channel?: Doc<'channels'>,
): Promise<boolean> {
  const hasPermission = await hasScopedPermission(
    ctx,
    { organizationId: agent.organizationId },
    userId,
    PERMISSIONS.AGENT_INTERACT,
  );
  if (!hasPermission) return false;
  if (agent.ownerUserId === userId) return true;

  if (agent.interactionPolicy === 'owner_only') return false;
  if (agent.interactionPolicy === 'selected_users') {
    const grant = await ctx.db
      .query('agentAccessGrants')
      .withIndex('by_agent_id_and_user_id', q =>
        q.eq('agentId', agent._id).eq('userId', userId),
      )
      .first();
    return Boolean(grant?.canInteract);
  }

  return channel
    ? await canUserAccessChannel(ctx, channel, userId)
    : Boolean(
        await ctx.db
          .query('members')
          .withIndex('by_org_user', q =>
            q.eq('organizationId', agent.organizationId).eq('userId', userId),
          )
          .first(),
      );
}

export async function hasAgentControlAccess(
  ctx: DbCtx,
  agent: Doc<'registeredAgents'>,
  userId: Id<'users'>,
): Promise<boolean> {
  if (agent.ownerUserId === userId) {
    const canEditOwn = await hasScopedPermission(
      ctx,
      { organizationId: agent.organizationId },
      userId,
      PERMISSIONS.AGENT_EDIT_OWN,
    );
    return canEditOwn;
  }
  const canControl = await hasScopedPermission(
    ctx,
    { organizationId: agent.organizationId },
    userId,
    PERMISSIONS.AGENT_CONTROL,
  );
  if (!canControl) return false;

  const canManage = await hasScopedPermission(
    ctx,
    { organizationId: agent.organizationId },
    userId,
    PERMISSIONS.AGENT_MANAGE,
  );
  if (canManage) return true;

  const grant = await ctx.db
    .query('agentAccessGrants')
    .withIndex('by_agent_id_and_user_id', q =>
      q.eq('agentId', agent._id).eq('userId', userId),
    )
    .first();
  return Boolean(grant?.canControl);
}

export async function requireAgentEditor(
  ctx: DbCtx,
  agentId: Id<'registeredAgents'>,
) {
  const userId = await requireAuthUser(ctx);
  const agent = await ctx.db.get('registeredAgents', agentId);
  if (!agent) throw new ConvexError('AGENT_NOT_FOUND');
  await requireOrganizationMember(ctx, agent.organizationId, userId);

  const permission =
    agent.ownerUserId === userId
      ? PERMISSIONS.AGENT_EDIT_OWN
      : PERMISSIONS.AGENT_MANAGE;
  const allowed = await hasScopedPermission(
    ctx,
    { organizationId: agent.organizationId },
    userId,
    permission,
  );
  if (!allowed) throw new ConvexError('FORBIDDEN');
  return { userId, agent };
}

export function validateFolderWithinWorkspace(
  workspacePath: string,
  requestedFolder: string,
): string {
  const base = workspacePath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const folder = requestedFolder.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!base || !folder || !folder.startsWith('/') || folder.includes('/../')) {
    throw new ConvexError('INVALID_DEFAULT_FOLDER');
  }
  if (folder !== base && !folder.startsWith(`${base}/`)) {
    throw new ConvexError('DEFAULT_FOLDER_OUTSIDE_WORKSPACE');
  }
  return folder;
}

export async function validateDeviceWorkspace(
  ctx: DbCtx,
  ownerUserId: Id<'users'>,
  organizationId: Id<'organizations'>,
  deviceId: Id<'agentDevices'>,
  workspaceId: Id<'deviceWorkspaces'>,
  defaultFolder: string,
) {
  const [device, workspace] = await Promise.all([
    ctx.db.get('agentDevices', deviceId),
    ctx.db.get('deviceWorkspaces', workspaceId),
  ]);
  if (!device || device.userId !== ownerUserId) {
    throw new ConvexError('INVALID_AGENT_DEVICE');
  }
  if (
    !workspace ||
    workspace.deviceId !== deviceId ||
    workspace.userId !== ownerUserId
  ) {
    throw new ConvexError('INVALID_AGENT_WORKSPACE');
  }
  if (workspace.projectId) {
    const project = await ctx.db.get('projects', workspace.projectId);
    if (!project || project.organizationId !== organizationId) {
      throw new ConvexError('INVALID_AGENT_WORKSPACE_PROJECT');
    }
  }
  if (workspace.teamId) {
    const team = await ctx.db.get('teams', workspace.teamId);
    if (!team || team.organizationId !== organizationId) {
      throw new ConvexError('INVALID_AGENT_WORKSPACE_TEAM');
    }
  }
  if (workspace.launchPolicy !== 'allow_delegated') {
    throw new ConvexError('WORKSPACE_DOES_NOT_ALLOW_DELEGATED_RUNS');
  }
  return {
    device,
    workspace,
    defaultFolder: validateFolderWithinWorkspace(workspace.path, defaultFolder),
  };
}

export async function validateMentionIds(
  ctx: MutationCtx,
  channel: Doc<'channels'>,
  senderUserId: Id<'users'>,
  mentionedUserIds: Id<'users'>[],
  mentionedAgentIds: Id<'registeredAgents'>[],
) {
  const uniqueUsers = [...new Set(mentionedUserIds)];
  const uniqueAgents = [...new Set(mentionedAgentIds)];
  if (uniqueUsers.length > 50 || uniqueAgents.length > 20) {
    throw new ConvexError('TOO_MANY_MENTIONS');
  }

  for (const userId of uniqueUsers) {
    await requireOrganizationMember(ctx, channel.organizationId, userId);
    if (
      channel.kind !== 'public' &&
      channel.kind !== 'announcement' &&
      !(await getChannelMembership(ctx, channel._id, userId))
    ) {
      throw new ConvexError('MENTIONED_USER_CANNOT_VIEW_CHANNEL');
    }
  }

  for (const agentId of uniqueAgents) {
    const agent = await ctx.db.get('registeredAgents', agentId);
    if (!agent || agent.organizationId !== channel.organizationId) {
      throw new ConvexError('MENTIONED_AGENT_NOT_FOUND');
    }
    if (!(await getAgentChannelMembership(ctx, channel._id, agentId))) {
      throw new ConvexError('MENTIONED_AGENT_NOT_IN_CHANNEL');
    }
    if (!(await hasAgentInteractionAccess(ctx, agent, senderUserId, channel))) {
      throw new ConvexError('AGENT_INTERACTION_FORBIDDEN');
    }
  }

  return {
    mentionedUserIds: uniqueUsers,
    mentionedAgentIds: uniqueAgents,
  };
}

export async function createAgentRunForMessage(
  ctx: MutationCtx,
  message: Doc<'channelMessages'>,
  agent: Doc<'registeredAgents'>,
  requestedByUserId: Id<'users'>,
) {
  const existing = await ctx.db
    .query('collaborationAgentRuns')
    .withIndex('by_trigger_message_id_and_agent_id', q =>
      q.eq('triggerMessageId', message._id).eq('agentId', agent._id),
    )
    .first();
  if (existing) return existing._id;

  const [channel, device, workspace] = await Promise.all([
    ctx.db.get('channels', message.channelId),
    ctx.db.get('agentDevices', agent.deviceId),
    ctx.db.get('deviceWorkspaces', agent.workspaceId),
  ]);
  if (!channel || channel.organizationId !== agent.organizationId) {
    throw new ConvexError('CHANNEL_NOT_FOUND');
  }
  if (
    !(await hasAgentInteractionAccess(ctx, agent, requestedByUserId, channel))
  ) {
    throw new ConvexError('AGENT_INTERACTION_FORBIDDEN');
  }

  const now = Date.now();
  const connected =
    agent.lifecycleStatus === 'ready' &&
    agent.permissionMode !== 'bypass' &&
    device?.userId === agent.ownerUserId &&
    device.status === 'online' &&
    device.lastSeenAt >= now - DEVICE_ONLINE_WINDOW_MS &&
    workspace?.deviceId === agent.deviceId &&
    workspace.userId === agent.ownerUserId &&
    workspace.launchPolicy === 'allow_delegated' &&
    (agent.defaultFolder === workspace.path ||
      agent.defaultFolder.startsWith(`${workspace.path.replace(/\/+$/, '')}/`));

  const runId = await ctx.db.insert('collaborationAgentRuns', {
    organizationId: agent.organizationId,
    agentId: agent._id,
    channelId: message.channelId,
    triggerMessageId: message._id,
    threadRootId: message.threadRootId,
    requestedByUserId,
    deviceId: agent.deviceId,
    workspaceId: agent.workspaceId,
    status: connected ? 'queued' : 'offline',
    currentActivity: connected ? 'Queued on local device' : 'Agent is offline',
    error: connected ? undefined : 'AGENT_CONNECTION_UNAVAILABLE',
    completedAt: connected ? undefined : now,
    createdAt: now,
    updatedAt: now,
  });

  if (connected) {
    const { contextMessages, linkedEntities } =
      await buildAgentConversationContext(ctx, message);
    await ctx.db.insert('agentCommands', {
      deviceId: agent.deviceId,
      collaborationRunId: runId,
      registeredAgentId: agent._id,
      senderUserId: requestedByUserId,
      kind: 'collaboration_prompt',
      payload: {
        channelId: message.channelId,
        threadRootId: message.threadRootId,
        triggerMessageId: message._id,
        body: message.body,
        workspacePath: agent.defaultFolder,
        provider: agent.provider,
        model: agent.model,
        permissionMode: agent.permissionMode,
        thinkingLevel: agent.thinkingLevel,
        contextMessages,
        linkedEntities,
      },
      status: 'pending',
      createdAt: now,
    });
  }

  return runId;
}

export async function createAutomaticRunsForMessage(
  ctx: MutationCtx,
  message: Doc<'channelMessages'>,
  requestedByUserId: Id<'users'>,
) {
  const memberships = await ctx.db
    .query('agentChannelMemberships')
    .withIndex('by_channel_id', q => q.eq('channelId', message.channelId))
    .take(MAX_AGENTS_PER_CHANNEL);
  const mentioned = new Set(message.mentionedAgentIds);
  const runIds: Id<'collaborationAgentRuns'>[] = [];
  const channel = await ctx.db.get('channels', message.channelId);
  if (!channel) throw new ConvexError('CHANNEL_NOT_FOUND');

  for (const membership of memberships) {
    const shouldWake =
      membership.wakeMode === 'every_message' ||
      (membership.wakeMode === 'mentions' && mentioned.has(membership.agentId));
    if (!shouldWake) continue;
    const agent = await ctx.db.get('registeredAgents', membership.agentId);
    if (!agent || agent.organizationId !== message.organizationId) continue;
    if (
      !(await hasAgentInteractionAccess(ctx, agent, requestedByUserId, channel))
    ) {
      continue;
    }
    runIds.push(
      await createAgentRunForMessage(ctx, message, agent, requestedByUserId),
    );
  }
  return runIds;
}

async function actorLabelForMessage(
  ctx: MutationCtx,
  message: Doc<'channelMessages'>,
) {
  if (message.authorUserId) {
    const user = await ctx.db.get('users', message.authorUserId);
    return (
      user?.name?.trim() ||
      user?.username?.trim() ||
      'Workspace member'
    ).slice(0, 80);
  }
  if (message.authorAgentId) {
    const agent = await ctx.db.get('registeredAgents', message.authorAgentId);
    return (agent?.name ?? 'Agent').slice(0, 80);
  }
  return 'System';
}

async function resolveLinkedEntitySummary(
  ctx: MutationCtx,
  link: Doc<'messageEntityLinks'>,
) {
  switch (link.entityType) {
    case 'request': {
      const id = ctx.db.normalizeId('requests', link.entityId);
      const request = id ? await ctx.db.get('requests', id) : null;
      if (!request || !(await canViewRequest(ctx, request))) return null;
      return {
        entityType: link.entityType,
        entityId: link.entityId,
        label: `${request.key}: ${request.title}`.slice(0, 240),
      };
    }
    case 'issue': {
      const id = ctx.db.normalizeId('issues', link.entityId);
      const issue = id ? await ctx.db.get('issues', id) : null;
      if (!issue || !(await canViewIssue(ctx, issue))) return null;
      return {
        entityType: link.entityType,
        entityId: link.entityId,
        label: `${issue.key}: ${issue.title}`.slice(0, 240),
      };
    }
    case 'task': {
      const id = ctx.db.normalizeId('tasks', link.entityId);
      const task = id ? await ctx.db.get('tasks', id) : null;
      const work = task ? await ctx.db.get('issues', task.workId) : null;
      if (!task || !work || !(await canViewIssue(ctx, work))) return null;
      return {
        entityType: link.entityType,
        entityId: link.entityId,
        label: `${work.key} · Task ${task.number}: ${task.title}`.slice(0, 240),
      };
    }
    case 'project': {
      const id = ctx.db.normalizeId('projects', link.entityId);
      const project = id ? await ctx.db.get('projects', id) : null;
      if (!project || !(await canViewProject(ctx, project))) return null;
      return {
        entityType: link.entityType,
        entityId: link.entityId,
        label: `${project.key}: ${project.name}`.slice(0, 240),
      };
    }
    case 'document': {
      const id = ctx.db.normalizeId('documents', link.entityId);
      const document = id ? await ctx.db.get('documents', id) : null;
      if (!document || !(await canViewDocument(ctx, document))) return null;
      return {
        entityType: link.entityType,
        entityId: link.entityId,
        label: document.title.slice(0, 240),
      };
    }
  }
}

async function buildAgentConversationContext(
  ctx: MutationCtx,
  trigger: Doc<'channelMessages'>,
) {
  let context: Doc<'channelMessages'>[];
  if (trigger.threadRootId) {
    const [root, replies] = await Promise.all([
      ctx.db.get('channelMessages', trigger.threadRootId),
      ctx.db
        .query('channelMessages')
        .withIndex('by_thread_root_id_and_created_at', q =>
          q.eq('threadRootId', trigger.threadRootId),
        )
        .order('desc')
        .take(19),
    ]);
    context = [...(root ? [root] : []), ...replies.reverse()];
  } else {
    context = (
      await ctx.db
        .query('channelMessages')
        .withIndex('by_channel_id_and_thread_root_id_and_created_at', q =>
          q.eq('channelId', trigger.channelId).eq('threadRootId', undefined),
        )
        .order('desc')
        .take(20)
    ).reverse();
  }

  const contextMessages = [];
  for (const item of context) {
    if (item.deletedAt) continue;
    const attachments = await ctx.db
      .query('messageAttachments')
      .withIndex('by_message_id', q => q.eq('messageId', item._id))
      .take(MAX_ATTACHMENTS_PER_MESSAGE);
    const resolvedAttachments = [];
    for (const attachment of attachments) {
      const url = await ctx.storage.getUrl(attachment.storageId);
      if (url) {
        resolvedAttachments.push({
          name: attachment.name.slice(0, 255),
          contentType: attachment.contentType.slice(0, 160),
          url,
        });
      }
    }
    contextMessages.push({
      messageId: item._id,
      actorKind: item.actorKind,
      actorLabel: await actorLabelForMessage(ctx, item),
      body: item.body.slice(0, 2_000),
      attachmentNames: attachments.map(attachment =>
        attachment.name.slice(0, 255),
      ),
      attachments:
        resolvedAttachments.length > 0 ? resolvedAttachments : undefined,
      createdAt: item.createdAt,
    });
  }

  const links = await ctx.db
    .query('messageEntityLinks')
    .withIndex('by_message_id', q => q.eq('messageId', trigger._id))
    .take(10);
  const linkedEntities = [];
  for (const link of links) {
    const summary = await resolveLinkedEntitySummary(ctx, link);
    if (summary) linkedEntities.push(summary);
  }
  return { contextMessages, linkedEntities };
}
