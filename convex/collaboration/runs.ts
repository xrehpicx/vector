import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { mutation, query } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { PERMISSIONS } from '../_shared/permissions';
import {
  createAgentRunForMessage,
  getAgentChannelMembership,
  hasAgentControlAccess,
  hasAgentInteractionAccess,
  requireChannelAccess,
  requireMessageAccess,
  requireOrgContext,
} from './helpers';
import {
  collaborationRunEventValidator,
  collaborationRunValidator,
} from './validators';

async function requireRunAccess(
  ctx: Parameters<typeof requireChannelAccess>[0],
  runId: Id<'collaborationAgentRuns'>,
) {
  const run = await ctx.db.get('collaborationAgentRuns', runId);
  if (!run) throw new ConvexError('COLLABORATION_RUN_NOT_FOUND');
  const access = await requireChannelAccess(ctx, run.channelId, {
    includeArchived: true,
  });
  const organization = await ctx.db.get('organizations', run.organizationId);
  if (!organization) throw new ConvexError('ORGANIZATION_NOT_FOUND');
  await requireOrgContext(ctx, organization.slug, PERMISSIONS.AGENT_VIEW);
  return { ...access, run };
}

export const trigger = mutation({
  args: {
    messageId: v.id('channelMessages'),
    agentId: v.id('registeredAgents'),
  },
  returns: v.id('collaborationAgentRuns'),
  handler: async (ctx, args) => {
    const { userId, channel, membership, message } = await requireMessageAccess(
      ctx,
      args.messageId,
    );
    if (!membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    if (message.actorKind !== 'user' || message.deletedAt) {
      throw new ConvexError('AGENT_TRIGGER_REQUIRES_USER_MESSAGE');
    }
    const agent = await ctx.db.get('registeredAgents', args.agentId);
    if (!agent || agent.organizationId !== channel.organizationId) {
      throw new ConvexError('AGENT_NOT_FOUND');
    }
    if (!(await getAgentChannelMembership(ctx, channel._id, agent._id))) {
      throw new ConvexError('AGENT_NOT_IN_CHANNEL');
    }
    if (!(await hasAgentInteractionAccess(ctx, agent, userId, channel))) {
      throw new ConvexError('AGENT_INTERACTION_FORBIDDEN');
    }
    return await createAgentRunForMessage(ctx, message, agent, userId);
  },
});

export const get = query({
  args: { runId: v.id('collaborationAgentRuns') },
  returns: collaborationRunValidator,
  handler: async (ctx, args) => {
    return (await requireRunAccess(ctx, args.runId)).run;
  },
});

export const listChannel = query({
  args: {
    channelId: v.id('channels'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(collaborationRunValidator),
  handler: async (ctx, args) => {
    await requireChannelAccess(ctx, args.channelId, { includeArchived: true });
    return await ctx.db
      .query('collaborationAgentRuns')
      .withIndex('by_channel_id_and_created_at', q =>
        q.eq('channelId', args.channelId),
      )
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const listAgent = query({
  args: {
    agentId: v.id('registeredAgents'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(collaborationRunValidator),
  handler: async (ctx, args) => {
    const agent = await ctx.db.get('registeredAgents', args.agentId);
    if (!agent) throw new ConvexError('AGENT_NOT_FOUND');
    const organization = await ctx.db.get(
      'organizations',
      agent.organizationId,
    );
    if (!organization) throw new ConvexError('ORGANIZATION_NOT_FOUND');
    const { userId } = await requireOrgContext(
      ctx,
      organization.slug,
      PERMISSIONS.AGENT_VIEW,
    );
    if (!(await hasAgentControlAccess(ctx, agent, userId))) {
      throw new ConvexError('AGENT_CONTROL_FORBIDDEN');
    }
    return await ctx.db
      .query('collaborationAgentRuns')
      .withIndex('by_agent_id', q => q.eq('agentId', agent._id))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const listEvents = query({
  args: {
    runId: v.id('collaborationAgentRuns'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(collaborationRunEventValidator),
  handler: async (ctx, args) => {
    await requireRunAccess(ctx, args.runId);
    return await ctx.db
      .query('collaborationRunEvents')
      .withIndex('by_run_id_and_created_at', q => q.eq('runId', args.runId))
      .order('asc')
      .paginate(args.paginationOpts);
  },
});

export const cancel = mutation({
  args: { runId: v.id('collaborationAgentRuns') },
  returns: v.union(v.id('agentCommands'), v.null()),
  handler: async (ctx, args) => {
    const { userId, run } = await requireRunAccess(ctx, args.runId);
    const agent = await ctx.db.get('registeredAgents', run.agentId);
    if (!agent) throw new ConvexError('AGENT_NOT_FOUND');
    if (!(await hasAgentControlAccess(ctx, agent, userId))) {
      throw new ConvexError('AGENT_CONTROL_FORBIDDEN');
    }
    if (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'canceled' ||
      run.status === 'offline'
    ) {
      return null;
    }
    const now = Date.now();
    const pendingCommands = await ctx.db
      .query('agentCommands')
      .withIndex('by_collaboration_run_id', q =>
        q.eq('collaborationRunId', run._id),
      )
      .take(20);
    for (const command of pendingCommands) {
      if (
        command.status === 'pending' &&
        command.kind !== 'collaboration_cancel'
      ) {
        await ctx.db.patch('agentCommands', command._id, {
          status: 'expired',
          completedAt: now,
        });
      }
    }
    await ctx.db.patch('collaborationAgentRuns', run._id, {
      status: 'canceled',
      currentActivity: 'Canceled by a workspace member',
      completedAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert('agentCommands', {
      deviceId: run.deviceId,
      processId: run.processId,
      collaborationRunId: run._id,
      registeredAgentId: run.agentId,
      senderUserId: userId,
      kind: 'collaboration_cancel',
      payload: { runId: run._id },
      status: 'pending',
      createdAt: now,
    });
  },
});

export const respondToPermission = mutation({
  args: {
    runId: v.id('collaborationAgentRuns'),
    optionId: v.optional(v.string()),
  },
  returns: v.id('agentCommands'),
  handler: async (ctx, args) => {
    const { userId, run } = await requireRunAccess(ctx, args.runId);
    const agent = await ctx.db.get('registeredAgents', run.agentId);
    if (!agent) throw new ConvexError('AGENT_NOT_FOUND');
    if (!(await hasAgentControlAccess(ctx, agent, userId))) {
      throw new ConvexError('AGENT_CONTROL_FORBIDDEN');
    }
    if (run.status !== 'waiting_for_permission') {
      throw new ConvexError('RUN_NOT_WAITING_FOR_PERMISSION');
    }
    const optionId = args.optionId?.trim();
    if (optionId !== undefined && (!optionId || optionId.length > 160)) {
      throw new ConvexError('INVALID_PERMISSION_OPTION');
    }
    const recentEvents = await ctx.db
      .query('collaborationRunEvents')
      .withIndex('by_run_id_and_created_at', q => q.eq('runId', run._id))
      .order('desc')
      .take(50);
    const permissionEvent = recentEvents.find(
      event => event.kind === 'permission',
    );
    if (!permissionEvent) {
      throw new ConvexError('PERMISSION_REQUEST_NOT_FOUND');
    }
    if (optionId !== undefined) {
      const metadata = permissionEvent.metadata as
        | {
            permissionOptions?: Array<{ id?: unknown }>;
          }
        | undefined;
      const validOption = metadata?.permissionOptions?.some(
        option => typeof option.id === 'string' && option.id === optionId,
      );
      if (!validOption) {
        throw new ConvexError('INVALID_PERMISSION_OPTION');
      }
    }
    const now = Date.now();
    await ctx.db.patch('collaborationAgentRuns', run._id, {
      status: 'running',
      currentActivity: optionId
        ? 'Permission response sent'
        : 'Permission denied',
      updatedAt: now,
    });
    return await ctx.db.insert('agentCommands', {
      deviceId: run.deviceId,
      processId: run.processId,
      collaborationRunId: run._id,
      registeredAgentId: run.agentId,
      senderUserId: userId,
      kind: 'approval_response',
      payload: { runId: run._id, optionId },
      status: 'pending',
      createdAt: now,
    });
  },
});
