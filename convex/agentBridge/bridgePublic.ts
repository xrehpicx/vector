/**
 * Public mutations for the local bridge CLI.
 * Authenticated via deviceSecret, not user sessions.
 * The bridge calls these directly via ConvexHttpClient.
 */
import { mutation, query } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Id, Doc } from '../_generated/dataModel';
import type { QueryCtx, MutationCtx } from '../_generated/server';

// ── Auth helper ─────────────────────────────────────────────────────────────

async function validateDeviceSecret(
  ctx: { db: QueryCtx['db'] | MutationCtx['db'] },
  deviceId: Id<'agentDevices'>,
  deviceSecret: string,
): Promise<Doc<'agentDevices'>> {
  const device = await ctx.db.get('agentDevices', deviceId);
  if (!device) throw new ConvexError('DEVICE_NOT_FOUND');
  if (!device.deviceSecret || device.deviceSecret !== deviceSecret) {
    throw new ConvexError('INVALID_DEVICE_SECRET');
  }
  return device;
}

// ── Setup ───────────────────────────────────────────────────────────────────

export const setupDevice = mutation({
  args: {
    userId: v.id('users'),
    deviceKey: v.string(),
    deviceSecret: v.string(),
    displayName: v.string(),
    hostname: v.optional(v.string()),
    platform: v.optional(v.string()),
    cliVersion: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get('users', args.userId);
    if (!user) throw new ConvexError('USER_NOT_FOUND');

    const now = Date.now();

    // Upsert by deviceKey
    const existing = await ctx.db
      .query('agentDevices')
      .withIndex('by_user_device_key', q =>
        q.eq('userId', args.userId).eq('deviceKey', args.deviceKey),
      )
      .first();

    if (existing) {
      await ctx.db.patch('agentDevices', existing._id, {
        deviceSecret: args.deviceSecret,
        displayName: args.displayName,
        hostname: args.hostname,
        platform: args.platform,
        cliVersion: args.cliVersion,
        capabilities: args.capabilities,
        status: 'online',
        lastSeenAt: now,
        updatedAt: now,
      });
      return { deviceId: existing._id, status: 'updated' as const };
    }

    const deviceId = await ctx.db.insert('agentDevices', {
      userId: args.userId,
      deviceKey: args.deviceKey,
      deviceSecret: args.deviceSecret,
      displayName: args.displayName,
      hostname: args.hostname,
      platform: args.platform,
      serviceType: 'foreground',
      cliVersion: args.cliVersion,
      capabilities: args.capabilities,
      status: 'online',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { deviceId, status: 'created' as const };
  },
});

// ── Heartbeat ───────────────────────────────────────────────────────────────

export const heartbeat = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);
    const now = Date.now();
    await ctx.db.patch('agentDevices', args.deviceId, {
      status: 'online',
      lastSeenAt: now,
      updatedAt: now,
    });
  },
});

// ── Poll Commands ───────────────────────────────────────────────────────────

export const getPendingCommands = query({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    return ctx.db
      .query('agentCommands')
      .withIndex('by_device_status', q =>
        q.eq('deviceId', args.deviceId).eq('status', 'pending'),
      )
      .collect();
  },
});

// ── Complete Command ────────────────────────────────────────────────────────

export const completeCommand = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    commandId: v.id('agentCommands'),
    status: v.union(v.literal('delivered'), v.literal('failed')),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const cmd = await ctx.db.get('agentCommands', args.commandId);
    if (!cmd || cmd.deviceId !== args.deviceId) {
      throw new ConvexError('COMMAND_NOT_FOUND');
    }

    await ctx.db.patch('agentCommands', args.commandId, {
      status: args.status,
      claimedAt: Date.now(),
      completedAt: Date.now(),
    });
  },
});

// ── Post Agent Message ──────────────────────────────────────────────────────

export const postAgentMessage = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    liveActivityId: v.id('issueLiveActivities'),
    role: v.union(v.literal('status'), v.literal('assistant')),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity || activity.deviceId !== args.deviceId) {
      throw new ConvexError('LIVE_ACTIVITY_NOT_FOUND');
    }

    const now = Date.now();

    const messageId = await ctx.db.insert('issueLiveMessages', {
      liveActivityId: args.liveActivityId,
      direction: 'agent_to_vector',
      role: args.role,
      body: args.body,
      deliveryStatus: 'sent',
      createdAt: now,
    });

    await ctx.db.patch('issueLiveActivities', args.liveActivityId, {
      lastEventAt: now,
      latestSummary:
        args.body.length > 80 ? args.body.slice(0, 77) + '...' : args.body,
    });

    return messageId;
  },
});

// ── List Active Live Activities For Device ───────────────────────────────────

export const getDeviceLiveActivities = query({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const activities = await ctx.db
      .query('issueLiveActivities')
      .withIndex('by_device', q => q.eq('deviceId', args.deviceId))
      .collect();

    // Enrich with issue keys
    const result = await Promise.all(
      activities
        .filter(a => !a.endedAt)
        .map(async a => {
          const issue = await ctx.db.get('issues', a.issueId);
          return {
            _id: a._id,
            issueId: a.issueId,
            issueKey: issue?.key ?? 'Unknown',
            issueTitle: issue?.title ?? 'Unknown issue',
            provider: a.provider,
            title: a.title,
            status: a.status,
            latestSummary: a.latestSummary,
            startedAt: a.startedAt,
            lastEventAt: a.lastEventAt,
          };
        }),
    );

    return result;
  },
});

// ── Report Process ──────────────────────────────────────────────────────────

export const reportProcess = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    provider: v.union(
      v.literal('codex'),
      v.literal('claude_code'),
      v.literal('vector_cli'),
    ),
    providerLabel: v.optional(v.string()),
    localProcessId: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    cwd: v.optional(v.string()),
    repoRoot: v.optional(v.string()),
    branch: v.optional(v.string()),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    mode: v.union(v.literal('observed'), v.literal('managed')),
    status: v.union(
      v.literal('observed'),
      v.literal('managed'),
      v.literal('waiting'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('disconnected'),
    ),
    supportsInboundMessages: v.boolean(),
  },
  handler: async (ctx, args) => {
    const device = await validateDeviceSecret(
      ctx,
      args.deviceId,
      args.deviceSecret,
    );
    const now = Date.now();

    // Upsert by sessionKey if provided
    if (args.sessionKey) {
      const existing = await ctx.db
        .query('agentProcesses')
        .withIndex('by_session_key', q => q.eq('sessionKey', args.sessionKey))
        .first();

      if (existing && existing.deviceId === args.deviceId) {
        await ctx.db.patch('agentProcesses', existing._id, {
          status: args.status,
          title: args.title,
          cwd: args.cwd,
          branch: args.branch,
          lastHeartbeatAt: now,
        });
        return existing._id;
      }
    }

    return ctx.db.insert('agentProcesses', {
      deviceId: args.deviceId,
      userId: device.userId,
      provider: args.provider,
      providerLabel: args.providerLabel,
      localProcessId: args.localProcessId,
      sessionKey: args.sessionKey,
      cwd: args.cwd,
      repoRoot: args.repoRoot,
      branch: args.branch,
      title: args.title,
      model: args.model,
      mode: args.mode,
      status: args.status,
      supportsInboundMessages: args.supportsInboundMessages,
      startedAt: now,
      lastHeartbeatAt: now,
    });
  },
});
