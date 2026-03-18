/**
 * Internal mutations for bridge HTTP endpoints.
 * Auth is via deviceKey + deviceSecret, not user sessions.
 */
import { internalMutation, internalQuery } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function validateDevice(
  db: { get: (table: 'agentDevices', id: Id<'agentDevices'>) => Promise<any> },
  deviceId: string,
  deviceSecret: string,
) {
  try {
    const device = await db.get(
      'agentDevices' as any,
      deviceId as Id<'agentDevices'>,
    );
    if (!device) return { ok: false as const, error: 'Device not found' };
    if (device.deviceSecret !== deviceSecret) {
      return { ok: false as const, error: 'Invalid device secret' };
    }
    return { ok: true as const, device };
  } catch {
    return { ok: false as const, error: 'Invalid device ID' };
  }
}

// ── Setup ───────────────────────────────────────────────────────────────────

export const setupDevice = internalMutation({
  args: {
    userId: v.string(),
    deviceKey: v.string(),
    deviceSecret: v.string(),
    displayName: v.string(),
    hostname: v.optional(v.string()),
    platform: v.optional(v.string()),
    serviceType: v.string(),
    cliVersion: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId('users', args.userId);
    if (!userId) throw new Error('Invalid userId');

    const now = Date.now();

    // Check if device already exists
    const existing = await ctx.db
      .query('agentDevices')
      .withIndex('by_user_device_key', q =>
        q.eq('userId', userId).eq('deviceKey', args.deviceKey),
      )
      .first();

    if (existing) {
      await ctx.db.patch('agentDevices', existing._id, {
        deviceSecret: args.deviceSecret,
        displayName: args.displayName,
        hostname: args.hostname,
        platform: args.platform,
        serviceType: args.serviceType as any,
        cliVersion: args.cliVersion,
        capabilities: args.capabilities,
        status: 'online',
        lastSeenAt: now,
        updatedAt: now,
      });
      return { deviceId: existing._id, userId, status: 'updated' };
    }

    const deviceId = await ctx.db.insert('agentDevices', {
      userId,
      deviceKey: args.deviceKey,
      deviceSecret: args.deviceSecret,
      displayName: args.displayName,
      hostname: args.hostname,
      platform: args.platform,
      serviceType: args.serviceType as any,
      cliVersion: args.cliVersion,
      capabilities: args.capabilities,
      status: 'online',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { deviceId, userId, status: 'created' };
  },
});

// ── Heartbeat ───────────────────────────────────────────────────────────────

export const heartbeat = internalMutation({
  args: {
    deviceId: v.string(),
    deviceSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const check = await validateDevice(
      ctx.db as any,
      args.deviceId,
      args.deviceSecret,
    );
    if (!check.ok) return check;

    await ctx.db.patch('agentDevices', args.deviceId as Id<'agentDevices'>, {
      status: 'online',
      lastSeenAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

// ── Get Pending Commands ────────────────────────────────────────────────────

export const getPendingCommands = internalQuery({
  args: {
    deviceId: v.string(),
    deviceSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const check = await validateDevice(
      ctx.db as any,
      args.deviceId,
      args.deviceSecret,
    );
    if (!check.ok) return { ...check, commands: [] };

    const commands = await ctx.db
      .query('agentCommands')
      .withIndex('by_device_status', q =>
        q
          .eq('deviceId', args.deviceId as Id<'agentDevices'>)
          .eq('status', 'pending'),
      )
      .collect();

    return {
      ok: true as const,
      commands: commands.map(c => ({
        _id: c._id,
        kind: c.kind,
        payload: c.payload,
        liveActivityId: c.liveActivityId,
        processId: c.processId,
        createdAt: c.createdAt,
      })),
    };
  },
});

// ── Complete Command ────────────────────────────────────────────────────────

export const completeCommand = internalMutation({
  args: {
    deviceSecret: v.string(),
    commandId: v.string(),
    status: v.union(v.literal('delivered'), v.literal('failed')),
  },
  handler: async (ctx, args) => {
    const cmd = await ctx.db.get(
      'agentCommands',
      args.commandId as Id<'agentCommands'>,
    );
    if (!cmd) return { ok: false as const, error: 'Command not found' };

    const check = await validateDevice(
      ctx.db as any,
      cmd.deviceId as string,
      args.deviceSecret,
    );
    if (!check.ok) return check;

    await ctx.db.patch('agentCommands', args.commandId as Id<'agentCommands'>, {
      status: args.status,
      claimedAt: Date.now(),
      completedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

// ── Post Agent Message ──────────────────────────────────────────────────────

export const postAgentMessage = internalMutation({
  args: {
    deviceSecret: v.string(),
    liveActivityId: v.string(),
    role: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId as Id<'issueLiveActivities'>,
    );
    if (!activity) return { ok: false as const, error: 'Activity not found' };

    const check = await validateDevice(
      ctx.db as any,
      activity.deviceId as string,
      args.deviceSecret,
    );
    if (!check.ok) return check;

    const now = Date.now();

    const messageId = await ctx.db.insert('issueLiveMessages', {
      liveActivityId: args.liveActivityId as Id<'issueLiveActivities'>,
      direction: 'agent_to_vector',
      role: (args.role as 'status' | 'assistant') ?? 'assistant',
      body: args.body,
      deliveryStatus: 'sent',
      createdAt: now,
    });

    await ctx.db.patch(
      'issueLiveActivities',
      args.liveActivityId as Id<'issueLiveActivities'>,
      {
        lastEventAt: now,
        latestSummary:
          args.body.length > 80 ? args.body.slice(0, 77) + '...' : args.body,
      },
    );

    return { ok: true as const, messageId };
  },
});

// ── Report Process ──────────────────────────────────────────────────────────

export const reportProcess = internalMutation({
  args: {
    deviceSecret: v.string(),
    deviceId: v.string(),
    provider: v.string(),
    providerLabel: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    cwd: v.optional(v.string()),
    repoRoot: v.optional(v.string()),
    branch: v.optional(v.string()),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    mode: v.string(),
    status: v.string(),
    supportsInboundMessages: v.boolean(),
  },
  handler: async (ctx, args) => {
    const check = await validateDevice(
      ctx.db as any,
      args.deviceId,
      args.deviceSecret,
    );
    if (!check.ok) return { ...check, processId: null };

    const now = Date.now();

    // Upsert by sessionKey
    if (args.sessionKey) {
      const existing = await ctx.db
        .query('agentProcesses')
        .withIndex('by_session_key', q => q.eq('sessionKey', args.sessionKey))
        .first();

      if (existing) {
        await ctx.db.patch('agentProcesses', existing._id, {
          status: args.status as any,
          title: args.title,
          lastHeartbeatAt: now,
        });
        return { ok: true as const, processId: existing._id };
      }
    }

    const processId = await ctx.db.insert('agentProcesses', {
      deviceId: args.deviceId as Id<'agentDevices'>,
      userId: check.device.userId,
      provider: args.provider as any,
      providerLabel: args.providerLabel,
      sessionKey: args.sessionKey,
      cwd: args.cwd,
      repoRoot: args.repoRoot,
      branch: args.branch,
      title: args.title,
      model: args.model,
      mode: args.mode as any,
      status: args.status as any,
      supportsInboundMessages: args.supportsInboundMessages,
      startedAt: now,
      lastHeartbeatAt: now,
    });

    return { ok: true as const, processId };
  },
});
