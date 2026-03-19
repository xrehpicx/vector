import { paginationOptsValidator } from 'convex/server';
import { query, type QueryCtx } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '../authUtils';
import { canViewIssue } from '../access';
import { AGENT_PROVIDER_LABELS } from '../_shared/agentBridge';
import type { Doc } from '../_generated/dataModel';
import { getWorkSessionAccess } from './workSessions';

function deviceDedupKey(device: Doc<'agentDevices'>): string {
  return [
    device.hostname ?? device.deviceKey,
    device.platform ?? 'unknown',
    device.displayName,
    device.serviceType,
  ].join('::');
}

function deviceStatusRank(status: Doc<'agentDevices'>['status']): number {
  switch (status) {
    case 'online':
      return 3;
    case 'stale':
      return 2;
    case 'offline':
      return 1;
    default:
      return 0;
  }
}

function collapseDuplicateDevices(
  devices: Doc<'agentDevices'>[],
): Doc<'agentDevices'>[] {
  const canonicalByKey = new Map<string, Doc<'agentDevices'>>();
  const sorted = [...devices].sort((a, b) => {
    const statusDelta = deviceStatusRank(b.status) - deviceStatusRank(a.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return b.lastSeenAt - a.lastSeenAt;
  });

  for (const device of sorted) {
    const key = deviceDedupKey(device);
    if (!canonicalByKey.has(key)) {
      canonicalByKey.set(key, device);
    }
  }

  return [...canonicalByKey.values()].sort(
    (a, b) => b.lastSeenAt - a.lastSeenAt,
  );
}

function processDedupKey(process: Doc<'agentProcesses'>): string {
  return [
    process.provider,
    process.localProcessId ??
      process.sessionKey ??
      process.cwd ??
      process.title,
  ]
    .filter(Boolean)
    .join('::');
}

function processRank(process: Doc<'agentProcesses'>): number {
  return process.localProcessId ? 2 : process.sessionKey ? 1 : 0;
}

function collapseDuplicateProcesses(
  processes: Doc<'agentProcesses'>[],
): Doc<'agentProcesses'>[] {
  const canonicalByKey = new Map<string, Doc<'agentProcesses'>>();
  const sorted = [...processes].sort((a, b) => {
    const rankDelta = processRank(b) - processRank(a);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return b.lastHeartbeatAt - a.lastHeartbeatAt;
  });

  for (const process of sorted) {
    const key = processDedupKey(process);
    if (!key || canonicalByKey.has(key)) {
      continue;
    }
    canonicalByKey.set(key, process);
  }

  return [...canonicalByKey.values()].sort(
    (a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt,
  );
}

async function hydrateWorkSession(
  ctx: QueryCtx,
  workSessionId: Doc<'workSessions'>['_id'] | undefined,
) {
  const access = await getWorkSessionAccess(ctx, workSessionId);
  if (!access.workSession) {
    return null;
  }

  const [issue, liveActivity] = await Promise.all([
    ctx.db.get('issues', access.workSession.issueId),
    access.workSession.liveActivityId
      ? ctx.db.get('issueLiveActivities', access.workSession.liveActivityId)
      : Promise.resolve(null),
  ]);

  const shares = await ctx.db
    .query('workSessionShares')
    .withIndex('by_work_session', q =>
      q.eq('workSessionId', access.workSession!._id),
    )
    .collect();

  const sharedMembers = await Promise.all(
    shares.map(async share => {
      const user = await ctx.db.get('users', share.userId);
      return user
        ? {
            userId: user._id,
            name: user.name ?? user.username ?? user.email ?? 'Unknown',
            email: user.email,
            image: user.image,
            accessLevel: share.accessLevel,
          }
        : null;
    }),
  );

  return {
    ...access.workSession,
    // Only expose terminal credentials to users who can interact (controllers/owners)
    terminalToken: access.canInteract
      ? access.workSession.terminalToken
      : undefined,
    issueKey: issue?.key,
    issueTitle: issue?.title,
    liveActivityStatus: liveActivity?.status,
    latestSummary: liveActivity?.latestSummary,
    canInteract: access.canInteract,
    canManage: access.canManage,
    shareAccessLevel: access.shareAccessLevel,
    sharedMembers: sharedMembers.filter(Boolean),
  };
}

// ── Agent Devices ───────────────────────────────────────────────────────────

/** List all devices for the authenticated user. */
export const listMyDevices = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const devices = await ctx.db
      .query('agentDevices')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect();

    return collapseDuplicateDevices(devices);
  },
});

/** List online devices for the authenticated user. */
export const listMyOnlineDevices = query({
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

    return collapseDuplicateDevices(devices);
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
        const allProcesses = await ctx.db
          .query('agentProcesses')
          .withIndex('by_device', q => q.eq('deviceId', device._id))
          .collect();

        const processes = collapseDuplicateProcesses(
          allProcesses.filter(
            p =>
              p.mode === 'observed' &&
              p.supportsInboundMessages &&
              !p.endedAt &&
              !['failed', 'disconnected'].includes(p.status),
          ),
        );

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
    const hydrated = await Promise.all(
      activities.map(async activity => {
        const device = await ctx.db.get('agentDevices', activity.deviceId);
        const owner = await ctx.db.get('users', activity.ownerUserId);
        const workSession = await hydrateWorkSession(
          ctx,
          activity.workSessionId,
        );
        return {
          ...activity,
          deviceName: device?.displayName ?? 'Unknown device',
          ownerName: owner?.name ?? owner?.username ?? 'Unknown',
          providerLabel:
            AGENT_PROVIDER_LABELS[activity.provider] ?? activity.provider,
          workSession,
          canInteract:
            workSession?.canInteract ?? activity.ownerUserId === userId,
          canManageSession:
            workSession?.canManage ?? activity.ownerUserId === userId,
        };
      }),
    );

    return hydrated.sort((a, b) => b.lastEventAt - a.lastEventAt);
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
    const workSession = await hydrateWorkSession(ctx, activity.workSessionId);

    return {
      ...activity,
      deviceName: device?.displayName ?? 'Unknown device',
      ownerName: owner?.name ?? owner?.username ?? 'Unknown',
      providerLabel:
        AGENT_PROVIDER_LABELS[activity.provider] ?? activity.provider,
      workSession,
      canInteract: workSession?.canInteract ?? activity.ownerUserId === userId,
      canManageSession:
        workSession?.canManage ?? activity.ownerUserId === userId,
    };
  },
});

export const listDeviceWorkSessions = query({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      return [];
    }

    const sessions = await ctx.db
      .query('workSessions')
      .withIndex('by_device', q => q.eq('deviceId', args.deviceId))
      .collect();

    const visible: Awaited<ReturnType<typeof hydrateWorkSession>>[] = [];
    for (const session of sessions) {
      const access = await hydrateWorkSession(ctx, session._id);
      if (access) {
        visible.push(access);
      }
    }

    return visible
      .filter(
        (
          session,
        ): session is NonNullable<
          Awaited<ReturnType<typeof hydrateWorkSession>>
        > => !!session && !session.endedAt,
      )
      .sort((a, b) => b.lastEventAt - a.lastEventAt);
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

    if (activity.workSessionId) {
      const workSessionAccess = await getWorkSessionAccess(
        ctx,
        activity.workSessionId,
      );
      if (!workSessionAccess.workSession) {
        return { page: [], isDone: true, continueCursor: '' };
      }
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

// ── Terminal Signaling (WebRTC) ─────────────────────────────────────────────

/** Get signaling messages for a specific peer. */
export const getTerminalSignals = query({
  args: {
    workSessionId: v.id('workSessions'),
    for: v.union(v.literal('browser'), v.literal('bridge')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    // Require at least viewer access to the work session
    const access = await getWorkSessionAccess(ctx, args.workSessionId);
    if (!access.workSession) return [];

    // 'for' browser means get signals FROM bridge, and vice versa
    const from = args.for === 'browser' ? 'bridge' : 'browser';

    return ctx.db
      .query('terminalSignals')
      .withIndex('by_work_session_from', q =>
        q.eq('workSessionId', args.workSessionId).eq('from', from),
      )
      .collect();
  },
});
