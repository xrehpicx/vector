import { mutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { v, ConvexError } from 'convex/values';
import { requireAuthUserId } from '../authUtils';
import { canViewIssue } from '../access';
import {
  agentDeviceServiceTypeValidator,
  agentDeviceStatusValidator,
  agentProcessModeValidator,
  agentProcessStatusValidator,
  agentProviderValidator,
  agentCommandKindValidator,
  delegatedRunLaunchStatusValidator,
  liveActivityStatusValidator,
  liveMessageDirectionValidator,
  liveMessageRoleValidator,
  workspaceLaunchPolicyValidator,
  AGENT_PROVIDER_LABELS,
} from '../_shared/agentBridge';
import {
  recordActivity,
  resolveIssueScope,
  snapshotForIssue,
} from '../activities/lib';

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

    return liveActivityId;
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

    // Only the owner can append agent->vector messages; issue viewers can send vector->agent
    if (args.direction === 'agent_to_vector') {
      if (activity.ownerUserId !== userId) {
        throw new ConvexError('FORBIDDEN');
      }
    } else {
      const issue = await ctx.db.get('issues', activity.issueId);
      if (!issue || !(await canViewIssue(ctx, issue))) {
        throw new ConvexError('FORBIDDEN');
      }
    }

    const now = Date.now();

    const messageId = await ctx.db.insert('issueLiveMessages', {
      liveActivityId: args.liveActivityId,
      direction: args.direction,
      role: args.role,
      body: args.body,
      structuredPayload: args.structuredPayload,
      deliveryStatus: args.direction === 'agent_to_vector' ? 'sent' : 'pending',
      createdAt: now,
    });

    // Update the live activity's lastEventAt
    await ctx.db.patch('issueLiveActivities', args.liveActivityId, {
      lastEventAt: now,
      ...(args.role === 'status' && { latestSummary: args.body }),
    });

    // If this is a user message to the agent, create a command
    if (args.direction === 'vector_to_agent') {
      const commandId = await ctx.db.insert('agentCommands', {
        deviceId: activity.deviceId,
        processId: activity.processId,
        liveActivityId: args.liveActivityId,
        senderUserId: userId,
        kind: 'message',
        payload: { body: args.body },
        status: 'pending',
        createdAt: now,
      });

      // Schedule simulated bridge reply (dev/demo — replaced by real bridge later)
      await ctx.scheduler.runAfter(
        0,
        internal.agentBridge.internal.scheduleBridgeReply,
        {
          commandId,
          liveActivityId: args.liveActivityId,
        },
      );
    }

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

    // Only the device owner can send commands by default
    if (activity.ownerUserId !== userId) {
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
    provider: agentProviderValidator,
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
    const providerLabel = AGENT_PROVIDER_LABELS[args.provider] ?? args.provider;

    // Create live activity
    const liveActivityId = await ctx.db.insert('issueLiveActivities', {
      organizationId: issue.organizationId,
      issueId: args.issueId,
      deviceId: args.deviceId,
      ownerUserId: userId,
      provider: args.provider,
      title: `${providerLabel} on ${device.displayName}`,
      status: 'active',
      startedAt: now,
      lastEventAt: now,
    });

    // Create delegated run
    const runId = await ctx.db.insert('delegatedRuns', {
      organizationId: issue.organizationId,
      issueId: args.issueId,
      liveActivityId,
      deviceId: args.deviceId,
      workspaceId: args.workspaceId,
      requestedByUserId: userId,
      provider: args.provider,
      launchMode: 'delegated_launch',
      workspacePath: workspace.path,
      launchStatus: 'pending',
    });

    // Enqueue launch command to the device
    await ctx.db.insert('agentCommands', {
      deviceId: args.deviceId,
      liveActivityId,
      senderUserId: userId,
      kind: 'launch',
      payload: {
        issueId: args.issueId,
        issueKey: issue.key,
        issueTitle: issue.title,
        provider: args.provider,
        workspacePath: workspace.path,
        workspaceLabel: workspace.label,
        delegatedRunId: runId,
        liveActivityId,
      },
      status: 'pending',
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
