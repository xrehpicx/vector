import { mutation, type MutationCtx } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { requireAuthUserId } from '../authUtils';
import { canViewIssue } from '../access';
import {
  agentDeviceServiceTypeValidator,
  agentProcessModeValidator,
  agentProcessStatusValidator,
  agentProviderValidator,
  agentCommandKindValidator,
  delegatedRunLaunchStatusValidator,
  liveActivityStatusValidator,
  liveMessageDirectionValidator,
  liveMessageRoleValidator,
  workSessionAccessLevelValidator,
  workspaceLaunchPolicyValidator,
  AGENT_PROVIDER_LABELS,
} from '../_shared/agentBridge';
import {
  recordActivity,
  resolveIssueScope,
  snapshotForIssue,
} from '../activities/lib';
import { createNotificationEvent, getIssueHref } from '../notifications/lib';
import { getWorkSessionAccess, requireWorkSessionViewer } from './workSessions';

// ── Agent Devices ───────────────────────────────────────────────────────────

/** Register or update a device (upsert by deviceKey). */
export const upsertDevice = mutation({
  args: {
    deviceKey: v.string(),
    displayName: v.string(),
    hostname: v.optional(v.string()),
    platform: v.optional(v.string()),
    serviceType: agentDeviceServiceTypeValidator,
    cliVersion: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query('agentDevices')
      .withIndex('by_user_device_key', q =>
        q.eq('userId', userId).eq('deviceKey', args.deviceKey),
      )
      .first();

    if (existing) {
      await ctx.db.patch('agentDevices', existing._id, {
        displayName: args.displayName,
        hostname: args.hostname,
        platform: args.platform,
        serviceType: args.serviceType,
        cliVersion: args.cliVersion,
        capabilities: args.capabilities,
        status: 'online',
        lastSeenAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert('agentDevices', {
      userId,
      deviceKey: args.deviceKey,
      displayName: args.displayName,
      hostname: args.hostname,
      platform: args.platform,
      serviceType: args.serviceType,
      cliVersion: args.cliVersion,
      capabilities: args.capabilities,
      status: 'online',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Register or refresh the bridge device and rotate its bridge secret. */
export const registerBridgeDevice = mutation({
  args: {
    deviceKey: v.string(),
    displayName: v.string(),
    hostname: v.optional(v.string()),
    platform: v.optional(v.string()),
    serviceType: agentDeviceServiceTypeValidator,
    cliVersion: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const now = Date.now();
    const deviceSecret = crypto.randomUUID();

    const existing = await ctx.db
      .query('agentDevices')
      .withIndex('by_user_device_key', q =>
        q.eq('userId', userId).eq('deviceKey', args.deviceKey),
      )
      .first();

    if (existing) {
      await ctx.db.patch('agentDevices', existing._id, {
        deviceSecret,
        displayName: args.displayName,
        hostname: args.hostname,
        platform: args.platform,
        serviceType: args.serviceType,
        cliVersion: args.cliVersion,
        capabilities: args.capabilities,
        status: 'online',
        lastSeenAt: now,
        updatedAt: now,
      });

      return {
        deviceId: existing._id,
        deviceSecret,
        userId,
        status: 'updated' as const,
      };
    }

    const deviceId = await ctx.db.insert('agentDevices', {
      userId,
      deviceKey: args.deviceKey,
      deviceSecret,
      displayName: args.displayName,
      hostname: args.hostname,
      platform: args.platform,
      serviceType: args.serviceType,
      cliVersion: args.cliVersion,
      capabilities: args.capabilities,
      status: 'online',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      deviceId,
      deviceSecret,
      userId,
      status: 'created' as const,
    };
  },
});

/** Rename a device. */
export const renameDevice = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    await ctx.db.patch('agentDevices', args.deviceId, {
      displayName: args.displayName,
      updatedAt: Date.now(),
    });
  },
});

/** Revoke a device — clears secret and marks offline. */
export const revokeDevice = mutation({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    await ctx.db.patch('agentDevices', args.deviceId, {
      deviceSecret: undefined,
      status: 'offline',
      updatedAt: Date.now(),
    });
  },
});

/** Remove a device entirely. */
export const removeDevice = mutation({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    await ctx.db.delete('agentDevices', args.deviceId);
  },
});

/** Device heartbeat — update lastSeenAt and status. */
export const deviceHeartbeat = mutation({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    await ctx.db.patch('agentDevices', args.deviceId, {
      status: 'online',
      lastSeenAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Mark a device as offline. */
export const setDeviceOffline = mutation({
  args: { deviceId: v.id('agentDevices') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    await ctx.db.patch('agentDevices', args.deviceId, {
      status: 'offline',
      updatedAt: Date.now(),
    });
  },
});

// ── Device Workspaces ───────────────────────────────────────────────────────

/** Add or update a workspace on a device. */
export const upsertWorkspace = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    label: v.string(),
    path: v.string(),
    repoName: v.optional(v.string()),
    repoRemote: v.optional(v.string()),
    defaultBranch: v.optional(v.string()),
    projectId: v.optional(v.id('projects')),
    teamId: v.optional(v.id('teams')),
    isDefault: v.boolean(),
    launchPolicy: workspaceLaunchPolicyValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    const now = Date.now();

    // If marking as default, unset other defaults for this device
    if (args.isDefault) {
      const existing = await ctx.db
        .query('deviceWorkspaces')
        .withIndex('by_device_default', q =>
          q.eq('deviceId', args.deviceId).eq('isDefault', true),
        )
        .collect();

      for (const ws of existing) {
        await ctx.db.patch('deviceWorkspaces', ws._id, {
          isDefault: false,
          updatedAt: now,
        });
      }
    }

    return ctx.db.insert('deviceWorkspaces', {
      deviceId: args.deviceId,
      userId,
      label: args.label,
      path: args.path,
      repoName: args.repoName,
      repoRemote: args.repoRemote,
      defaultBranch: args.defaultBranch,
      projectId: args.projectId,
      teamId: args.teamId,
      isDefault: args.isDefault,
      launchPolicy: args.launchPolicy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Mark one workspace as the default for its device. */
export const setDefaultWorkspace = mutation({
  args: { workspaceId: v.id('deviceWorkspaces') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const workspace = await ctx.db.get('deviceWorkspaces', args.workspaceId);
    if (!workspace || workspace.userId !== userId) {
      throw new ConvexError('WORKSPACE_NOT_FOUND');
    }

    const now = Date.now();
    const currentDefaults = await ctx.db
      .query('deviceWorkspaces')
      .withIndex('by_device_default', q =>
        q.eq('deviceId', workspace.deviceId).eq('isDefault', true),
      )
      .collect();

    for (const current of currentDefaults) {
      if (current._id === workspace._id) {
        continue;
      }
      await ctx.db.patch('deviceWorkspaces', current._id, {
        isDefault: false,
        updatedAt: now,
      });
    }

    await ctx.db.patch('deviceWorkspaces', workspace._id, {
      isDefault: true,
      updatedAt: now,
    });

    return workspace._id;
  },
});

/** Remove a workspace. */
export const removeWorkspace = mutation({
  args: { workspaceId: v.id('deviceWorkspaces') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const ws = await ctx.db.get('deviceWorkspaces', args.workspaceId);
    if (!ws || ws.userId !== userId) {
      throw new ConvexError('WORKSPACE_NOT_FOUND');
    }
    await ctx.db.delete('deviceWorkspaces', args.workspaceId);
  },
});

// ── Agent Processes ─────────────────────────────────────────────────────────

/** Report a local process (upsert by sessionKey or insert). */
export const reportProcess = mutation({
  args: {
    deviceId: v.id('agentDevices'),
    provider: agentProviderValidator,
    providerLabel: v.optional(v.string()),
    localProcessId: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    cwd: v.optional(v.string()),
    repoRoot: v.optional(v.string()),
    branch: v.optional(v.string()),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    responseText: v.optional(v.string()),
    launchCommand: v.optional(v.string()),
    mode: agentProcessModeValidator,
    status: agentProcessStatusValidator,
    supportsInboundMessages: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    const now = Date.now();

    // Upsert by sessionKey if provided
    if (args.sessionKey) {
      const existing = await ctx.db
        .query('agentProcesses')
        .withIndex('by_session_key', q => q.eq('sessionKey', args.sessionKey))
        .first();

      if (existing && existing.userId === userId) {
        await ctx.db.patch('agentProcesses', existing._id, {
          provider: args.provider,
          providerLabel: args.providerLabel,
          localProcessId: args.localProcessId,
          cwd: args.cwd,
          repoRoot: args.repoRoot,
          branch: args.branch,
          title: args.title,
          model: args.model,
          mode: args.mode,
          status: args.status,
          supportsInboundMessages: args.supportsInboundMessages,
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
      userId,
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

/** Update process status. */
export const updateProcessStatus = mutation({
  args: {
    processId: v.id('agentProcesses'),
    status: agentProcessStatusValidator,
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const process = await ctx.db.get('agentProcesses', args.processId);
    if (!process || process.userId !== userId) {
      throw new ConvexError('PROCESS_NOT_FOUND');
    }

    const now = Date.now();
    const isTerminal = ['completed', 'failed', 'disconnected'].includes(
      args.status,
    );

    await ctx.db.patch('agentProcesses', args.processId, {
      status: args.status,
      ...(args.title && { title: args.title }),
      lastHeartbeatAt: now,
      ...(isTerminal && { endedAt: now }),
    });
  },
});

// ── Issue Live Activities ───────────────────────────────────────────────────

async function createWorkSessionForLiveActivity(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>;
    issueId: Id<'issues'>;
    liveActivityId: Id<'issueLiveActivities'>;
    deviceId: Id<'agentDevices'>;
    ownerUserId: Id<'users'>;
    workspaceId?: Id<'deviceWorkspaces'>;
    workspacePath?: string;
    title?: string;
    status: 'active' | 'waiting_for_input' | 'paused';
    agentProvider?: 'codex' | 'claude_code' | 'vector_cli';
    agentProcessId?: Id<'agentProcesses'>;
    agentSessionKey?: string;
    cwd?: string;
    repoRoot?: string;
    branch?: string;
    tmuxSessionName?: string;
    tmuxWindowName?: string;
    tmuxPaneId?: string;
  },
) {
  const now = Date.now();
  return ctx.db.insert('workSessions', {
    organizationId: args.organizationId,
    issueId: args.issueId,
    liveActivityId: args.liveActivityId,
    deviceId: args.deviceId,
    workspaceId: args.workspaceId,
    ownerUserId: args.ownerUserId,
    title: args.title,
    status: args.status,
    workspacePath: args.workspacePath,
    cwd: args.cwd ?? args.workspacePath,
    repoRoot: args.repoRoot,
    branch: args.branch,
    tmuxSessionName: args.tmuxSessionName,
    tmuxWindowName: args.tmuxWindowName,
    tmuxPaneId: args.tmuxPaneId,
    agentProvider: args.agentProvider,
    agentProcessId: args.agentProcessId,
    agentSessionKey: args.agentSessionKey,
    startedAt: now,
    lastEventAt: now,
  });
}

async function enqueueDelegatedLaunchCommand(
  ctx: MutationCtx,
  args: {
    issue: Doc<'issues'>;
    deviceId: Id<'agentDevices'>;
    workspace: Doc<'deviceWorkspaces'>;
    delegatedRunId: Id<'delegatedRuns'>;
    liveActivityId: Id<'issueLiveActivities'>;
    senderUserId: Id<'users'>;
    provider?: 'codex' | 'claude_code' | 'vector_cli';
    createdAt?: number;
  },
) {
  return ctx.db.insert('agentCommands', {
    deviceId: args.deviceId,
    liveActivityId: args.liveActivityId,
    senderUserId: args.senderUserId,
    kind: 'launch',
    payload: {
      issueId: args.issue._id,
      issueKey: args.issue.key,
      issueTitle: args.issue.title,
      issueDescription: args.issue.description,
      provider: args.provider,
      workspacePath: args.workspace.path,
      workspaceLabel: args.workspace.label,
      delegatedRunId: args.delegatedRunId,
      liveActivityId: args.liveActivityId,
    },
    status: 'pending',
    createdAt: args.createdAt ?? Date.now(),
  });
}

/**
 * Auto-transition an issue to "in_progress" when a live activity starts,
 * but only if the issue is currently in a pre-progress state (backlog/todo).
 */
async function autoTransitionToInProgress(
  ctx: MutationCtx,
  issue: Doc<'issues'>,
  actorId: Id<'users'>,
) {
  const currentState = issue.workflowStateId
    ? await ctx.db.get('issueStates', issue.workflowStateId)
    : null;

  // Only transition from backlog or todo (or if no state is set)
  if (
    currentState &&
    currentState.type !== 'backlog' &&
    currentState.type !== 'todo'
  ) {
    return;
  }

  const inProgressState = await ctx.db
    .query('issueStates')
    .withIndex('by_org_type', q =>
      q.eq('organizationId', issue.organizationId).eq('type', 'in_progress'),
    )
    .first();

  if (!inProgressState) return;
  if (issue.workflowStateId === inProgressState._id) return;

  await ctx.db.patch('issues', issue._id, {
    workflowStateId: inProgressState._id,
  });

  await recordActivity(ctx, {
    actorId,
    entityType: 'issue',
    eventType: 'issue_workflow_state_changed',
    scope: resolveIssueScope(issue),
    snapshot: snapshotForIssue(issue),
    details: {
      field: 'workflow_state',
      fromId: issue.workflowStateId,
      fromLabel: currentState?.name,
      toId: inProgressState._id,
      toLabel: inProgressState.name,
    },
  });
}

/** Attach a process to an issue as a live activity. */
export const attachLiveActivity = mutation({
  args: {
    issueId: v.id('issues'),
    deviceId: v.id('agentDevices'),
    processId: v.optional(v.id('agentProcesses')),
    provider: agentProviderValidator,
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue) throw new ConvexError('ISSUE_NOT_FOUND');
    if (!(await canViewIssue(ctx, issue))) throw new ConvexError('FORBIDDEN');

    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    const process = args.processId
      ? await ctx.db.get('agentProcesses', args.processId)
      : null;
    if (args.processId) {
      if (!process || process.deviceId !== args.deviceId) {
        throw new ConvexError('PROCESS_NOT_FOUND');
      }
      if (process.provider !== args.provider) {
        throw new ConvexError('PROCESS_PROVIDER_MISMATCH');
      }
    }

    const now = Date.now();
    const providerLabel = AGENT_PROVIDER_LABELS[args.provider] ?? args.provider;

    const liveActivityId = await ctx.db.insert('issueLiveActivities', {
      organizationId: issue.organizationId,
      issueId: args.issueId,
      deviceId: args.deviceId,
      processId: args.processId,
      ownerUserId: userId,
      provider: args.provider,
      title: args.title,
      status: 'active',
      startedAt: now,
      lastEventAt: now,
    });

    const workSessionId = await createWorkSessionForLiveActivity(ctx, {
      organizationId: issue.organizationId,
      issueId: args.issueId,
      liveActivityId,
      deviceId: args.deviceId,
      ownerUserId: userId,
      title: args.title ?? process?.title,
      status: 'active',
      agentProvider: args.provider,
      agentProcessId: process?._id,
      agentSessionKey: process?.sessionKey,
      workspacePath: process?.cwd ?? process?.repoRoot,
      cwd: process?.cwd,
      repoRoot: process?.repoRoot,
      branch: process?.branch,
      tmuxSessionName: process?.tmuxSessionName,
      tmuxWindowName: process?.tmuxWindowName,
      tmuxPaneId: process?.tmuxPaneId,
    });

    await ctx.db.patch('issueLiveActivities', liveActivityId, {
      workSessionId,
    });

    // Record activity event
    await recordActivity(ctx, {
      actorId: userId,
      entityType: 'issue',
      eventType: 'issue_live_activity_started',
      scope: resolveIssueScope(issue),
      snapshot: snapshotForIssue(issue),
      details: {
        field: 'live_activity',
        liveActivityId,
        agentProvider: args.provider,
        agentProviderLabel: providerLabel,
        deviceName: device.displayName,
      },
    });

    // Auto-transition issue to "In Progress"
    await autoTransitionToInProgress(ctx, issue, userId);

    return liveActivityId;
  },
});

/** Reconnect a disconnected/canceled live activity back to active. */
export const reconnectLiveActivity = mutation({
  args: {
    liveActivityId: v.id('issueLiveActivities'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity || activity.ownerUserId !== userId) {
      throw new ConvexError('LIVE_ACTIVITY_NOT_FOUND');
    }

    if (!['disconnected', 'canceled'].includes(activity.status)) {
      throw new ConvexError('ACTIVITY_NOT_RECONNECTABLE');
    }

    const now = Date.now();

    const workSession = activity.workSessionId
      ? await ctx.db.get('workSessions', activity.workSessionId)
      : null;

    await ctx.db.patch('issueLiveActivities', args.liveActivityId, {
      status: 'active',
      processId: workSession?.workspaceId ? undefined : activity.processId,
      lastEventAt: now,
      endedAt: undefined,
    });

    if (workSession) {
      await ctx.db.patch('workSessions', workSession._id, {
        status: 'active',
        lastEventAt: now,
        endedAt: undefined,
        agentProcessId: workSession.workspaceId
          ? undefined
          : workSession.agentProcessId,
        agentSessionKey: workSession.workspaceId
          ? undefined
          : workSession.agentSessionKey,
        tmuxSessionName: workSession.workspaceId
          ? undefined
          : workSession.tmuxSessionName,
        tmuxWindowName: workSession.workspaceId
          ? undefined
          : workSession.tmuxWindowName,
        tmuxPaneId: workSession.workspaceId
          ? undefined
          : workSession.tmuxPaneId,
        terminalUrl: undefined,
        terminalToken: undefined,
        terminalLocalPort: undefined,
        terminalViewerActive: undefined,
      });
    }

    if (!workSession?.workspaceId) {
      return;
    }

    const delegatedRun = await ctx.db
      .query('delegatedRuns')
      .withIndex('by_live_activity', q =>
        q.eq('liveActivityId', args.liveActivityId),
      )
      .first();
    if (!delegatedRun) {
      throw new ConvexError('DELEGATED_RUN_NOT_FOUND');
    }

    const issue = await ctx.db.get('issues', activity.issueId);
    if (!issue) {
      throw new ConvexError('ISSUE_NOT_FOUND');
    }

    const workspace = await ctx.db.get(
      'deviceWorkspaces',
      delegatedRun.workspaceId,
    );
    if (!workspace || workspace.deviceId !== activity.deviceId) {
      throw new ConvexError('WORKSPACE_NOT_FOUND');
    }
    if (workspace.launchPolicy !== 'allow_delegated') {
      throw new ConvexError('WORKSPACE_LAUNCH_NOT_ALLOWED');
    }

    await ctx.db.patch('delegatedRuns', delegatedRun._id, {
      launchStatus: 'pending',
      tmuxSessionName: undefined,
      tmuxWindowName: undefined,
      tmuxPaneId: undefined,
      launchCommand: undefined,
      launchedAt: undefined,
      endedAt: undefined,
    });

    await enqueueDelegatedLaunchCommand(ctx, {
      issue,
      deviceId: activity.deviceId,
      workspace,
      delegatedRunId: delegatedRun._id,
      liveActivityId: args.liveActivityId,
      senderUserId: userId,
      provider: workSession.agentProvider,
      createdAt: now,
    });
  },
});

/** Update a live activity's status. */
export const updateLiveActivityStatus = mutation({
  args: {
    liveActivityId: v.id('issueLiveActivities'),
    status: liveActivityStatusValidator,
    latestSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity || activity.ownerUserId !== userId) {
      throw new ConvexError('LIVE_ACTIVITY_NOT_FOUND');
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
      ...(args.latestSummary && { latestSummary: args.latestSummary }),
      lastEventAt: now,
      ...(isTerminal && { endedAt: now }),
    });

    if (activity.workSessionId) {
      await ctx.db.patch('workSessions', activity.workSessionId, {
        status: args.status,
        lastEventAt: now,
        ...(isTerminal && { endedAt: now }),
      });
    }

    // Record activity event for status changes
    const issue = await ctx.db.get('issues', activity.issueId);
    if (issue) {
      const providerLabel =
        AGENT_PROVIDER_LABELS[activity.provider] ?? activity.provider;

      await recordActivity(ctx, {
        actorId: userId,
        entityType: 'issue',
        eventType: isTerminal
          ? 'issue_live_activity_completed'
          : 'issue_live_activity_status_changed',
        scope: resolveIssueScope(issue),
        snapshot: snapshotForIssue(issue),
        details: {
          field: 'live_activity',
          fromLabel: activity.status,
          toLabel: args.status,
          liveActivityId: args.liveActivityId,
          agentProvider: activity.provider,
          agentProviderLabel: providerLabel,
        },
      });

      // Notify session owner when session reaches terminal state
      if (
        isTerminal &&
        (args.status === 'completed' || args.status === 'failed')
      ) {
        const org = await ctx.db.get('organizations', issue.organizationId);
        if (org) {
          await createNotificationEvent(ctx, {
            type:
              args.status === 'completed'
                ? 'work_session_completed'
                : 'work_session_failed',
            actorId: userId,
            organizationId: issue.organizationId,
            issueId: issue._id,
            payload: {
              issueKey: issue.key,
              issueTitle: issue.title,
              href: getIssueHref(org.slug, issue.key),
            },
            recipients: [{ userId: activity.ownerUserId }],
          });
        }
      }
    }
  },
});

/** Complete a live activity and post a final branded comment. */
export const completeLiveActivity = mutation({
  args: {
    liveActivityId: v.id('issueLiveActivities'),
    status: v.union(v.literal('completed'), v.literal('failed')),
    summary: v.optional(v.string()),
    commentBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity || activity.ownerUserId !== userId) {
      throw new ConvexError('LIVE_ACTIVITY_NOT_FOUND');
    }

    const now = Date.now();
    const providerLabel =
      AGENT_PROVIDER_LABELS[activity.provider] ?? activity.provider;

    // Post final branded comment if body provided
    let finalCommentId = undefined;
    if (args.commentBody) {
      finalCommentId = await ctx.db.insert('comments', {
        issueId: activity.issueId,
        authorId: userId,
        body: args.commentBody,
        deleted: false,
        authorKind: 'agent',
        agentSource:
          activity.provider === 'vector_cli' ? 'vector' : activity.provider,
        agentLabel: providerLabel,
        liveActivityId: args.liveActivityId,
        generationStatus: 'done',
      });
    }

    // Close the live activity
    await ctx.db.patch('issueLiveActivities', args.liveActivityId, {
      status: args.status,
      latestSummary: args.summary,
      lastEventAt: now,
      endedAt: now,
      finalCommentId,
    });

    if (activity.workSessionId) {
      await ctx.db.patch('workSessions', activity.workSessionId, {
        status: args.status,
        lastEventAt: now,
        endedAt: now,
      });
    }

    // Record activity event
    const issue = await ctx.db.get('issues', activity.issueId);
    if (issue) {
      await recordActivity(ctx, {
        actorId: userId,
        entityType: 'issue',
        eventType: 'issue_live_activity_completed',
        scope: resolveIssueScope(issue),
        snapshot: snapshotForIssue(issue),
        details: {
          field: 'live_activity',
          fromLabel: activity.status,
          toLabel: args.status,
          liveActivityId: args.liveActivityId,
          agentProvider: activity.provider,
          agentProviderLabel: providerLabel,
          ...(finalCommentId && { commentId: finalCommentId }),
        },
      });

      // Notify session owner
      const org = await ctx.db.get('organizations', issue.organizationId);
      if (org) {
        await createNotificationEvent(ctx, {
          type:
            args.status === 'completed'
              ? 'work_session_completed'
              : 'work_session_failed',
          actorId: userId,
          organizationId: issue.organizationId,
          issueId: issue._id,
          payload: {
            issueKey: issue.key,
            issueTitle: issue.title,
            href: getIssueHref(org.slug, issue.key),
          },
          recipients: [{ userId: activity.ownerUserId }],
        });
      }
    }
  },
});

export const shareWorkSession = mutation({
  args: {
    workSessionId: v.id('workSessions'),
    userId: v.id('users'),
    accessLevel: workSessionAccessLevelValidator,
  },
  handler: async (ctx, args) => {
    const workSession = await ctx.db.get('workSessions', args.workSessionId);
    if (!workSession) {
      throw new ConvexError('WORK_SESSION_NOT_FOUND');
    }

    const access = await requireWorkSessionViewer(ctx, workSession);
    if (!access.canManage) {
      throw new ConvexError('FORBIDDEN');
    }

    const member = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q
          .eq('organizationId', workSession.organizationId)
          .eq('userId', args.userId),
      )
      .first();
    if (!member) {
      throw new ConvexError('MEMBER_NOT_FOUND');
    }

    const now = Date.now();
    const existing = await ctx.db
      .query('workSessionShares')
      .withIndex('by_work_session_user', q =>
        q.eq('workSessionId', args.workSessionId).eq('userId', args.userId),
      )
      .first();

    if (existing) {
      await ctx.db.patch('workSessionShares', existing._id, {
        accessLevel: args.accessLevel,
      });
      return existing._id;
    }

    return ctx.db.insert('workSessionShares', {
      workSessionId: args.workSessionId,
      userId: args.userId,
      grantedByUserId: access.userId,
      accessLevel: args.accessLevel,
      createdAt: now,
    });
  },
});

export const revokeWorkSessionShare = mutation({
  args: {
    workSessionId: v.id('workSessions'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const workSession = await ctx.db.get('workSessions', args.workSessionId);
    if (!workSession) {
      throw new ConvexError('WORK_SESSION_NOT_FOUND');
    }

    const access = await requireWorkSessionViewer(ctx, workSession);
    if (!access.canManage) {
      throw new ConvexError('FORBIDDEN');
    }

    const existing = await ctx.db
      .query('workSessionShares')
      .withIndex('by_work_session_user', q =>
        q.eq('workSessionId', args.workSessionId).eq('userId', args.userId),
      )
      .first();

    if (existing) {
      await ctx.db.delete('workSessionShares', existing._id);
    }
  },
});

// ── Live Messages ───────────────────────────────────────────────────────────

/** Append a message to a live activity transcript. */
export const appendLiveMessage = mutation({
  args: {
    liveActivityId: v.id('issueLiveActivities'),
    direction: liveMessageDirectionValidator,
    role: liveMessageRoleValidator,
    body: v.string(),
    structuredPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity) throw new ConvexError('LIVE_ACTIVITY_NOT_FOUND');

    if (args.direction !== 'vector_to_agent') {
      throw new ConvexError('FORBIDDEN');
    }

    const workSessionAccess = await getWorkSessionAccess(
      ctx,
      activity.workSessionId,
    );

    const canInteract = activity.workSessionId
      ? workSessionAccess.canInteract
      : activity.ownerUserId === userId;
    if (!canInteract) {
      throw new ConvexError('FORBIDDEN');
    }

    const now = Date.now();

    const messageId = await ctx.db.insert('issueLiveMessages', {
      liveActivityId: args.liveActivityId,
      direction: args.direction,
      role: args.role,
      body: args.body,
      structuredPayload: args.structuredPayload,
      deliveryStatus: 'pending',
      createdAt: now,
    });

    // Update the live activity's lastEventAt
    await ctx.db.patch('issueLiveActivities', args.liveActivityId, {
      lastEventAt: now,
      ...(args.role === 'status' && { latestSummary: args.body }),
    });

    if (activity.workSessionId) {
      await ctx.db.patch('workSessions', activity.workSessionId, {
        lastEventAt: now,
      });
    }

    // If this is a user message to the agent, create a command
    await ctx.db.insert('agentCommands', {
      deviceId: activity.deviceId,
      processId: activity.processId,
      liveActivityId: args.liveActivityId,
      senderUserId: userId,
      kind: 'message',
      payload: { body: args.body, messageId },
      status: 'pending',
      createdAt: now,
    });

    return messageId;
  },
});

/** Update delivery status of a live message. */
export const updateMessageDelivery = mutation({
  args: {
    messageId: v.id('issueLiveMessages'),
    deliveryStatus: v.union(v.literal('delivered'), v.literal('failed')),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const msg = await ctx.db.get('issueLiveMessages', args.messageId);
    if (!msg) throw new ConvexError('MESSAGE_NOT_FOUND');

    const activity = await ctx.db.get(
      'issueLiveActivities',
      msg.liveActivityId,
    );
    if (!activity || activity.ownerUserId !== userId) {
      throw new ConvexError('FORBIDDEN');
    }

    await ctx.db.patch('issueLiveMessages', args.messageId, {
      deliveryStatus: args.deliveryStatus,
    });
  },
});

/** Request the bridge to resize a tmux pane to match the web terminal. */
export const resizeWorkSessionTerminal = mutation({
  args: {
    liveActivityId: v.id('issueLiveActivities'),
    cols: v.number(),
    rows: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity) throw new ConvexError('LIVE_ACTIVITY_NOT_FOUND');

    // Allow owner or anyone with view access
    if (activity.workSessionId) {
      const workSession = await ctx.db.get(
        'workSessions',
        activity.workSessionId,
      );
      if (workSession) {
        await requireWorkSessionViewer(ctx, workSession);
      }
    } else if (activity.ownerUserId !== userId) {
      throw new ConvexError('FORBIDDEN');
    }

    // Don't resize ended sessions
    if (activity.endedAt) return;

    await ctx.db.insert('agentCommands', {
      deviceId: activity.deviceId,
      liveActivityId: args.liveActivityId,
      senderUserId: userId,
      kind: 'resize',
      payload: { cols: args.cols, rows: args.rows },
      status: 'pending',
      createdAt: Date.now(),
    });
  },
});

// ── Agent Commands ──────────────────────────────────────────────────────────

/** Claim a pending command (called by the local bridge). */
export const claimCommand = mutation({
  args: { commandId: v.id('agentCommands') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const cmd = await ctx.db.get('agentCommands', args.commandId);
    if (!cmd) throw new ConvexError('COMMAND_NOT_FOUND');

    const device = await ctx.db.get('agentDevices', cmd.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('FORBIDDEN');
    }

    if (cmd.status !== 'pending') {
      throw new ConvexError('COMMAND_ALREADY_CLAIMED');
    }

    await ctx.db.patch('agentCommands', args.commandId, {
      status: 'claimed',
      claimedAt: Date.now(),
    });
  },
});

/** Mark a command as delivered or failed. */
export const completeCommand = mutation({
  args: {
    commandId: v.id('agentCommands'),
    status: v.union(v.literal('delivered'), v.literal('failed')),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const cmd = await ctx.db.get('agentCommands', args.commandId);
    if (!cmd) throw new ConvexError('COMMAND_NOT_FOUND');

    const device = await ctx.db.get('agentDevices', cmd.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('FORBIDDEN');
    }

    await ctx.db.patch('agentCommands', args.commandId, {
      status: args.status,
      completedAt: Date.now(),
    });
  },
});

/** Send a command to a live activity's device. */
export const sendCommand = mutation({
  args: {
    liveActivityId: v.id('issueLiveActivities'),
    kind: agentCommandKindValidator,
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const activity = await ctx.db.get(
      'issueLiveActivities',
      args.liveActivityId,
    );
    if (!activity) throw new ConvexError('LIVE_ACTIVITY_NOT_FOUND');

    const workSessionAccess = await getWorkSessionAccess(
      ctx,
      activity.workSessionId,
    );
    const canInteract = activity.workSessionId
      ? workSessionAccess.canInteract
      : activity.ownerUserId === userId;

    if (!canInteract) {
      throw new ConvexError('FORBIDDEN');
    }

    return ctx.db.insert('agentCommands', {
      deviceId: activity.deviceId,
      processId: activity.processId,
      liveActivityId: args.liveActivityId,
      senderUserId: userId,
      kind: args.kind,
      payload: args.payload,
      status: 'pending',
      createdAt: Date.now(),
    });
  },
});

// ── Delegated Runs ──────────────────────────────────────────────────────────

/** Delegate an issue to a device/agent/workspace. */
export const delegateIssue = mutation({
  args: {
    issueId: v.id('issues'),
    deviceId: v.id('agentDevices'),
    workspaceId: v.id('deviceWorkspaces'),
    provider: v.optional(
      v.union(
        v.literal('codex'),
        v.literal('claude_code'),
        v.literal('vector_cli'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue) throw new ConvexError('ISSUE_NOT_FOUND');
    if (!(await canViewIssue(ctx, issue))) throw new ConvexError('FORBIDDEN');

    const device = await ctx.db.get('agentDevices', args.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('DEVICE_NOT_FOUND');
    }

    if (device.status !== 'online') {
      throw new ConvexError('DEVICE_OFFLINE');
    }

    const workspace = await ctx.db.get('deviceWorkspaces', args.workspaceId);
    if (!workspace || workspace.deviceId !== args.deviceId) {
      throw new ConvexError('WORKSPACE_NOT_FOUND');
    }

    if (workspace.launchPolicy !== 'allow_delegated') {
      throw new ConvexError('WORKSPACE_LAUNCH_NOT_ALLOWED');
    }

    const now = Date.now();
    const providerLabel = args.provider
      ? (AGENT_PROVIDER_LABELS[args.provider] ?? args.provider)
      : 'Work Session';
    const liveActivityProvider = args.provider ?? 'vector_cli';
    const liveActivityTitle = args.provider
      ? `${providerLabel} on ${device.displayName}`
      : `${device.displayName} shell session`;

    // Create live activity
    const liveActivityId = await ctx.db.insert('issueLiveActivities', {
      organizationId: issue.organizationId,
      issueId: args.issueId,
      deviceId: args.deviceId,
      ownerUserId: userId,
      provider: liveActivityProvider,
      title: liveActivityTitle,
      status: 'active',
      startedAt: now,
      lastEventAt: now,
    });

    const workSessionId = await createWorkSessionForLiveActivity(ctx, {
      organizationId: issue.organizationId,
      issueId: args.issueId,
      liveActivityId,
      deviceId: args.deviceId,
      ownerUserId: userId,
      workspaceId: args.workspaceId,
      workspacePath: workspace.path,
      title: `${issue.key}: ${issue.title}`,
      status: 'active',
      agentProvider: args.provider,
      cwd: workspace.path,
    });

    await ctx.db.patch('issueLiveActivities', liveActivityId, {
      workSessionId,
    });

    // Create delegated run
    const runId = await ctx.db.insert('delegatedRuns', {
      organizationId: issue.organizationId,
      issueId: args.issueId,
      liveActivityId,
      deviceId: args.deviceId,
      workspaceId: args.workspaceId,
      requestedByUserId: userId,
      provider: liveActivityProvider,
      launchMode: 'delegated_launch',
      workspacePath: workspace.path,
      launchStatus: 'pending',
    });

    // Enqueue launch command to the device
    await enqueueDelegatedLaunchCommand(ctx, {
      issue,
      deviceId: args.deviceId,
      workspace,
      delegatedRunId: runId,
      liveActivityId,
      senderUserId: userId,
      provider: args.provider,
      createdAt: now,
    });

    // Record activity event
    await recordActivity(ctx, {
      actorId: userId,
      entityType: 'issue',
      eventType: 'issue_live_activity_delegated',
      scope: resolveIssueScope(issue),
      snapshot: snapshotForIssue(issue),
      details: {
        field: 'live_activity',
        liveActivityId,
        agentProvider: args.provider,
        agentProviderLabel: providerLabel,
        deviceName: device.displayName,
        workspaceLabel: workspace.label,
      },
    });

    // Auto-transition issue to "In Progress"
    await autoTransitionToInProgress(ctx, issue, userId);

    return { liveActivityId, delegatedRunId: runId };
  },
});

/** Update a delegated run's launch status and tmux metadata. */
export const updateDelegatedRun = mutation({
  args: {
    delegatedRunId: v.id('delegatedRuns'),
    launchStatus: delegatedRunLaunchStatusValidator,
    tmuxSessionName: v.optional(v.string()),
    tmuxWindowName: v.optional(v.string()),
    tmuxPaneId: v.optional(v.string()),
    launchCommand: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const run = await ctx.db.get('delegatedRuns', args.delegatedRunId);
    if (!run) throw new ConvexError('DELEGATED_RUN_NOT_FOUND');

    const device = await ctx.db.get('agentDevices', run.deviceId);
    if (!device || device.userId !== userId) {
      throw new ConvexError('FORBIDDEN');
    }

    const now = Date.now();
    const isTerminal = ['completed', 'failed', 'canceled'].includes(
      args.launchStatus,
    );

    await ctx.db.patch('delegatedRuns', args.delegatedRunId, {
      launchStatus: args.launchStatus,
      ...(args.tmuxSessionName && { tmuxSessionName: args.tmuxSessionName }),
      ...(args.tmuxWindowName && { tmuxWindowName: args.tmuxWindowName }),
      ...(args.tmuxPaneId && { tmuxPaneId: args.tmuxPaneId }),
      ...(args.launchCommand && { launchCommand: args.launchCommand }),
      ...(args.launchStatus === 'running' && { launchedAt: now }),
      ...(isTerminal && { endedAt: now }),
    });
  },
});

// ── Terminal Signaling (WebRTC) ─────────────────────────────────────────────

/** Send a WebRTC signaling message (offer, answer, or ICE candidate). */
export const sendTerminalSignal = mutation({
  args: {
    workSessionId: v.id('workSessions'),
    from: v.union(v.literal('browser'), v.literal('bridge')),
    type: v.union(
      v.literal('offer'),
      v.literal('answer'),
      v.literal('candidate'),
    ),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    const workSession = await ctx.db.get('workSessions', args.workSessionId);
    if (!workSession) throw new ConvexError('WORK_SESSION_NOT_FOUND');

    // Browser senders need view access; bridge senders need to be the device owner
    if (args.from === 'browser') {
      await requireWorkSessionViewer(ctx, workSession);
    } else if (workSession.ownerUserId !== userId) {
      throw new ConvexError('FORBIDDEN');
    }

    // When sending an offer, clear ALL old signals (fresh negotiation)
    // When sending an answer, only clear previous answers
    if (args.type === 'offer') {
      const old = await ctx.db
        .query('terminalSignals')
        .withIndex('by_work_session', q =>
          q.eq('workSessionId', args.workSessionId),
        )
        .collect();
      for (const signal of old) {
        await ctx.db.delete('terminalSignals', signal._id);
      }
    }

    await ctx.db.insert('terminalSignals', {
      workSessionId: args.workSessionId,
      from: args.from,
      type: args.type,
      data: args.data,
      createdAt: Date.now(),
    });
  },
});

/** Clear all signaling messages for a work session. */
export const clearTerminalSignals = mutation({
  args: { workSessionId: v.id('workSessions') },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const workSession = await ctx.db.get('workSessions', args.workSessionId);
    if (!workSession) throw new ConvexError('WORK_SESSION_NOT_FOUND');
    await requireWorkSessionViewer(ctx, workSession);

    const signals = await ctx.db
      .query('terminalSignals')
      .withIndex('by_work_session', q =>
        q.eq('workSessionId', args.workSessionId),
      )
      .collect();
    for (const signal of signals) {
      await ctx.db.delete('terminalSignals', signal._id);
    }
  },
});

/** Set or clear a custom title for a work session. */
export const setWorkSessionTitle = mutation({
  args: {
    workSessionId: v.id('workSessions'),
    title: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const ws = await ctx.db.get('workSessions', args.workSessionId);
    if (!ws) throw new ConvexError('WORK_SESSION_NOT_FOUND');
    await requireWorkSessionViewer(ctx, ws);

    if (args.title) {
      // User set a custom title — lock it
      await ctx.db.patch('workSessions', args.workSessionId, {
        title: args.title,
        titleLockedByUser: true,
      });
    } else {
      // User cleared the custom title — unlock for auto-generation
      await ctx.db.patch('workSessions', args.workSessionId, {
        titleLockedByUser: false,
      });
    }
  },
});

// ── Interactive Terminal (Convex-relay) ─────────────────────────────────────

/** Send terminal input (keystrokes) from the browser to the bridge via Convex. */
export const sendTerminalInput = mutation({
  args: {
    workSessionId: v.id('workSessions'),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    const workSession = await ctx.db.get('workSessions', args.workSessionId);
    if (!workSession) throw new ConvexError('WORK_SESSION_NOT_FOUND');

    const access = await getWorkSessionAccess(ctx, workSession._id);
    if (!access.canInteract) throw new ConvexError('FORBIDDEN');

    // Append to any existing pending input
    const existing = workSession.terminalInput ?? '';
    await ctx.db.patch('workSessions', args.workSessionId, {
      terminalInput: existing + args.data,
    });
  },
});

/** Set terminal viewer active state and dimensions. */
export const setTerminalViewer = mutation({
  args: {
    workSessionId: v.id('workSessions'),
    active: v.boolean(),
    cols: v.optional(v.number()),
    rows: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const workSession = await ctx.db.get('workSessions', args.workSessionId);
    if (!workSession) throw new ConvexError('WORK_SESSION_NOT_FOUND');

    // Require at least viewer access to activate the terminal
    await requireWorkSessionViewer(ctx, workSession);

    await ctx.db.patch('workSessions', args.workSessionId, {
      terminalViewerActive: args.active,
      ...(args.cols !== undefined && { terminalCols: args.cols }),
      ...(args.rows !== undefined && { terminalRows: args.rows }),
    });
  },
});
