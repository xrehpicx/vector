import { paginationOptsValidator } from 'convex/server';
import { query } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '../authUtils';
import { canViewIssue } from '../access';
import { AGENT_PROVIDER_LABELS } from '../_shared/agentBridge';

// ── Agent Devices ───────────────────────────────────────────────────────────

/** List all devices for the authenticated user. */
export const listMyDevices = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    return ctx.db
      .query('agentDevices')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect();
  },
});

/** List online devices for the authenticated user. */
export const listMyOnlineDevices = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    return ctx.db
      .query('agentDevices')
      .withIndex('by_user_status', q =>
        q.eq('userId', userId).eq('status', 'online'),
      )
      .collect();
  },
});

/** Get a single device by ID. */
export const getDevice = query({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) return null;
    return device;
  },
});

// ── Device Workspaces ───────────────────────────────────────────────────────

/** List workspaces for a specific device. */
export const listDeviceWorkspaces = query({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) return [];

    return ctx.db
      .query('deviceWorkspaces')
      .withIndex('by_device', q => q.eq('deviceId', args.deviceId))
      .collect();
  },
});

/** List all workspaces across all of the user's devices. */
export const listAllMyWorkspaces = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    return ctx.db
      .query('deviceWorkspaces')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect();
  },
});

// ── Agent Processes ─────────────────────────────────────────────────────────

/** List active processes on a device. */
export const listDeviceProcesses = query({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) return [];

    return ctx.db
      .query('agentProcesses')
      .withIndex('by_device', q => q.eq('deviceId', args.deviceId))
      .collect();
  },
});

/** List all active (non-ended) processes for the authenticated user. */
export const listMyActiveProcesses = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const all = await ctx.db
      .query('agentProcesses')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect();

    return all.filter(p => !p.endedAt);
  },
});

/** List all processes across devices, grouped by device for the attach flow. */
export const listProcessesForAttach = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const devices = await ctx.db
      .query('agentDevices')
      .withIndex('by_user_status', q =>
        q.eq('userId', userId).eq('status', 'online'),
      )
      .collect();

    const result = await Promise.all(
      devices.map(async device => {
        const processes = await ctx.db
          .query('agentProcesses')
          .withIndex('by_device_status', q =>
            q.eq('deviceId', device._id).eq('status', 'running'),
          )
          .collect();

        return {
          device,
          processes: processes.map(p => ({
            ...p,
            providerLabel:
              p.providerLabel ??
              AGENT_PROVIDER_LABELS[p.provider] ??
              p.provider,
          })),
        };
      }),
    );

    return result.filter(r => r.processes.length > 0);
  },
});

// ── Issue Live Activities ───────────────────────────────────────────────────

/** List live activities for a specific issue. */
export const listIssueLiveActivities = query({
  args: {
    issueId: v.id('issues'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue) return [];
    if (!(await canViewIssue(ctx, issue))) return [];

    const activities = await ctx.db
      .query('issueLiveActivities')
      .withIndex('by_issue', q => q.eq('issueId', args.issueId))
      .collect();

    // Enrich with device names and provider labels
    return Promise.all(
      activities.map(async activity => {
        const device = await ctx.db.get('agentDevices', activity.deviceId);
        const owner = await ctx.db.get('users', activity.ownerUserId);
        return {
          ...activity,
          deviceName: device?.displayName ?? 'Unknown device',
          ownerName: owner?.name ?? owner?.username ?? 'Unknown',
          providerLabel:
            AGENT_PROVIDER_LABELS[activity.provider] ?? activity.provider,
        };
      }),
    );
  },
});

/** Get a single live activity by ID. */
export const getLiveActivity = query({
  args: { liveActivityId: v.id('issueLiveActivities') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity) return null;

    const issue = await ctx.db.get('issues', activity.issueId);
    if (!issue || !(await canViewIssue(ctx, issue))) return null;

    const device = await ctx.db.get('agentDevices', activity.deviceId);
    const owner = await ctx.db.get('users', activity.ownerUserId);

    return {
      ...activity,
      deviceName: device?.displayName ?? 'Unknown device',
      ownerName: owner?.name ?? owner?.username ?? 'Unknown',
      providerLabel:
        AGENT_PROVIDER_LABELS[activity.provider] ?? activity.provider,
    };
  },
});

// ── Live Messages ───────────────────────────────────────────────────────────

/** Paginated list of messages for a live activity (transcript). */
export const listLiveMessages = query({
  args: {
    liveActivityId: v.id('issueLiveActivities'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity) {
      return { page: [], isDone: true, continueCursor: '' };
    }

    const issue = await ctx.db.get('issues', activity.issueId);
    if (!issue || !(await canViewIssue(ctx, issue))) {
      return { page: [], isDone: true, continueCursor: '' };
    }

    return ctx.db
      .query('issueLiveMessages')
      .withIndex('by_live_activity_created', q =>
        q.eq('liveActivityId', args.liveActivityId),
      )
      .paginate(args.paginationOpts);
  },
});

// ── Agent Commands ──────────────────────────────────────────────────────────

/** List pending commands for a device (polled by the local bridge). */
export const listPendingCommands = query({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) return [];

    return ctx.db
      .query('agentCommands')
      .withIndex('by_device_status', q =>
        q.eq('deviceId', args.deviceId).eq('status', 'pending'),
      )
      .collect();
  },
});

// ── Delegated Runs ──────────────────────────────────────────────────────────

/** Get the active delegated run for an issue. */
export const getIssueDelegatedRun = query({
  args: { issueId: v.id('issues') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue || !(await canViewIssue(ctx, issue))) return null;

    const runs = await ctx.db
      .query('delegatedRuns')
      .withIndex('by_issue', q => q.eq('issueId', args.issueId))
      .collect();

    // Return most recent active run
    const active = runs.find(r =>
      ['pending', 'launching', 'running'].includes(r.launchStatus),
    );
    if (!active) return runs[runs.length - 1] ?? null;

    const device = await ctx.db.get('agentDevices', active.deviceId);
    const workspace = await ctx.db.get('deviceWorkspaces', active.workspaceId);

    return {
      ...active,
      deviceName: device?.displayName ?? 'Unknown device',
      workspaceLabel: workspace?.label ?? active.workspacePath,
      providerLabel: AGENT_PROVIDER_LABELS[active.provider] ?? active.provider,
    };
  },
});

/** List devices with workspaces available for delegation. */
export const listDelegationTargets = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const devices = await ctx.db
      .query('agentDevices')
      .withIndex('by_user_status', q =>
        q.eq('userId', userId).eq('status', 'online'),
      )
      .collect();

    return Promise.all(
      devices.map(async device => {
        const workspaces = await ctx.db
          .query('deviceWorkspaces')
          .withIndex('by_device', q => q.eq('deviceId', device._id))
          .collect();

        return {
          device,
          workspaces: workspaces.filter(
            w => w.launchPolicy === 'allow_delegated',
          ),
        };
      }),
    );
  },
});
