import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from '../_generated/server';
import { v, ConvexError, type Infer } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import {
  collaborationRunEventKindValidator,
  collaborationRunStatusValidator,
  messageFormatValidator,
} from '../_shared/collaboration';
import { collaborationCommandValidator } from './validators';

type DbCtx = QueryCtx | MutationCtx;

async function validateDeviceSecret(
  ctx: DbCtx,
  deviceId: Id<'agentDevices'>,
  deviceSecret: string,
) {
  const device = await ctx.db.get('agentDevices', deviceId);
  if (!device) throw new ConvexError('DEVICE_NOT_FOUND');
  if (!device.deviceSecret || device.deviceSecret !== deviceSecret) {
    throw new ConvexError('INVALID_DEVICE_SECRET');
  }
  return device;
}

async function requireDeviceRun(
  ctx: DbCtx,
  deviceId: Id<'agentDevices'>,
  deviceSecret: string,
  runId: Id<'collaborationAgentRuns'>,
) {
  await validateDeviceSecret(ctx, deviceId, deviceSecret);
  const run = await ctx.db.get('collaborationAgentRuns', runId);
  if (!run || run.deviceId !== deviceId) {
    throw new ConvexError('COLLABORATION_RUN_NOT_FOUND');
  }
  const agent = await ctx.db.get('registeredAgents', run.agentId);
  if (!agent || agent.deviceId !== deviceId) {
    throw new ConvexError('REGISTERED_AGENT_NOT_FOUND');
  }
  return { run, agent };
}

function cleanBridgeText(
  value: string | null | undefined,
  field: string,
  maximum: number,
) {
  if (value === null || value === undefined) return undefined;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  if (cleaned.length > maximum) throw new ConvexError(`${field}_TOO_LONG`);
  return cleaned;
}

export const getPendingCommands = query({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(collaborationCommandValidator),
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);
    const limit = args.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ConvexError('INVALID_COMMAND_LIMIT');
    }
    const commands = await ctx.db
      .query('agentCommands')
      .withIndex('by_device_status', q =>
        q.eq('deviceId', args.deviceId).eq('status', 'pending'),
      )
      .take(limit);
    const result: Array<Infer<typeof collaborationCommandValidator>> = [];
    for (const command of commands) {
      if (!command.collaborationRunId || !command.registeredAgentId) continue;
      const base = {
        _id: command._id,
        _creationTime: command._creationTime,
        deviceId: command.deviceId,
        processId: command.processId,
        collaborationRunId: command.collaborationRunId,
        registeredAgentId: command.registeredAgentId,
        senderUserId: command.senderUserId,
        status: command.status,
        createdAt: command.createdAt,
        claimedAt: command.claimedAt,
        completedAt: command.completedAt,
      };
      if (command.kind === 'collaboration_prompt') {
        const run = await ctx.db.get(
          'collaborationAgentRuns',
          command.collaborationRunId,
        );
        if (
          !run ||
          run.status === 'completed' ||
          run.status === 'failed' ||
          run.status === 'canceled' ||
          run.status === 'offline'
        ) {
          continue;
        }
        result.push({
          ...base,
          kind: command.kind,
          payload: command.payload,
        });
        continue;
      }
      if (command.kind === 'collaboration_cancel') {
        result.push({
          ...base,
          kind: command.kind,
          payload: command.payload,
        });
        continue;
      }
      if (command.kind === 'approval_response') {
        result.push({
          ...base,
          kind: command.kind,
          payload: command.payload,
        });
      }
    }
    return result;
  },
});

export const claimCommand = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    commandId: v.id('agentCommands'),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);
    const command = await ctx.db.get('agentCommands', args.commandId);
    if (
      !command ||
      command.deviceId !== args.deviceId ||
      !command.collaborationRunId ||
      !command.registeredAgentId
    ) {
      throw new ConvexError('COMMAND_NOT_FOUND');
    }
    if (command.status !== 'pending') return false;
    await ctx.db.patch('agentCommands', command._id, {
      status: 'claimed',
      claimedAt: Date.now(),
    });
    return true;
  },
});

export const completeCommand = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    commandId: v.id('agentCommands'),
    status: v.union(v.literal('delivered'), v.literal('failed')),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);
    const command = await ctx.db.get('agentCommands', args.commandId);
    if (
      !command ||
      command.deviceId !== args.deviceId ||
      !command.collaborationRunId
    ) {
      throw new ConvexError('COMMAND_NOT_FOUND');
    }
    const now = Date.now();
    await ctx.db.patch('agentCommands', command._id, {
      status: args.status,
      claimedAt: command.claimedAt ?? now,
      completedAt: now,
    });
    if (args.status === 'failed' && command.kind === 'collaboration_prompt') {
      const run = await ctx.db.get(
        'collaborationAgentRuns',
        command.collaborationRunId,
      );
      if (run && run.deviceId === args.deviceId) {
        if (
          run.status === 'completed' ||
          run.status === 'failed' ||
          run.status === 'canceled' ||
          run.status === 'offline'
        ) {
          return null;
        }
        await ctx.db.patch('collaborationAgentRuns', run._id, {
          status: 'failed',
          error:
            cleanBridgeText(args.error, 'COMMAND_ERROR', 2_000) ??
            'BRIDGE_COMMAND_FAILED',
          completedAt: now,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export const postCollaborationRunEvent = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    runId: v.id('collaborationAgentRuns'),
    sourceId: v.optional(v.string()),
    kind: collaborationRunEventKindValidator,
    title: v.string(),
    body: v.optional(v.string()),
    metadata: v.optional(
      v.record(
        v.string(),
        v.union(v.string(), v.number(), v.boolean(), v.null()),
      ),
    ),
    permissionOptions: v.optional(
      v.array(
        v.object({
          id: v.string(),
          label: v.string(),
          description: v.optional(v.string()),
        }),
      ),
    ),
  },
  returns: v.id('collaborationRunEvents'),
  handler: async (ctx, args) => {
    const { run } = await requireDeviceRun(
      ctx,
      args.deviceId,
      args.deviceSecret,
      args.runId,
    );
    const sourceId = cleanBridgeText(args.sourceId, 'EVENT_SOURCE_ID', 200);
    if (sourceId) {
      const existing = await ctx.db
        .query('collaborationRunEvents')
        .withIndex('by_run_id_and_source_id', q =>
          q.eq('runId', run._id).eq('sourceId', sourceId),
        )
        .first();
      if (existing) return existing._id;
    }
    if (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'canceled' ||
      run.status === 'offline'
    ) {
      throw new ConvexError('COLLABORATION_RUN_ALREADY_TERMINAL');
    }
    if ((args.permissionOptions?.length ?? 0) > 20) {
      throw new ConvexError('TOO_MANY_PERMISSION_OPTIONS');
    }
    const permissionOptions = args.permissionOptions?.map(option => ({
      id:
        cleanBridgeText(option.id, 'PERMISSION_OPTION_ID', 160) ??
        (() => {
          throw new ConvexError('PERMISSION_OPTION_ID_REQUIRED');
        })(),
      label:
        cleanBridgeText(option.label, 'PERMISSION_OPTION_LABEL', 200) ??
        (() => {
          throw new ConvexError('PERMISSION_OPTION_LABEL_REQUIRED');
        })(),
      description: cleanBridgeText(
        option.description,
        'PERMISSION_OPTION_DESCRIPTION',
        500,
      ),
    }));
    const now = Date.now();
    const eventId = await ctx.db.insert('collaborationRunEvents', {
      runId: run._id,
      sourceId,
      kind: args.kind,
      title: cleanBridgeText(args.title, 'EVENT_TITLE', 300) ?? 'Agent update',
      body: cleanBridgeText(args.body, 'EVENT_BODY', 20_000),
      metadata:
        args.metadata || permissionOptions
          ? {
              ...(args.metadata ?? {}),
              ...(permissionOptions ? { permissionOptions } : {}),
            }
          : undefined,
      createdAt: now,
    });
    await ctx.db.patch('collaborationAgentRuns', run._id, {
      currentActivity:
        args.kind === 'permission'
          ? 'Waiting for permission'
          : cleanBridgeText(args.title, 'EVENT_TITLE', 300),
      status:
        args.kind === 'permission'
          ? 'waiting_for_permission'
          : run.status === 'queued' || run.status === 'starting'
            ? 'running'
            : run.status,
      startedAt: run.startedAt ?? now,
      updatedAt: now,
    });
    return eventId;
  },
});

export const updateCollaborationRun = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    runId: v.id('collaborationAgentRuns'),
    status: collaborationRunStatusValidator,
    currentActivity: v.optional(v.union(v.string(), v.null())),
    latestSummary: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    processId: v.optional(v.union(v.id('agentProcesses'), v.null())),
    sessionId: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { run } = await requireDeviceRun(
      ctx,
      args.deviceId,
      args.deviceSecret,
      args.runId,
    );
    if (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'canceled'
    ) {
      if (args.status !== run.status) {
        throw new ConvexError('COLLABORATION_RUN_ALREADY_TERMINAL');
      }
      return null;
    }
    let processId = args.processId ?? undefined;
    if (processId) {
      const process = await ctx.db.get('agentProcesses', processId);
      if (!process || process.deviceId !== args.deviceId) {
        throw new ConvexError('INVALID_AGENT_PROCESS');
      }
    }
    const now = Date.now();
    const terminal =
      args.status === 'completed' ||
      args.status === 'failed' ||
      args.status === 'canceled' ||
      args.status === 'offline';
    await ctx.db.patch('collaborationAgentRuns', run._id, {
      status: args.status,
      currentActivity:
        args.currentActivity === undefined
          ? run.currentActivity
          : cleanBridgeText(args.currentActivity, 'RUN_CURRENT_ACTIVITY', 500),
      latestSummary:
        args.latestSummary === undefined
          ? run.latestSummary
          : cleanBridgeText(args.latestSummary, 'RUN_SUMMARY', 4_000),
      error:
        args.error === undefined
          ? run.error
          : cleanBridgeText(args.error, 'RUN_ERROR', 4_000),
      processId: args.processId === undefined ? run.processId : processId,
      sessionId:
        args.sessionId === undefined
          ? run.sessionId
          : cleanBridgeText(args.sessionId, 'RUN_SESSION_ID', 500),
      startedAt:
        run.startedAt ??
        (args.status === 'starting' || args.status === 'running'
          ? now
          : undefined),
      completedAt: terminal ? now : undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const postCollaborationAgentMessage = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    runId: v.id('collaborationAgentRuns'),
    body: v.string(),
    clientMessageId: v.string(),
    format: v.optional(messageFormatValidator),
    final: v.optional(v.boolean()),
  },
  returns: v.id('channelMessages'),
  handler: async (ctx, args) => {
    const { run, agent } = await requireDeviceRun(
      ctx,
      args.deviceId,
      args.deviceSecret,
      args.runId,
    );
    const body = cleanBridgeText(args.body, 'AGENT_MESSAGE_BODY', 20_000);
    if (!body) throw new ConvexError('AGENT_MESSAGE_BODY_REQUIRED');
    const clientMessageId = cleanBridgeText(
      args.clientMessageId,
      'CLIENT_MESSAGE_ID',
      128,
    );
    if (!clientMessageId || !/^[A-Za-z0-9._:-]+$/.test(clientMessageId)) {
      throw new ConvexError('INVALID_CLIENT_MESSAGE_ID');
    }
    const existing = await ctx.db
      .query('channelMessages')
      .withIndex('by_channel_id_and_client_message_id', q =>
        q.eq('channelId', run.channelId).eq('clientMessageId', clientMessageId),
      )
      .first();
    if (existing) {
      if (
        existing.actorKind !== 'agent' ||
        existing.authorAgentId !== run.agentId
      ) {
        throw new ConvexError('CLIENT_MESSAGE_ID_CONFLICT');
      }
      return existing._id;
    }
    if (
      run.status === 'completed' ||
      run.status === 'canceled' ||
      run.status === 'failed' ||
      run.status === 'offline'
    ) {
      throw new ConvexError('COLLABORATION_RUN_NOT_WRITABLE');
    }

    const now = Date.now();
    const messageId = await ctx.db.insert('channelMessages', {
      organizationId: run.organizationId,
      channelId: run.channelId,
      actorKind: 'agent',
      authorAgentId: agent._id,
      body,
      format: args.format ?? 'markdown',
      threadRootId: run.threadRootId,
      replyToMessageId: run.triggerMessageId,
      clientMessageId,
      mentionedUserIds: [],
      mentionedAgentIds: [],
      replyCount: 0,
      createdAt: now,
    });
    if (run.threadRootId) {
      const root = await ctx.db.get('channelMessages', run.threadRootId);
      if (root && root.channelId === run.channelId) {
        await ctx.db.patch('channelMessages', root._id, {
          replyCount: root.replyCount + 1,
          lastReplyAt: now,
        });
      }
    } else {
      await ctx.db.patch('channels', run.channelId, {
        lastMessageId: messageId,
        lastMessageAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch('collaborationAgentRuns', run._id, {
      finalMessageId: args.final ? messageId : run.finalMessageId,
      latestSummary: body.slice(0, 4_000),
      status: args.final ? 'completed' : 'running',
      completedAt: args.final ? now : undefined,
      updatedAt: now,
    });
    return messageId;
  },
});

export const cancelCollaborationRun = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    runId: v.id('collaborationAgentRuns'),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { run } = await requireDeviceRun(
      ctx,
      args.deviceId,
      args.deviceSecret,
      args.runId,
    );
    if (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'offline'
    ) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch('collaborationAgentRuns', run._id, {
      status: 'canceled',
      currentActivity: 'Canceled by local agent runtime',
      error: cleanBridgeText(args.reason, 'CANCEL_REASON', 2_000),
      completedAt: now,
      updatedAt: now,
    });
    return null;
  },
});
