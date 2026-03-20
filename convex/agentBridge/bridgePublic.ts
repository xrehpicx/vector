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

    const commands = await ctx.db
      .query('agentCommands')
      .withIndex('by_device_status', q =>
        q.eq('deviceId', args.deviceId).eq('status', 'pending'),
      )
      .collect();

    return Promise.all(
      commands.map(async command => {
        const liveActivity = command.liveActivityId
          ? await ctx.db.get('issueLiveActivities', command.liveActivityId)
          : null;
        const issue = liveActivity
          ? await ctx.db.get('issues', liveActivity.issueId)
          : null;
        const workSession = liveActivity?.workSessionId
          ? await ctx.db.get('workSessions', liveActivity.workSessionId)
          : null;
        const resolvedProcessId = command.processId ?? liveActivity?.processId;
        const process = resolvedProcessId
          ? await ctx.db.get('agentProcesses', resolvedProcessId)
          : null;

        return {
          _id: command._id,
          kind: command.kind,
          payload: command.payload,
          liveActivityId: command.liveActivityId,
          processId: resolvedProcessId,
          createdAt: command.createdAt,
          liveActivity: liveActivity
            ? {
                _id: liveActivity._id,
                issueId: liveActivity.issueId,
                issueKey: issue?.key,
                issueTitle: issue?.title,
                provider: liveActivity.provider,
                title: liveActivity.title,
                status: liveActivity.status,
                workSessionId: liveActivity.workSessionId,
              }
            : null,
          workSession: workSession
            ? {
                _id: workSession._id,
                tmuxSessionName: workSession.tmuxSessionName,
                tmuxWindowName: workSession.tmuxWindowName,
                tmuxPaneId: workSession.tmuxPaneId,
                workspacePath: workSession.workspacePath,
                cwd: workSession.cwd,
                repoRoot: workSession.repoRoot,
                branch: workSession.branch,
                terminalSnapshot: workSession.terminalSnapshot,
                agentProvider: workSession.agentProvider,
                agentSessionKey: workSession.agentSessionKey,
              }
            : null,
          process: process
            ? {
                _id: process._id,
                provider: process.provider,
                providerLabel: process.providerLabel,
                sessionKey: process.sessionKey,
                cwd: process.cwd,
                repoRoot: process.repoRoot,
                branch: process.branch,
                title: process.title,
                model: process.model,
                mode: process.mode,
                status: process.status,
                supportsInboundMessages: process.supportsInboundMessages,
              }
            : null,
        };
      }),
    );
  },
});

// ── Complete Command ────────────────────────────────────────────────────────

export const claimCommand = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    commandId: v.id('agentCommands'),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const cmd = await ctx.db.get('agentCommands', args.commandId);
    if (!cmd || cmd.deviceId !== args.deviceId) {
      throw new ConvexError('COMMAND_NOT_FOUND');
    }

    if (cmd.status !== 'pending') {
      return false;
    }

    await ctx.db.patch('agentCommands', args.commandId, {
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
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const cmd = await ctx.db.get('agentCommands', args.commandId);
    if (!cmd || cmd.deviceId !== args.deviceId) {
      throw new ConvexError('COMMAND_NOT_FOUND');
    }

    const now = Date.now();

    await ctx.db.patch('agentCommands', args.commandId, {
      status: args.status,
      claimedAt: now,
      completedAt: now,
    });

    const messageId = (cmd.payload as { messageId?: Id<'issueLiveMessages'> })
      ?.messageId;
    if (messageId) {
      const message = await ctx.db.get('issueLiveMessages', messageId);
      if (
        message &&
        message.liveActivityId === cmd.liveActivityId &&
        message.direction === 'vector_to_agent'
      ) {
        await ctx.db.patch('issueLiveMessages', messageId, {
          deliveryStatus: args.status === 'delivered' ? 'delivered' : 'failed',
        });
      }
    }
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
          const process = a.processId
            ? await ctx.db.get('agentProcesses', a.processId)
            : null;
          const workSession = a.workSessionId
            ? await ctx.db.get('workSessions', a.workSessionId)
            : null;
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
            cwd: workSession?.cwd ?? process?.cwd,
            repoRoot: workSession?.repoRoot ?? process?.repoRoot,
            branch: workSession?.branch ?? process?.branch,
            workSessionId: a.workSessionId,
            workspacePath: workSession?.workspacePath,
            terminalSnapshot: workSession?.terminalSnapshot,
            tmuxPaneId: workSession?.tmuxPaneId,
            tmuxSessionName: workSession?.tmuxSessionName,
            workSessionTitle: workSession?.title,
            titleLockedByUser: workSession?.titleLockedByUser ?? false,
            agentProvider: workSession?.agentProvider,
            agentProcessId: workSession?.agentProcessId,
            agentSessionKey: workSession?.agentSessionKey,
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
    tmuxSessionName: v.optional(v.string()),
    tmuxWindowName: v.optional(v.string()),
    tmuxPaneId: v.optional(v.string()),
    responseText: v.optional(v.string()),
    launchCommand: v.optional(v.string()),
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
          provider: args.provider,
          providerLabel: args.providerLabel,
          localProcessId: args.localProcessId,
          sessionKey: args.sessionKey,
          repoRoot: args.repoRoot,
          status: args.status,
          model: args.model,
          mode: args.mode,
          supportsInboundMessages: args.supportsInboundMessages,
          title: args.title,
          cwd: args.cwd,
          branch: args.branch,
          tmuxSessionName: args.tmuxSessionName,
          tmuxWindowName: args.tmuxWindowName,
          tmuxPaneId: args.tmuxPaneId,
          lastHeartbeatAt: now,
          endedAt:
            args.status === 'completed' ||
            args.status === 'failed' ||
            args.status === 'disconnected'
              ? now
              : undefined,
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
      tmuxSessionName: args.tmuxSessionName,
      tmuxWindowName: args.tmuxWindowName,
      tmuxPaneId: args.tmuxPaneId,
      mode: args.mode,
      status: args.status,
      supportsInboundMessages: args.supportsInboundMessages,
      startedAt: now,
      lastHeartbeatAt: now,
    });
  },
});

export const reconcileObservedProcesses = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    activeSessionKeys: v.array(v.string()),
    activeLocalProcessIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const activeSessionKeys = new Set(args.activeSessionKeys);
    const activeLocalProcessIds = new Set(args.activeLocalProcessIds);
    const now = Date.now();

    const processes = await ctx.db
      .query('agentProcesses')
      .withIndex('by_device', q => q.eq('deviceId', args.deviceId))
      .collect();
    const activities = await ctx.db
      .query('issueLiveActivities')
      .withIndex('by_device', q => q.eq('deviceId', args.deviceId))
      .collect();

    let disconnected = 0;

    for (const process of processes) {
      if (process.mode !== 'observed' || process.endedAt) {
        continue;
      }

      if (!process.localProcessId) {
        await ctx.db.patch('agentProcesses', process._id, {
          status: 'disconnected',
          endedAt: now,
        });
        disconnected++;
        continue;
      }

      const sessionStillActive =
        !!process.sessionKey && activeSessionKeys.has(process.sessionKey);
      const pidStillActive =
        !!process.localProcessId &&
        activeLocalProcessIds.has(process.localProcessId);

      if (sessionStillActive || pidStillActive) {
        continue;
      }

      await ctx.db.patch('agentProcesses', process._id, {
        status: 'disconnected',
        endedAt: now,
      });

      for (const activity of activities) {
        if (activity.processId !== process._id || activity.endedAt) {
          continue;
        }

        await ctx.db.patch('issueLiveActivities', activity._id, {
          status: 'disconnected',
          lastEventAt: now,
          endedAt: now,
        });
      }

      disconnected++;
    }

    return { disconnected };
  },
});

// ── Live Activity / Delegated Run Sync ──────────────────────────────────────

export const updateLiveActivityState = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    liveActivityId: v.id('issueLiveActivities'),
    status: v.union(
      v.literal('active'),
      v.literal('waiting_for_input'),
      v.literal('paused'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('canceled'),
      v.literal('disconnected'),
    ),
    latestSummary: v.optional(v.string()),
    title: v.optional(v.string()),
    processId: v.optional(v.id('agentProcesses')),
    delegatedRunId: v.optional(v.id('delegatedRuns')),
    launchStatus: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('launching'),
        v.literal('running'),
        v.literal('completed'),
        v.literal('failed'),
        v.literal('canceled'),
      ),
    ),
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

    if (args.processId) {
      const process = await ctx.db.get('agentProcesses', args.processId);
      if (!process || process.deviceId !== args.deviceId) {
        throw new ConvexError('PROCESS_NOT_FOUND');
      }
    }

    const now = Date.now();
    const isTerminal = [
      'completed',
      'failed',
      'canceled',
      'disconnected',
    ].includes(args.status);

    await ctx.db.patch('issueLiveActivities', args.liveActivityId, {
      status: args.status,
      ...(args.latestSummary !== undefined && {
        latestSummary: args.latestSummary,
      }),
      ...(args.title !== undefined && { title: args.title }),
      ...(args.processId && { processId: args.processId }),
      lastEventAt: now,
      ...(isTerminal && { endedAt: now }),
    });

    if (activity.workSessionId) {
      await ctx.db.patch('workSessions', activity.workSessionId, {
        status: args.status,
        ...(args.title !== undefined && { title: args.title }),
        ...(args.processId && { agentProcessId: args.processId }),
        lastEventAt: now,
        ...(isTerminal && { endedAt: now }),
      });
    }

    if (args.delegatedRunId) {
      const run = await ctx.db.get('delegatedRuns', args.delegatedRunId);
      if (
        !run ||
        run.deviceId !== args.deviceId ||
        run.liveActivityId !== args.liveActivityId
      ) {
        throw new ConvexError('DELEGATED_RUN_NOT_FOUND');
      }

      const isTerminalLaunch =
        args.launchStatus &&
        ['completed', 'failed', 'canceled'].includes(args.launchStatus);

      await ctx.db.patch('delegatedRuns', args.delegatedRunId, {
        ...(args.launchStatus && { launchStatus: args.launchStatus }),
        ...(args.launchStatus === 'running' && { launchedAt: now }),
        ...(isTerminalLaunch && { endedAt: now }),
      });
    }
  },
});

export const updateWorkSessionTerminal = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    workSessionId: v.id('workSessions'),
    terminalSnapshot: v.string(),
    tmuxSessionName: v.optional(v.string()),
    tmuxWindowName: v.optional(v.string()),
    tmuxPaneId: v.optional(v.string()),
    cwd: v.optional(v.string()),
    repoRoot: v.optional(v.string()),
    branch: v.optional(v.string()),
    agentProvider: v.optional(
      v.union(
        v.literal('codex'),
        v.literal('claude_code'),
        v.literal('vector_cli'),
      ),
    ),
    agentSessionKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const workSession = await ctx.db.get('workSessions', args.workSessionId);
    if (!workSession || workSession.deviceId !== args.deviceId) {
      throw new ConvexError('WORK_SESSION_NOT_FOUND');
    }

    const now = Date.now();
    await ctx.db.patch('workSessions', args.workSessionId, {
      terminalSnapshot: args.terminalSnapshot,
      terminalUpdatedAt: now,
      lastEventAt: now,
      ...(args.tmuxSessionName && { tmuxSessionName: args.tmuxSessionName }),
      ...(args.tmuxWindowName && { tmuxWindowName: args.tmuxWindowName }),
      ...(args.tmuxPaneId && { tmuxPaneId: args.tmuxPaneId }),
      ...(args.cwd !== undefined && { cwd: args.cwd }),
      ...(args.repoRoot !== undefined && { repoRoot: args.repoRoot }),
      ...(args.branch !== undefined && { branch: args.branch }),
      ...(args.agentProvider !== undefined && {
        agentProvider: args.agentProvider,
      }),
      ...(args.agentSessionKey !== undefined && {
        agentSessionKey: args.agentSessionKey,
      }),
    });
  },
});

/** Update the auto-generated title for a work session (bridge only, skips user-locked titles). */
export const updateWorkSessionAutoTitle = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    workSessionId: v.id('workSessions'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const ws = await ctx.db.get('workSessions', args.workSessionId);
    if (!ws || ws.deviceId !== args.deviceId) return;

    // Don't overwrite user-set titles
    if (ws.titleLockedByUser) return;

    // Only update if the title actually changed
    if (ws.title !== args.title) {
      await ctx.db.patch('workSessions', args.workSessionId, {
        title: args.title,
      });
    }
  },
});

// ── Terminal Signaling (WebRTC, bridge side) ────────────────────────────────

/** Send a WebRTC signaling message from the bridge (answer or ICE candidate). */
export const sendTerminalSignal = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    workSessionId: v.id('workSessions'),
    type: v.union(v.literal('answer'), v.literal('candidate')),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const workSession = await ctx.db.get('workSessions', args.workSessionId);
    if (!workSession || workSession.deviceId !== args.deviceId) {
      throw new ConvexError('WORK_SESSION_NOT_FOUND');
    }

    // Clear only previous answers (not candidates) when sending a new answer
    if (args.type === 'answer') {
      const old = await ctx.db
        .query('terminalSignals')
        .withIndex('by_work_session_from', q =>
          q.eq('workSessionId', args.workSessionId).eq('from', 'bridge'),
        )
        .collect();
      for (const signal of old) {
        if (signal.type === 'answer') {
          await ctx.db.delete('terminalSignals', signal._id);
        }
      }
    }

    await ctx.db.insert('terminalSignals', {
      workSessionId: args.workSessionId,
      from: 'bridge',
      type: args.type,
      data: args.data,
      createdAt: Date.now(),
    });
  },
});

/** Get signaling messages from the browser for the bridge. */
/** Update the tunnel URL, local port, and auth token for interactive terminal. */
export const updateWorkSessionTerminalUrl = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    workSessionId: v.id('workSessions'),
    terminalUrl: v.union(v.string(), v.null()),
    terminalToken: v.optional(v.string()),
    terminalLocalPort: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const ws = await ctx.db.get('workSessions', args.workSessionId);
    if (!ws || ws.deviceId !== args.deviceId) {
      throw new ConvexError('WORK_SESSION_NOT_FOUND');
    }

    await ctx.db.patch('workSessions', args.workSessionId, {
      terminalUrl: args.terminalUrl ?? undefined,
      terminalToken: args.terminalToken ?? undefined,
      terminalLocalPort: args.terminalLocalPort,
    });
  },
});

/** Get work session terminal state (for bridge reactive subscription). */
export const getWorkSessionTerminalState = query({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    workSessionId: v.id('workSessions'),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const ws = await ctx.db.get('workSessions', args.workSessionId);
    if (!ws || ws.deviceId !== args.deviceId) return null;

    return {
      terminalInput: ws.terminalInput ?? null,
      terminalViewerActive: ws.terminalViewerActive ?? false,
      terminalCols: ws.terminalCols ?? 80,
      terminalRows: ws.terminalRows ?? 24,
    };
  },
});

/** Consume terminal input after the bridge has processed it. */
export const consumeTerminalInput = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    workSessionId: v.id('workSessions'),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    const ws = await ctx.db.get('workSessions', args.workSessionId);
    if (!ws || ws.deviceId !== args.deviceId) return;

    if (ws.terminalInput) {
      await ctx.db.patch('workSessions', args.workSessionId, {
        terminalInput: '',
      });
    }
  },
});

export const getTerminalSignals = query({
  args: {
    deviceId: v.id('agentDevices'),
    deviceSecret: v.string(),
    workSessionId: v.id('workSessions'),
  },
  handler: async (ctx, args) => {
    await validateDeviceSecret(ctx, args.deviceId, args.deviceSecret);

    return ctx.db
      .query('terminalSignals')
      .withIndex('by_work_session_from', q =>
        q.eq('workSessionId', args.workSessionId).eq('from', 'browser'),
      )
      .collect();
  },
});
