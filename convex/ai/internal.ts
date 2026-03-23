import { internal } from '../_generated/api';
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from '../_generated/server';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import {
  setProjectLeadMemberRole,
  setTeamLeadMemberRole,
} from '../_shared/leads';
import {
  syncOrganizationRoleAssignment,
  syncProjectRoleAssignment,
  syncTeamRoleAssignment,
} from '../roles';
import { buildIssueSearchText } from '../issues/search';
import { getNextAvailableIssueKey } from '../issues/keys';
import { createNotificationEvent } from '../notifications/lib';
import {
  extractReferencedDocumentIds,
  syncDocumentMentions,
} from '../documents/mentions';
import {
  recordActivity,
  resolveIssueScope,
  snapshotForIssue,
} from '../activities/lib';
import {
  activityEntityTypeValidator,
  activityEventTypeValidator,
} from '../_shared/activity';
import {
  AssistantPageContext,
  AssistantPendingAction,
  assistantPageContextValidator,
  buildAssistantThreadPatch,
  canAssignIssueForUser,
  canDeleteEntity,
  canEditEntity,
  canUpdateIssueAssignmentStateForUser,
  canManageProjectMembersForUser,
  canManageTeamMembersForUser,
  canViewEntity,
  findIssuePriorityByName,
  findIssueStateByName,
  findMemberByName,
  findProjectStatusByName,
  getAssistantThreadRow,
  makePendingActionId,
  requireAssistantThreadRow,
  requireOrgForAssistant,
  requireOrgPermissionForUser,
  resolveDocumentFromContext,
  resolveFolderFromContext,
  resolveIssueFromContext,
  resolveProjectFromContext,
  resolveTeamFromContext,
} from './lib';
import { PERMISSIONS } from '../permissions/utils';
import { AGENT_PROVIDER_LABELS } from '../_shared/agentBridge';

function parseGitHubArtifactUrl(
  value: string,
):
  | { type: 'pull_request'; owner: string; repo: string; number: number }
  | { type: 'issue'; owner: string; repo: string; number: number }
  | { type: 'commit'; owner: string; repo: string; sha: string }
  | null {
  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return null;

    const [owner, repo, kind, identifier] = parts;
    if (kind === 'pull' && identifier) {
      return {
        type: 'pull_request',
        owner,
        repo,
        number: Number(identifier),
      };
    }
    if (kind === 'issues' && identifier) {
      return {
        type: 'issue',
        owner,
        repo,
        number: Number(identifier),
      };
    }
    if (kind === 'commit' && identifier) {
      return {
        type: 'commit',
        owner,
        repo,
        sha: identifier,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function summarizePageContext(pageContext: AssistantPageContext) {
  switch (pageContext.kind) {
    case 'document_detail':
      return `current document ${pageContext.documentId ?? 'unknown'}`;
    case 'document_folder':
      return `current document folder ${pageContext.folderId ?? 'unknown'}`;
    case 'documents_list':
      return 'documents list';
    case 'issue_detail':
      return `current issue ${pageContext.issueKey ?? 'unknown'}`;
    case 'issues_list':
      return 'issues list';
    case 'project_detail':
      return `current project ${pageContext.projectKey ?? 'unknown'}`;
    case 'projects_list':
      return 'projects list';
    case 'team_detail':
      return `current team ${pageContext.teamKey ?? 'unknown'}`;
    case 'teams_list':
      return 'teams list';
    default:
      return pageContext.path;
  }
}

export const getPageContextSummary = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: assistantPageContextValidator,
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    return summarizePageContext(args.pageContext);
  },
});

export const getAssistantOrganization = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await requireOrgForAssistant(ctx, args.orgSlug, args.userId);
  },
});

export const getCurrentUserContextSummary = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', organization._id).eq('userId', args.userId),
      )
      .first();
    const user = await ctx.db.get('users', args.userId);

    const displayName =
      user?.name?.trim() ||
      user?.email?.trim() ||
      user?.username?.trim() ||
      'Unknown user';
    const identityParts = [`name "${displayName}"`];

    if (user?.email?.trim()) {
      identityParts.push(`email "${user.email.trim()}"`);
    }
    if (user?.username?.trim()) {
      identityParts.push(`username "${user.username.trim()}"`);
    }

    const lines = [
      `The authenticated user you are speaking to is ${identityParts.join(', ')}.`,
      `They are a ${membership?.role ?? 'member'} in organization "${organization.name}" (${organization.slug}).`,
      'Treat references like "me", "my", "myself", "current user", and "my email" as referring to this person unless the user clearly says otherwise.',
    ];

    if (organization.agentContext?.trim()) {
      lines.push(
        '',
        'Additional organization context provided by the workspace admin:',
        organization.agentContext.trim(),
      );
    }

    // Include the org context document and its referenced documents
    if (organization.agentContextDocumentId) {
      const contextDoc = await ctx.db.get(
        'documents',
        organization.agentContextDocumentId,
      );
      if (contextDoc?.content) {
        lines.push(
          '',
          `Organization context document "${contextDoc.title}":`,
          contextDoc.content,
        );

        // Follow document references within the context document (1 level deep)
        const referencedDocIds = await extractReferencedDocumentIds(
          ctx,
          organization._id,
          contextDoc.content,
        );
        for (const refDocId of referencedDocIds) {
          const refDoc = await ctx.db.get('documents', refDocId);
          if (refDoc?.content) {
            lines.push(
              '',
              `Referenced document "${refDoc.title}":`,
              refDoc.content,
            );
          }
        }
      }
    }

    return lines.join('\n');
  },
});

function processSelectionLabel(process: Doc<'agentProcesses'>): string {
  return (
    process.title?.trim() ||
    process.repoRoot?.split('/').filter(Boolean).at(-1) ||
    process.cwd?.split('/').filter(Boolean).at(-1) ||
    process.localProcessId ||
    AGENT_PROVIDER_LABELS[process.provider] ||
    process.provider
  );
}

function isAttachableObservedProcess(process: Doc<'agentProcesses'>): boolean {
  return (
    process.mode === 'observed' &&
    process.supportsInboundMessages &&
    !process.endedAt &&
    process.status !== 'failed' &&
    process.status !== 'disconnected'
  );
}

function assistantProcessDedupKey(process: Doc<'agentProcesses'>): string {
  return [
    process.provider,
    process.localProcessId ??
      process.sessionKey ??
      process.tmuxPaneId ??
      process.cwd ??
      process.title,
  ]
    .filter(Boolean)
    .join('::');
}

function assistantProcessRank(process: Doc<'agentProcesses'>): number {
  if (process.tmuxPaneId) {
    return 3;
  }
  if (process.localProcessId) {
    return 2;
  }
  if (process.sessionKey) {
    return 1;
  }
  return 0;
}

function collapseAssistantProcesses(
  processes: Doc<'agentProcesses'>[],
): Doc<'agentProcesses'>[] {
  const byKey = new Map<string, Doc<'agentProcesses'>>();
  const sorted = [...processes].sort((a, b) => {
    const rankDelta = assistantProcessRank(b) - assistantProcessRank(a);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return b.lastHeartbeatAt - a.lastHeartbeatAt;
  });

  for (const process of sorted) {
    const key = assistantProcessDedupKey(process);
    if (!key || byKey.has(key)) {
      continue;
    }
    byKey.set(key, process);
  }

  return [...byKey.values()].sort(
    (a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt,
  );
}

async function getOwnedOnlineDevices(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'agentDevices'>[]> {
  return await ctx.db
    .query('agentDevices')
    .withIndex('by_user_status', q =>
      q.eq('userId', userId).eq('status', 'online'),
    )
    .collect();
}

async function getOwnedDelegatedWorkspaces(
  ctx: QueryCtx | MutationCtx,
  deviceId: Id<'agentDevices'>,
): Promise<Doc<'deviceWorkspaces'>[]> {
  return await ctx.db
    .query('deviceWorkspaces')
    .withIndex('by_device', q => q.eq('deviceId', deviceId))
    .collect();
}

function pickDefaultWorkspace(
  workspaces: Doc<'deviceWorkspaces'>[],
): Doc<'deviceWorkspaces'> | null {
  const delegated = workspaces.filter(
    workspace => workspace.launchPolicy === 'allow_delegated',
  );
  if (delegated.length === 0) {
    return null;
  }

  const markedDefault = delegated.find(workspace => workspace.isDefault);
  if (markedDefault) {
    return markedDefault;
  }

  return delegated.length === 1 ? delegated[0]! : null;
}

export const getCurrentUserDeviceContextSummary = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireOrgForAssistant(ctx, args.orgSlug, args.userId);

    const devices = await getOwnedOnlineDevices(ctx, args.userId);
    if (devices.length === 0) {
      return [
        'You can only create or attach work sessions on bridge devices owned by the authenticated user you are speaking to.',
        'They currently have no online bridge devices.',
        'If they ask you to work on their computer, tell them to start the Vector bridge first.',
      ].join('\n');
    }

    const sortedDevices = [...devices].sort(
      (a, b) => b.lastSeenAt - a.lastSeenAt,
    );
    const preferredDevice = sortedDevices[0]!;
    const preferredWorkspaces = await getOwnedDelegatedWorkspaces(
      ctx,
      preferredDevice._id,
    );
    const defaultWorkspace = pickDefaultWorkspace(preferredWorkspaces);

    const deviceSummary =
      devices.length === 1
        ? `They currently have 1 online bridge device: "${preferredDevice.displayName}".`
        : `They currently have ${devices.length} online bridge devices. The most recently seen one is "${preferredDevice.displayName}".`;

    return [
      "You can only create or attach work sessions on bridge devices owned by the authenticated user you are speaking to. Never target another member's device.",
      deviceSummary,
      defaultWorkspace
        ? `The preferred delegated workspace on that device is "${defaultWorkspace.label}" at ${defaultWorkspace.path}.`
        : 'There is no single default delegated workspace on that device right now.',
      'When the user says "my computer", "my device", or asks you to just take care of an issue on their machine, prefer a new Codex work session on their single online device and its default delegated workspace when that choice is unambiguous.',
      'Only ask a follow-up question when there are multiple plausible online devices, multiple plausible delegated workspaces, or no eligible workspace is configured.',
      'If the user explicitly says to reuse, attach, or continue existing work, inspect their observed sessions and attach the matching tmux, Codex, or Claude session instead of starting a new one.',
    ].join('\n');
  },
});

export const getAssistantThreadForAuthUser = internalQuery({
  args: {
    orgSlug: v.string(),
    authUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId('users', args.authUserId);
    if (!userId) {
      return null;
    }

    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      userId,
    );
    return await getAssistantThreadRow(ctx, organization._id, userId);
  },
});

export const listWorkspaceReferenceData = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );

    const [
      teams,
      projects,
      issuePriorities,
      projectStatuses,
      members,
      issueStates,
    ] = await Promise.all([
      ctx.db
        .query('teams')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .collect(),
      ctx.db
        .query('projects')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .collect(),
      ctx.db
        .query('issuePriorities')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .collect(),
      ctx.db
        .query('projectStatuses')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .collect(),
      ctx.db
        .query('members')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .collect(),
      ctx.db
        .query('issueStates')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .collect(),
    ]);

    const userIds = members.map(member => member.userId);
    const users = await Promise.all(
      userIds.map(userId => ctx.db.get('users', userId)),
    );
    const visibleTeams = [];
    for (const team of teams) {
      if (await canViewEntity(ctx, args.userId, team, 'team')) {
        visibleTeams.push(team);
      }
    }
    const visibleProjects = [];
    for (const project of projects) {
      if (await canViewEntity(ctx, args.userId, project, 'project')) {
        visibleProjects.push(project);
      }
    }

    return {
      teams: visibleTeams.map(team => ({
        id: String(team._id),
        key: team.key,
        name: team.name,
      })),
      projects: visibleProjects.map(project => ({
        id: String(project._id),
        key: project.key,
        name: project.name,
      })),
      issuePriorities: issuePriorities.map(priority => ({
        id: String(priority._id),
        name: priority.name,
      })),
      projectStatuses: projectStatuses.map(status => ({
        id: String(status._id),
        name: status.name,
      })),
      issueStates: issueStates.map(state => ({
        id: String(state._id),
        name: state.name,
        type: state.type,
      })),
      members: members.map((member, index) => ({
        id: String(member.userId),
        name:
          users[index]?.name ??
          users[index]?.email ??
          users[index]?.username ??
          'Unknown user',
        email: users[index]?.email ?? undefined,
      })),
    };
  },
});

async function resolveAssistantIssueForDeviceWork(
  ctx: QueryCtx | MutationCtx,
  args: {
    orgSlug: string;
    userId: Id<'users'>;
    pageContext?: AssistantPageContext;
    issueKey?: string;
  },
) {
  const organization = await requireOrgForAssistant(
    ctx,
    args.orgSlug,
    args.userId,
  );
  const issue = await resolveIssueFromContext(
    ctx,
    organization._id,
    args.pageContext,
    args.issueKey ?? null,
  );

  if (!(await canViewEntity(ctx, args.userId, issue, 'issue'))) {
    throw new ConvexError('FORBIDDEN');
  }

  return { organization, issue };
}

function mapAssistantWorkspaceOption(workspace: Doc<'deviceWorkspaces'>) {
  return {
    id: String(workspace._id),
    label: workspace.label,
    path: workspace.path,
    launchPolicy: workspace.launchPolicy,
    isDefault: workspace.isDefault,
  };
}

function mapAssistantProcessOption(process: Doc<'agentProcesses'>) {
  return {
    id: String(process._id),
    provider: process.provider,
    providerLabel:
      process.providerLabel ??
      AGENT_PROVIDER_LABELS[process.provider] ??
      process.provider,
    title: processSelectionLabel(process),
    cwd: process.cwd,
    repoRoot: process.repoRoot,
    branch: process.branch,
    sessionKind: process.provider === 'vector_cli' ? 'tmux' : 'agent',
    tmuxSessionName: process.tmuxSessionName,
    tmuxWindowName: process.tmuxWindowName,
    tmuxPaneId: process.tmuxPaneId,
  };
}

async function buildAssistantDeviceOptions(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
) {
  const devices = await getOwnedOnlineDevices(ctx, userId);
  const sortedDevices = [...devices].sort(
    (a, b) => b.lastSeenAt - a.lastSeenAt,
  );

  return await Promise.all(
    sortedDevices.map(async device => {
      const [workspaces, allProcesses, liveWorkSessions] = await Promise.all([
        getOwnedDelegatedWorkspaces(ctx, device._id),
        ctx.db
          .query('agentProcesses')
          .withIndex('by_device', q => q.eq('deviceId', device._id))
          .collect(),
        ctx.db
          .query('workSessions')
          .withIndex('by_device', q => q.eq('deviceId', device._id))
          .collect(),
      ]);

      const processes = collapseAssistantProcesses(
        allProcesses.filter(isAttachableObservedProcess),
      );
      const defaultWorkspace = pickDefaultWorkspace(workspaces);
      const activeWorkSessions = await Promise.all(
        liveWorkSessions
          .filter(
            workSession =>
              !workSession.endedAt &&
              workSession.organizationId === organizationId,
          )
          .map(async workSession => {
            const issue = await ctx.db.get('issues', workSession.issueId);
            return {
              id: String(workSession._id),
              title: workSession.title ?? issue?.title ?? 'Work session',
              issueKey: issue?.key,
              status: workSession.status,
              agentProvider: workSession.agentProvider,
              workspacePath: workSession.workspacePath,
            };
          }),
      );

      return {
        device: {
          id: String(device._id),
          displayName: device.displayName,
          hostname: device.hostname,
          platform: device.platform,
          status: device.status,
          lastSeenAt: device.lastSeenAt,
        },
        workspaces: workspaces.map(mapAssistantWorkspaceOption),
        attachableSessions: processes.map(mapAssistantProcessOption),
        activeWorkSessions,
        defaultWorkspaceId: defaultWorkspace
          ? String(defaultWorkspace._id)
          : undefined,
      };
    }),
  );
}

export const listMyDeviceSessionOptions = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );

    const devices = await buildAssistantDeviceOptions(
      ctx,
      organization._id,
      args.userId,
    );
    const defaultDevice = devices.length === 1 ? devices[0] : null;

    return {
      defaults: {
        provider: 'codex',
        deviceId: defaultDevice?.device.id,
        workspaceId:
          defaultDevice?.workspaces.find(workspace => workspace.isDefault)
            ?.id ??
          (defaultDevice?.workspaces.length === 1
            ? defaultDevice.workspaces[0]!.id
            : undefined),
      },
      devices,
      summary:
        devices.length === 0
          ? 'No online bridge devices are available for this user right now.'
          : devices.length === 1
            ? `1 online bridge device is available: ${devices[0]!.device.displayName}.`
            : `${devices.length} online bridge devices are available.`,
    };
  },
});

export const startIssueDeviceWorkSession = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    issueKey: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    workspaceId: v.optional(v.string()),
    provider: v.optional(
      v.union(
        v.literal('codex'),
        v.literal('claude_code'),
        v.literal('vector_cli'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { issue } = await resolveAssistantIssueForDeviceWork(ctx, args);

    const devices = await getOwnedOnlineDevices(ctx, args.userId);
    const normalizedDeviceId = args.deviceId
      ? ctx.db.normalizeId('agentDevices', args.deviceId)
      : null;
    const selectedDevice = args.deviceId
      ? normalizedDeviceId
        ? (devices.find(device => device._id === normalizedDeviceId) ?? null)
        : null
      : devices.length === 1
        ? devices[0]
        : null;

    if (!selectedDevice || selectedDevice.userId !== args.userId) {
      return {
        status: 'needs_selection',
        missing: 'device',
        message:
          devices.length === 0
            ? 'No online bridge devices are available for this user right now.'
            : 'Multiple online devices are available. Pick one device before starting work.',
        devices: devices.map(device => ({
          id: String(device._id),
          displayName: device.displayName,
          hostname: device.hostname,
          platform: device.platform,
        })),
      };
    }

    const workspaces = await getOwnedDelegatedWorkspaces(
      ctx,
      selectedDevice._id,
    );
    const delegatedWorkspaces = workspaces.filter(
      workspace => workspace.launchPolicy === 'allow_delegated',
    );
    const normalizedWorkspaceId = args.workspaceId
      ? ctx.db.normalizeId('deviceWorkspaces', args.workspaceId)
      : null;
    const selectedWorkspace = normalizedWorkspaceId
      ? delegatedWorkspaces.find(
          workspace => workspace._id === normalizedWorkspaceId,
        )
      : pickDefaultWorkspace(workspaces);

    if (!selectedWorkspace) {
      return {
        status: 'needs_selection',
        missing: 'workspace',
        message:
          delegatedWorkspaces.length === 0
            ? `No delegated workspace is configured on ${selectedDevice.displayName}.`
            : 'Multiple delegated workspaces are available. Pick a workspace before starting work.',
        device: {
          id: String(selectedDevice._id),
          displayName: selectedDevice.displayName,
        },
        workspaces: delegatedWorkspaces.map(mapAssistantWorkspaceOption),
      };
    }

    const provider = args.provider ?? 'codex';
    const now = Date.now();
    const providerLabel = AGENT_PROVIDER_LABELS[provider] ?? provider;
    const liveActivityTitle =
      provider === 'vector_cli'
        ? `${selectedDevice.displayName} shell session`
        : `${providerLabel} on ${selectedDevice.displayName}`;

    const liveActivityId = await ctx.db.insert('issueLiveActivities', {
      organizationId: issue.organizationId,
      issueId: issue._id,
      deviceId: selectedDevice._id,
      ownerUserId: args.userId,
      provider,
      title: liveActivityTitle,
      status: 'active',
      startedAt: now,
      lastEventAt: now,
    });

    const workSessionId = await ctx.db.insert('workSessions', {
      organizationId: issue.organizationId,
      issueId: issue._id,
      liveActivityId,
      deviceId: selectedDevice._id,
      workspaceId: selectedWorkspace._id,
      ownerUserId: args.userId,
      title: `${issue.key}: ${issue.title}`,
      status: 'active',
      workspacePath: selectedWorkspace.path,
      cwd: selectedWorkspace.path,
      agentProvider: provider,
      startedAt: now,
      lastEventAt: now,
    });

    await ctx.db.patch('issueLiveActivities', liveActivityId, {
      workSessionId,
    });

    const delegatedRunId = await ctx.db.insert('delegatedRuns', {
      organizationId: issue.organizationId,
      issueId: issue._id,
      liveActivityId,
      deviceId: selectedDevice._id,
      workspaceId: selectedWorkspace._id,
      requestedByUserId: args.userId,
      provider,
      launchMode: 'delegated_launch',
      workspacePath: selectedWorkspace.path,
      launchStatus: 'pending',
    });

    await ctx.db.insert('agentCommands', {
      deviceId: selectedDevice._id,
      liveActivityId,
      senderUserId: args.userId,
      kind: 'launch',
      payload: {
        issueId: issue._id,
        issueKey: issue.key,
        issueTitle: issue.title,
        provider,
        workspacePath: selectedWorkspace.path,
        workspaceLabel: selectedWorkspace.label,
        delegatedRunId,
        liveActivityId,
      },
      status: 'pending',
      createdAt: now,
    });

    await recordActivity(ctx, {
      actorId: args.userId,
      entityType: 'issue',
      eventType: 'issue_live_activity_delegated',
      scope: resolveIssueScope(issue),
      snapshot: snapshotForIssue(issue),
      details: {
        field: 'live_activity',
        liveActivityId,
        agentProvider: provider,
        agentProviderLabel: providerLabel,
        deviceName: selectedDevice.displayName,
        workspaceLabel: selectedWorkspace.label,
      },
    });

    const currentState = issue.workflowStateId
      ? await ctx.db.get('issueStates', issue.workflowStateId)
      : null;
    if (!currentState || ['backlog', 'todo'].includes(currentState.type)) {
      const inProgressState = await ctx.db
        .query('issueStates')
        .withIndex('by_organization', q =>
          q.eq('organizationId', issue.organizationId),
        )
        .filter(q => q.eq(q.field('type'), 'in_progress'))
        .first();
      if (inProgressState && issue.workflowStateId !== inProgressState._id) {
        await ctx.db.patch('issues', issue._id, {
          workflowStateId: inProgressState._id,
        });
      }
    }

    return {
      status: 'started',
      issueKey: issue.key,
      liveActivityId: String(liveActivityId),
      workSessionId: String(workSessionId),
      delegatedRunId: String(delegatedRunId),
      provider,
      providerLabel,
      device: {
        id: String(selectedDevice._id),
        displayName: selectedDevice.displayName,
      },
      workspace: mapAssistantWorkspaceOption(selectedWorkspace),
    };
  },
});

export const attachIssueToObservedDeviceSession = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    issueKey: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    processId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { issue } = await resolveAssistantIssueForDeviceWork(ctx, args);
    const devices = await getOwnedOnlineDevices(ctx, args.userId);
    const normalizedDeviceId = args.deviceId
      ? ctx.db.normalizeId('agentDevices', args.deviceId)
      : null;
    const selectedDevice =
      normalizedDeviceId !== null
        ? (devices.find(device => device._id === normalizedDeviceId) ?? null)
        : devices.length === 1
          ? devices[0]!
          : null;

    if (!selectedDevice) {
      return {
        status: 'needs_selection',
        missing: 'device',
        message:
          devices.length === 0
            ? 'No online bridge devices are available for this user right now.'
            : 'Multiple online devices are available. Pick one device before attaching a session.',
        devices: devices.map(device => ({
          id: String(device._id),
          displayName: device.displayName,
          hostname: device.hostname,
          platform: device.platform,
        })),
      };
    }

    const observedProcesses = collapseAssistantProcesses(
      (
        await ctx.db
          .query('agentProcesses')
          .withIndex('by_device', q => q.eq('deviceId', selectedDevice._id))
          .collect()
      ).filter(isAttachableObservedProcess),
    );

    const normalizedProcessId = args.processId
      ? ctx.db.normalizeId('agentProcesses', args.processId)
      : null;
    const selectedProcess =
      normalizedProcessId !== null
        ? (observedProcesses.find(
            process => process._id === normalizedProcessId,
          ) ?? null)
        : observedProcesses.length === 1
          ? observedProcesses[0]!
          : null;

    if (!selectedProcess) {
      return {
        status: 'needs_selection',
        missing: 'session',
        message:
          observedProcesses.length === 0
            ? `No attachable tmux, Codex, or Claude sessions are running on ${selectedDevice.displayName}.`
            : 'Multiple attachable sessions are available. Pick the session to attach.',
        device: {
          id: String(selectedDevice._id),
          displayName: selectedDevice.displayName,
        },
        sessions: observedProcesses.map(mapAssistantProcessOption),
      };
    }

    const now = Date.now();
    const providerLabel =
      selectedProcess.providerLabel ??
      AGENT_PROVIDER_LABELS[selectedProcess.provider] ??
      selectedProcess.provider;
    const liveActivityId = await ctx.db.insert('issueLiveActivities', {
      organizationId: issue.organizationId,
      issueId: issue._id,
      deviceId: selectedDevice._id,
      processId: selectedProcess._id,
      ownerUserId: args.userId,
      provider: selectedProcess.provider,
      title: selectedProcess.title,
      status: 'active',
      startedAt: now,
      lastEventAt: now,
    });

    const workSessionId = await ctx.db.insert('workSessions', {
      organizationId: issue.organizationId,
      issueId: issue._id,
      liveActivityId,
      deviceId: selectedDevice._id,
      ownerUserId: args.userId,
      title: selectedProcess.title,
      status: 'active',
      workspacePath: selectedProcess.cwd ?? selectedProcess.repoRoot,
      cwd: selectedProcess.cwd,
      repoRoot: selectedProcess.repoRoot,
      branch: selectedProcess.branch,
      tmuxSessionName: selectedProcess.tmuxSessionName,
      tmuxWindowName: selectedProcess.tmuxWindowName,
      tmuxPaneId: selectedProcess.tmuxPaneId,
      agentProvider: selectedProcess.provider,
      agentProcessId: selectedProcess._id,
      agentSessionKey: selectedProcess.sessionKey,
      startedAt: now,
      lastEventAt: now,
    });

    await ctx.db.patch('issueLiveActivities', liveActivityId, {
      workSessionId,
    });

    await recordActivity(ctx, {
      actorId: args.userId,
      entityType: 'issue',
      eventType: 'issue_live_activity_started',
      scope: resolveIssueScope(issue),
      snapshot: snapshotForIssue(issue),
      details: {
        field: 'live_activity',
        liveActivityId,
        agentProvider: selectedProcess.provider,
        agentProviderLabel: providerLabel,
        deviceName: selectedDevice.displayName,
      },
    });

    const currentState = issue.workflowStateId
      ? await ctx.db.get('issueStates', issue.workflowStateId)
      : null;
    if (!currentState || ['backlog', 'todo'].includes(currentState.type)) {
      const inProgressState = await ctx.db
        .query('issueStates')
        .withIndex('by_organization', q =>
          q.eq('organizationId', issue.organizationId),
        )
        .filter(q => q.eq(q.field('type'), 'in_progress'))
        .first();
      if (inProgressState && issue.workflowStateId !== inProgressState._id) {
        await ctx.db.patch('issues', issue._id, {
          workflowStateId: inProgressState._id,
        });
      }
    }

    return {
      status: 'attached',
      issueKey: issue.key,
      liveActivityId: String(liveActivityId),
      workSessionId: String(workSessionId),
      device: {
        id: String(selectedDevice._id),
        displayName: selectedDevice.displayName,
      },
      session: mapAssistantProcessOption(selectedProcess),
    };
  },
});

export const deleteAssistantThreadRow = internalMutation({
  args: {
    assistantThreadId: v.id('assistantThreads'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete('assistantThreads', args.assistantThreadId);
    return null;
  },
});

export const listDocuments = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    folderId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const folder = await resolveFolderFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.folderId,
    );

    const documents = folder
      ? await ctx.db
          .query('documents')
          .withIndex('by_folder', q => q.eq('folderId', folder._id))
          .collect()
      : await ctx.db
          .query('documents')
          .withIndex('by_organizationId', q =>
            q.eq('organizationId', organization._id),
          )
          .collect();

    const visible = [];
    for (const document of documents) {
      if (document.organizationId !== organization._id) continue;
      if (await canViewEntity(ctx, args.userId, document, 'document')) {
        visible.push(document);
      }
    }

    return visible.slice(0, args.limit ?? 25).map(document => ({
      id: String(document._id),
      title: document.title,
      visibility: document.visibility ?? 'organization',
      folderId: document.folderId ? String(document.folderId) : undefined,
      teamId: document.teamId ? String(document.teamId) : undefined,
      projectId: document.projectId ? String(document.projectId) : undefined,
      lastEditedAt: document.lastEditedAt ?? undefined,
      createdAt: document._creationTime,
    }));
  },
});

export const getDocument = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    documentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const document = await resolveDocumentFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.documentId ?? null,
    );

    if (!(await canViewEntity(ctx, args.userId, document, 'document'))) {
      throw new ConvexError('FORBIDDEN');
    }

    // Resolve document links/mentions in content
    const referencedDocs: { id: string; title: string }[] = [];
    if (document.content) {
      const refDocIds = await extractReferencedDocumentIds(
        ctx,
        organization._id,
        document.content,
      );
      for (const refDocId of refDocIds) {
        const refDoc = await ctx.db.get('documents', refDocId);
        if (refDoc) {
          referencedDocs.push({
            id: String(refDoc._id),
            title: refDoc.title,
          });
        }
      }
    }

    return {
      id: String(document._id),
      title: document.title,
      content: document.content ?? '',
      visibility: document.visibility ?? 'organization',
      folderId: document.folderId ? String(document.folderId) : undefined,
      teamId: document.teamId ? String(document.teamId) : undefined,
      projectId: document.projectId ? String(document.projectId) : undefined,
      icon: document.icon ?? undefined,
      color: document.color ?? undefined,
      referencedDocuments:
        referencedDocs.length > 0 ? referencedDocs : undefined,
    };
  },
});

export const createDocument = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    title: v.string(),
    content: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    teamKey: v.optional(v.string()),
    projectKey: v.optional(v.string()),
    folderId: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.DOCUMENT_CREATE,
    );

    const contextProject =
      args.pageContext?.kind === 'project_detail'
        ? await resolveProjectFromContext(
            ctx,
            organization._id,
            args.pageContext,
          )
        : null;
    const contextTeam =
      args.pageContext?.kind === 'team_detail'
        ? await resolveTeamFromContext(ctx, organization._id, args.pageContext)
        : null;
    const contextDocument =
      args.pageContext?.kind === 'document_detail'
        ? await resolveDocumentFromContext(
            ctx,
            organization._id,
            args.pageContext,
          )
        : null;

    const team = args.teamKey
      ? await resolveTeamFromContext(
          ctx,
          organization._id,
          undefined,
          args.teamKey,
        )
      : contextTeam;
    const project = args.projectKey
      ? await resolveProjectFromContext(
          ctx,
          organization._id,
          undefined,
          args.projectKey,
        )
      : contextProject;
    const folder = await resolveFolderFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.folderId ??
        (args.pageContext?.kind === 'document_folder'
          ? args.pageContext.folderId
          : contextDocument?.folderId
            ? String(contextDocument.folderId)
            : null),
    );

    const documentTitle = args.title.trim();
    if (!documentTitle) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (documentTitle.length > 200) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (args.content && args.content.length > 50000) {
      throw new ConvexError('INVALID_INPUT');
    }

    const documentId = await ctx.db.insert('documents', {
      organizationId: organization._id,
      title: documentTitle,
      content: args.content,
      icon: args.icon,
      color: args.color,
      folderId: folder?._id,
      teamId: team?._id ?? contextDocument?.teamId,
      projectId: project?._id ?? contextDocument?.projectId,
      createdBy: args.userId,
      lastEditedBy: args.userId,
      lastEditedAt: Date.now(),
      visibility: args.visibility ?? 'organization',
    });

    if (args.content) {
      await syncDocumentMentions(
        ctx,
        documentId,
        organization._id,
        args.content,
      );
    }

    return {
      documentId: String(documentId),
      title: documentTitle,
    };
  },
});

export const updateDocument = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    documentId: v.optional(v.string()),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    teamKey: v.optional(v.union(v.string(), v.null())),
    projectKey: v.optional(v.union(v.string(), v.null())),
    folderId: v.optional(v.union(v.string(), v.null())),
    icon: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const document = await resolveDocumentFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.documentId ?? null,
    );

    if (!(await canEditEntity(ctx, args.userId, document, 'document'))) {
      throw new ConvexError('FORBIDDEN');
    }
    if (args.title !== undefined) {
      const trimmedTitle = args.title.trim();
      if (!trimmedTitle || trimmedTitle.length > 200) {
        throw new ConvexError('INVALID_INPUT');
      }
    }
    if (args.content !== undefined && args.content.length > 50000) {
      throw new ConvexError('INVALID_INPUT');
    }

    const team =
      args.teamKey === undefined
        ? undefined
        : args.teamKey === null
          ? null
          : await resolveTeamFromContext(
              ctx,
              organization._id,
              undefined,
              args.teamKey,
            );
    const project =
      args.projectKey === undefined
        ? undefined
        : args.projectKey === null
          ? null
          : await resolveProjectFromContext(
              ctx,
              organization._id,
              undefined,
              args.projectKey,
            );
    const folder =
      args.folderId === undefined
        ? undefined
        : args.folderId === null
          ? null
          : await resolveFolderFromContext(
              ctx,
              organization._id,
              undefined,
              args.folderId,
            );

    await ctx.db.patch('documents', document._id, {
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
      ...(args.icon !== undefined ? { icon: args.icon ?? undefined } : {}),
      ...(args.color !== undefined ? { color: args.color ?? undefined } : {}),
      ...(team !== undefined ? { teamId: team?._id } : {}),
      ...(project !== undefined ? { projectId: project?._id } : {}),
      ...(folder !== undefined ? { folderId: folder?._id } : {}),
      lastEditedBy: args.userId,
      lastEditedAt: Date.now(),
    });

    if (args.content !== undefined) {
      await syncDocumentMentions(
        ctx,
        document._id,
        organization._id,
        args.content,
      );
    }

    return {
      documentId: String(document._id),
      title: args.title?.trim() ?? document.title,
    };
  },
});

export const listIssues = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    projectKey: v.optional(v.string()),
    teamKey: v.optional(v.string()),
    assigneeName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const project =
      args.projectKey || args.pageContext?.kind === 'project_detail'
        ? await resolveProjectFromContext(
            ctx,
            organization._id,
            args.pageContext,
            args.projectKey,
          ).catch(() => null)
        : null;
    const team =
      args.teamKey || args.pageContext?.kind === 'team_detail'
        ? await resolveTeamFromContext(
            ctx,
            organization._id,
            args.pageContext,
            args.teamKey,
          ).catch(() => null)
        : null;

    // Resolve assignee filter by name/email
    let assigneeIssueIds: Set<string> | null = null;
    if (args.assigneeName) {
      const member = await findMemberByName(
        ctx,
        organization._id,
        args.assigneeName,
      );
      if (!member) {
        return [];
      }
      const assignments = await ctx.db
        .query('issueAssignees')
        .withIndex('by_assignee', q => q.eq('assigneeId', member.user._id))
        .collect();
      assigneeIssueIds = new Set(assignments.map(a => String(a.issueId)));
    }

    let issues = project
      ? await ctx.db
          .query('issues')
          .withIndex('by_project', q => q.eq('projectId', project._id))
          .collect()
      : await ctx.db
          .query('issues')
          .withIndex('by_organization', q =>
            q.eq('organizationId', organization._id),
          )
          .collect();

    if (team) {
      issues = issues.filter(issue => issue.teamId === team._id);
    }

    if (assigneeIssueIds) {
      issues = issues.filter(issue => assigneeIssueIds!.has(String(issue._id)));
    }

    const visible = [];
    for (const issue of issues) {
      if (await canViewEntity(ctx, args.userId, issue, 'issue')) {
        visible.push(issue);
      }
    }

    const issueSlice = visible.slice(0, args.limit ?? 25);
    const results = [];
    for (const issue of issueSlice) {
      const assignees = await ctx.db
        .query('issueAssignees')
        .withIndex('by_issue', q => q.eq('issueId', issue._id))
        .collect();
      const firstAssignment = assignees[0];
      const state = firstAssignment
        ? await ctx.db.get('issueStates', firstAssignment.stateId)
        : null;
      const assignee = firstAssignment?.assigneeId
        ? await ctx.db.get('users', firstAssignment.assigneeId)
        : null;
      const priority = issue.priorityId
        ? await ctx.db.get('issuePriorities', issue.priorityId)
        : null;

      results.push({
        id: String(issue._id),
        key: issue.key,
        title: issue.title,
        visibility: issue.visibility ?? 'organization',
        projectId: issue.projectId ? String(issue.projectId) : undefined,
        teamId: issue.teamId ? String(issue.teamId) : undefined,
        priorityName: priority?.name ?? undefined,
        stateName: state?.name ?? undefined,
        stateType: state?.type ?? undefined,
        assigneeName: assignee?.name ?? assignee?.email ?? undefined,
        startDate: issue.startDate ?? undefined,
        dueDate: issue.dueDate ?? undefined,
        parentIssueId: issue.parentIssueId
          ? String(issue.parentIssueId)
          : undefined,
        createdAt: issue._creationTime,
      });
    }
    return results;
  },
});

export const getIssue = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    issueKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const issue = await resolveIssueFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.issueKey ?? null,
    );

    if (!(await canViewEntity(ctx, args.userId, issue, 'issue'))) {
      throw new ConvexError('FORBIDDEN');
    }

    const priority = issue.priorityId
      ? await ctx.db.get('issuePriorities', issue.priorityId)
      : null;

    const assignees = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue', q => q.eq('issueId', issue._id))
      .collect();

    const assigneeDetails = [];
    for (const assignment of assignees) {
      const state = await ctx.db.get('issueStates', assignment.stateId);
      const user = assignment.assigneeId
        ? await ctx.db.get('users', assignment.assigneeId)
        : null;
      assigneeDetails.push({
        assigneeName: user?.name ?? user?.email ?? 'Unassigned',
        stateName: state?.name ?? 'Unknown',
        stateType: state?.type ?? 'todo',
      });
    }

    const parentIssue = issue.parentIssueId
      ? await ctx.db.get('issues', issue.parentIssueId)
      : null;

    return {
      id: String(issue._id),
      key: issue.key,
      title: issue.title,
      description: issue.description ?? '',
      visibility: issue.visibility ?? 'organization',
      teamId: issue.teamId ? String(issue.teamId) : undefined,
      projectId: issue.projectId ? String(issue.projectId) : undefined,
      priorityName: priority?.name ?? undefined,
      startDate: issue.startDate ?? undefined,
      dueDate: issue.dueDate ?? undefined,
      parentIssueKey: parentIssue?.key ?? undefined,
      assignees: assigneeDetails,
    };
  },
});

export const createIssue = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    title: v.string(),
    description: v.optional(v.string()),
    projectKey: v.optional(v.string()),
    teamKey: v.optional(v.string()),
    priorityName: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    assigneeName: v.optional(v.string()),
    stateName: v.optional(v.string()),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    parentIssueKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.ISSUE_CREATE,
    );

    const project =
      args.projectKey || args.pageContext?.kind === 'project_detail'
        ? await resolveProjectFromContext(
            ctx,
            organization._id,
            args.pageContext,
            args.projectKey,
          ).catch(() => null)
        : null;
    const team =
      args.teamKey || args.pageContext?.kind === 'team_detail'
        ? await resolveTeamFromContext(
            ctx,
            organization._id,
            args.pageContext,
            args.teamKey,
          ).catch(() => null)
        : null;
    const currentIssue =
      args.pageContext?.kind === 'issue_detail'
        ? await resolveIssueFromContext(ctx, organization._id, args.pageContext)
        : null;
    const priority = await findIssuePriorityByName(
      ctx,
      organization._id,
      args.priorityName,
    );

    // Resolve parent issue
    let parentIssueId = undefined;
    if (args.parentIssueKey) {
      const parentIssue = await ctx.db
        .query('issues')
        .withIndex('by_org_key', q =>
          q
            .eq('organizationId', organization._id)
            .eq('key', args.parentIssueKey!),
        )
        .first();
      if (parentIssue) {
        parentIssueId = parentIssue._id;
      }
    }

    // Resolve assignee
    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.assigneeName,
    );

    if (!args.title.trim()) {
      throw new ConvexError('INVALID_INPUT');
    }

    let key: string;
    let sequenceNumber: number;

    if (project ?? currentIssue?.projectId) {
      const resolvedProject =
        project ?? (await ctx.db.get('projects', currentIssue!.projectId!));
      if (!resolvedProject) {
        throw new ConvexError('PROJECT_NOT_FOUND');
      }
      const existingIssues = await ctx.db
        .query('issues')
        .withIndex('by_project', q => q.eq('projectId', resolvedProject._id))
        .collect();
      const nextIssueKey = await getNextAvailableIssueKey(ctx, {
        organizationId: organization._id,
        prefix: resolvedProject.key,
        startingSequenceNumber: existingIssues.length + 1,
      });
      sequenceNumber = nextIssueKey.sequenceNumber;
      key = nextIssueKey.key;
    } else {
      const existingIssues = await ctx.db
        .query('issues')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .collect();
      const nextIssueKey = await getNextAvailableIssueKey(ctx, {
        organizationId: organization._id,
        prefix: organization.slug.toUpperCase(),
        startingSequenceNumber: existingIssues.length + 1,
      });
      sequenceNumber = nextIssueKey.sequenceNumber;
      key = nextIssueKey.key;
    }

    const issueId = await ctx.db.insert('issues', {
      organizationId: organization._id,
      projectId: project?._id ?? currentIssue?.projectId,
      key,
      sequenceNumber,
      title: args.title.trim(),
      description: args.description?.trim(),
      searchText: buildIssueSearchText({
        key,
        title: args.title.trim(),
        description: args.description?.trim(),
      }),
      priorityId: priority?._id ?? undefined,
      reporterId: args.userId,
      teamId: team?._id ?? currentIssue?.teamId,
      visibility: args.visibility ?? 'organization',
      createdBy: args.userId,
      parentIssueId,
      startDate: args.startDate,
      dueDate: args.dueDate,
    });

    // Resolve issue state (default to todo)
    let issueState = args.stateName
      ? await findIssueStateByName(ctx, organization._id, args.stateName)
      : null;
    if (!issueState) {
      issueState = await ctx.db
        .query('issueStates')
        .withIndex('by_organization', q =>
          q.eq('organizationId', organization._id),
        )
        .filter(q => q.eq(q.field('type'), 'todo'))
        .first();
    }

    if (issueState) {
      await ctx.db.insert('issueAssignees', {
        issueId,
        assigneeId: memberMatch?.user._id ?? undefined,
        stateId: issueState._id,
      });
    }

    const summary: string[] = [key, args.title.trim()];
    if (memberMatch)
      summary.push(
        `assigned to ${memberMatch.user.name ?? memberMatch.user.email}`,
      );
    if (issueState && args.stateName) summary.push(`state: ${issueState.name}`);

    await ctx.scheduler.runAfter(
      0,
      internal.github.actions.syncIssueLinksFromContent,
      {
        issueId,
        actorId: args.userId,
      },
    );

    return {
      issueId: String(issueId),
      key,
      title: args.title.trim(),
      summary: summary.join(' — '),
    };
  },
});

export const updateIssue = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    issueKey: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priorityName: v.optional(v.union(v.string(), v.null())),
    teamKey: v.optional(v.union(v.string(), v.null())),
    projectKey: v.optional(v.union(v.string(), v.null())),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    assigneeName: v.optional(v.union(v.string(), v.null())),
    stateName: v.optional(v.string()),
    startDate: v.optional(v.union(v.string(), v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
    parentIssueKey: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const issue = await resolveIssueFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.issueKey ?? null,
    );
    const hasIssueFieldEdits =
      args.title !== undefined ||
      args.description !== undefined ||
      args.priorityName !== undefined ||
      args.teamKey !== undefined ||
      args.projectKey !== undefined ||
      args.visibility !== undefined ||
      args.startDate !== undefined ||
      args.dueDate !== undefined ||
      args.parentIssueKey !== undefined;

    if (
      hasIssueFieldEdits &&
      !(await canEditEntity(ctx, args.userId, issue, 'issue'))
    ) {
      throw new ConvexError('FORBIDDEN');
    }

    const priority =
      args.priorityName === undefined
        ? undefined
        : args.priorityName === null
          ? null
          : await findIssuePriorityByName(
              ctx,
              organization._id,
              args.priorityName,
            );
    const team =
      args.teamKey === undefined
        ? undefined
        : args.teamKey === null
          ? null
          : await resolveTeamFromContext(
              ctx,
              organization._id,
              undefined,
              args.teamKey,
            );
    const project =
      args.projectKey === undefined
        ? undefined
        : args.projectKey === null
          ? null
          : await resolveProjectFromContext(
              ctx,
              organization._id,
              undefined,
              args.projectKey,
            );

    // Resolve parent issue
    let parentIssueId: typeof issue.parentIssueId | undefined = undefined;
    if (args.parentIssueKey !== undefined) {
      if (args.parentIssueKey === null) {
        parentIssueId = undefined;
      } else {
        const parentIssue = await ctx.db
          .query('issues')
          .withIndex('by_org_key', q =>
            q
              .eq('organizationId', organization._id)
              .eq('key', args.parentIssueKey!),
          )
          .first();
        parentIssueId = parentIssue?._id;
      }
    }

    const nextTitle = args.title ?? issue.title;
    const nextDescription = args.description ?? issue.description;

    // Re-key the issue when its project or team scope changes
    let newKey: string | undefined;
    let newSequenceNumber: number | undefined;
    if (
      project !== undefined ||
      (team !== undefined && project === undefined && args.projectKey === null)
    ) {
      const resolvedProject =
        project ??
        (issue.projectId
          ? await ctx.db.get('projects', issue.projectId)
          : null);
      const resolvedTeam =
        team ?? (issue.teamId ? await ctx.db.get('teams', issue.teamId) : null);

      let prefix: string;
      if (resolvedProject) {
        prefix = resolvedProject.key;
      } else if (resolvedTeam) {
        prefix = resolvedTeam.key;
      } else {
        prefix = organization.slug.toUpperCase();
      }

      // Only re-key if the prefix actually changed
      const currentPrefix = issue.key.replace(/-\d+$/, '');
      if (prefix !== currentPrefix) {
        const existingWithPrefix = await ctx.db
          .query('issues')
          .withIndex('by_organization', q =>
            q.eq('organizationId', organization._id),
          )
          .collect();
        const samePrefix = existingWithPrefix.filter(i =>
          i.key.startsWith(`${prefix}-`),
        );
        const nextIssueKey = await getNextAvailableIssueKey(ctx, {
          organizationId: organization._id,
          prefix,
          startingSequenceNumber: samePrefix.length + 1,
        });
        newKey = nextIssueKey.key;
        newSequenceNumber = nextIssueKey.sequenceNumber;
      }
    }

    if (hasIssueFieldEdits) {
      await ctx.db.patch('issues', issue._id, {
        ...(args.title !== undefined ? { title: args.title.trim() } : {}),
        ...(args.description !== undefined
          ? { description: args.description }
          : {}),
        ...(priority !== undefined ? { priorityId: priority?._id } : {}),
        ...(team !== undefined ? { teamId: team?._id } : {}),
        ...(project !== undefined ? { projectId: project?._id } : {}),
        ...(args.visibility !== undefined
          ? { visibility: args.visibility }
          : {}),
        ...(args.startDate !== undefined
          ? { startDate: args.startDate ?? undefined }
          : {}),
        ...(args.dueDate !== undefined
          ? { dueDate: args.dueDate ?? undefined }
          : {}),
        ...(parentIssueId !== undefined ? { parentIssueId } : {}),
        ...(newKey !== undefined
          ? { key: newKey, sequenceNumber: newSequenceNumber! }
          : {}),
        searchText: buildIssueSearchText({
          key: newKey ?? issue.key,
          title: nextTitle,
          description: nextDescription,
        }),
      });

      if (
        (args.title !== undefined && args.title.trim() !== issue.title) ||
        (args.description !== undefined &&
          args.description !== issue.description)
      ) {
        await ctx.scheduler.runAfter(
          0,
          internal.github.actions.syncIssueLinksFromContent,
          {
            issueId: issue._id,
            actorId: args.userId,
          },
        );
      }
    }

    // Handle assignee and state changes on the issueAssignees table
    const changes: string[] = [];
    if (args.assigneeName !== undefined || args.stateName !== undefined) {
      const existingAssignees = await ctx.db
        .query('issueAssignees')
        .withIndex('by_issue', q => q.eq('issueId', issue._id))
        .collect();

      const newState = args.stateName
        ? await findIssueStateByName(ctx, organization._id, args.stateName)
        : null;
      const memberMatch =
        args.assigneeName === undefined
          ? undefined
          : args.assigneeName === null
            ? null
            : await findMemberByName(ctx, organization._id, args.assigneeName);
      const canModifyAssignments =
        args.assigneeName !== undefined
          ? await canAssignIssueForUser(ctx, args.userId, issue)
          : existingAssignees[0]?.assigneeId
            ? await canUpdateIssueAssignmentStateForUser(
                ctx,
                args.userId,
                issue,
                existingAssignees[0].assigneeId,
              )
            : await canAssignIssueForUser(ctx, args.userId, issue);
      if (!canModifyAssignments) {
        throw new ConvexError('FORBIDDEN');
      }

      if (existingAssignees.length > 0) {
        // Update the first assignment record
        const assignment = existingAssignees[0]!;
        const patch: Record<string, unknown> = {};
        if (memberMatch !== undefined) {
          patch.assigneeId = memberMatch?.user._id ?? undefined;
        }
        if (newState) {
          patch.stateId = newState._id;
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch('issueAssignees', assignment._id, patch);
        }
      } else {
        // Create a new assignment record
        const fallbackState =
          newState ??
          (await ctx.db
            .query('issueStates')
            .withIndex('by_organization', q =>
              q.eq('organizationId', organization._id),
            )
            .filter(q => q.eq(q.field('type'), 'todo'))
            .first());
        if (fallbackState) {
          await ctx.db.insert('issueAssignees', {
            issueId: issue._id,
            assigneeId: memberMatch ? memberMatch.user._id : undefined,
            stateId: fallbackState._id,
          });
        }
      }

      if (memberMatch)
        changes.push(
          `assigned to ${memberMatch.user.name ?? memberMatch.user.email}`,
        );
      if (memberMatch === null) changes.push('unassigned');
      if (newState) changes.push(`state → ${newState.name}`);
    }

    if (
      (args.title !== undefined && args.title !== issue.title) ||
      (args.description !== undefined && args.description !== issue.description)
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.github.actions.syncIssueLinksFromContent,
        {
          issueId: issue._id,
          actorId: args.userId,
        },
      );
    }

    // Record activity for field changes
    if (args.title !== undefined && args.title.trim() !== issue.title) {
      await recordActivity(ctx, {
        scope: resolveIssueScope(issue),
        actorId: args.userId,
        entityType: 'issue',
        eventType: 'issue_title_changed',
        details: {
          field: 'title',
          fromLabel: issue.title,
          toLabel: args.title.trim(),
          viaAgent: true,
        },
        snapshot: snapshotForIssue(issue),
      });
    }
    if (
      args.description !== undefined &&
      args.description !== issue.description
    ) {
      await recordActivity(ctx, {
        scope: resolveIssueScope(issue),
        actorId: args.userId,
        entityType: 'issue',
        eventType: 'issue_description_changed',
        details: { field: 'description', viaAgent: true },
        snapshot: snapshotForIssue(issue),
      });
    }
    if (priority !== undefined) {
      const oldPriority = issue.priorityId
        ? await ctx.db.get('issuePriorities', issue.priorityId)
        : null;
      await recordActivity(ctx, {
        scope: resolveIssueScope(issue),
        actorId: args.userId,
        entityType: 'issue',
        eventType: 'issue_priority_changed',
        details: {
          field: 'priority',
          fromLabel: oldPriority?.name ?? 'None',
          toLabel: priority?.name ?? 'None',
          viaAgent: true,
        },
        snapshot: snapshotForIssue(issue),
      });
    }
    if (args.assigneeName !== undefined) {
      const memberMatch =
        args.assigneeName === null
          ? null
          : await findMemberByName(ctx, organization._id, args.assigneeName);
      await recordActivity(ctx, {
        scope: resolveIssueScope(issue),
        actorId: args.userId,
        entityType: 'issue',
        eventType: 'issue_assignees_changed',
        details: {
          viaAgent: true,
          ...(memberMatch
            ? {
                addedUserNames: [
                  memberMatch.user.name ?? memberMatch.user.email ?? 'Unknown',
                ],
              }
            : { removedUserNames: ['assignee'] }),
        },
        snapshot: snapshotForIssue(issue),
      });
    }
    if (args.stateName !== undefined) {
      const newState = await findIssueStateByName(
        ctx,
        organization._id,
        args.stateName,
      );
      if (newState) {
        // Get the old state name from the existing assignment
        const currentAssignees = await ctx.db
          .query('issueAssignees')
          .withIndex('by_issue', q => q.eq('issueId', issue._id))
          .collect();
        const oldStateId = currentAssignees[0]?.stateId;
        const oldState = oldStateId
          ? await ctx.db.get('issueStates', oldStateId)
          : null;

        await recordActivity(ctx, {
          scope: resolveIssueScope(issue),
          actorId: args.userId,
          entityType: 'issue',
          eventType: 'issue_workflow_state_changed',
          details: {
            field: 'workflow_state',
            fromLabel: oldState?.name ?? 'Unknown',
            toLabel: newState.name,
            viaAgent: true,
          },
          snapshot: snapshotForIssue(issue),
        });
      }
    }

    return {
      issueId: String(issue._id),
      key: newKey ?? issue.key,
      ...(newKey ? { oldKey: issue.key } : {}),
      title: nextTitle,
      ...(changes.length > 0 ? { changes: changes.join(', ') } : {}),
    };
  },
});

export const changeIssueKey = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    issueKey: v.optional(v.string()),
    context: v.union(
      v.literal('team'),
      v.literal('project'),
      v.literal('user'),
      v.literal('org'),
    ),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const issue = await resolveIssueFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.issueKey ?? null,
    );

    if (!(await canEditEntity(ctx, args.userId, issue, 'issue'))) {
      throw new ConvexError('FORBIDDEN');
    }

    // Determine the prefix based on the requested context
    let prefix: string;
    let contextLabel: string;

    if (args.context === 'project') {
      if (!issue.projectId) {
        throw new ConvexError(
          'Issue has no project assigned. Assign a project first or use a different context.',
        );
      }
      const project = await ctx.db.get('projects', issue.projectId);
      if (!project) {
        throw new ConvexError('PROJECT_NOT_FOUND');
      }
      prefix = project.key;
      contextLabel = `project "${project.name}" (${project.key})`;
    } else if (args.context === 'team') {
      if (!issue.teamId) {
        throw new ConvexError(
          'Issue has no team assigned. Assign a team first or use a different context.',
        );
      }
      const team = await ctx.db.get('teams', issue.teamId);
      if (!team) {
        throw new ConvexError('TEAM_NOT_FOUND');
      }
      prefix = team.key;
      contextLabel = `team "${team.name}" (${team.key})`;
    } else if (args.context === 'org') {
      prefix = organization.slug.toUpperCase();
      contextLabel = `organization "${organization.name}" (${organization.slug})`;
    } else {
      // user context — use the user's username or name initials
      const user = await ctx.db.get('users', args.userId);
      if (user?.username?.trim()) {
        prefix = user.username.trim().toUpperCase();
      } else if (user?.name?.trim()) {
        prefix = user.name
          .trim()
          .split(/\s+/)
          .map(w => w[0])
          .join('')
          .toUpperCase();
      } else {
        prefix = organization.slug.toUpperCase();
      }
      contextLabel = `user "${user?.name ?? user?.email ?? 'Unknown'}"`;
    }

    // Generate next available key with the new prefix
    const existingWithPrefix = await ctx.db
      .query('issues')
      .withIndex('by_organization', q =>
        q.eq('organizationId', organization._id),
      )
      .collect();
    const samePrefix = existingWithPrefix.filter(i =>
      i.key.startsWith(`${prefix}-`),
    );

    const nextKey = await getNextAvailableIssueKey(ctx, {
      organizationId: organization._id,
      prefix,
      startingSequenceNumber: samePrefix.length + 1,
    });

    const oldKey = issue.key;

    await ctx.db.patch('issues', issue._id, {
      key: nextKey.key,
      sequenceNumber: nextKey.sequenceNumber,
      searchText: buildIssueSearchText({
        key: nextKey.key,
        title: issue.title,
        description: issue.description,
      }),
    });

    await recordActivity(ctx, {
      scope: resolveIssueScope(issue),
      actorId: args.userId,
      entityType: 'issue',
      eventType: 'issue_title_changed',
      details: {
        field: 'title',
        fromLabel: oldKey,
        toLabel: nextKey.key,
        viaAgent: true,
      },
      snapshot: snapshotForIssue(issue),
    });

    return {
      issueId: String(issue._id),
      oldKey,
      newKey: nextKey.key,
      context: args.context,
      contextLabel,
      summary: `Key changed from ${oldKey} to ${nextKey.key} (based on ${contextLabel})`,
    };
  },
});

export const linkGitHubArtifactToIssue = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    issueKey: v.optional(v.string()),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const issue = await resolveIssueFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.issueKey ?? null,
    );

    if (!(await canEditEntity(ctx, args.userId, issue, 'issue'))) {
      throw new ConvexError('FORBIDDEN');
    }

    const parsed = parseGitHubArtifactUrl(args.url.trim());
    if (!parsed) {
      throw new ConvexError('INVALID_GITHUB_URL');
    }

    const fullName = `${parsed.owner}/${parsed.repo}`;
    const repository = await ctx.db
      .query('githubRepositories')
      .withIndex('by_full_name', q => q.eq('fullName', fullName))
      .filter(q => q.eq(q.field('organizationId'), organization._id))
      .first();

    if (!repository) {
      throw new ConvexError('GITHUB_ARTIFACT_NOT_INGESTED');
    }

    if (parsed.type === 'pull_request') {
      const artifact = await ctx.db
        .query('githubPullRequests')
        .withIndex('by_repo_number', q =>
          q.eq('repositoryId', repository._id).eq('number', parsed.number),
        )
        .first();
      if (!artifact) {
        throw new ConvexError('GITHUB_ARTIFACT_NOT_INGESTED');
      }

      await ctx.runMutation(internal.github.mutations.linkPullRequestManually, {
        organizationId: organization._id,
        issueId: issue._id,
        pullRequestId: artifact._id,
        repoFullName: repository.fullName,
        number: artifact.number,
        actorId: args.userId,
      });

      return {
        issueKey: issue.key,
        linked: `${repository.fullName}#${artifact.number}`,
        summary: `Linked PR ${repository.fullName}#${artifact.number} to ${issue.key}.`,
      };
    }

    if (parsed.type === 'issue') {
      const artifact = await ctx.db
        .query('githubIssues')
        .withIndex('by_repo_number', q =>
          q.eq('repositoryId', repository._id).eq('number', parsed.number),
        )
        .first();
      if (!artifact) {
        throw new ConvexError('GITHUB_ARTIFACT_NOT_INGESTED');
      }

      await ctx.runMutation(internal.github.mutations.linkGitHubIssueManually, {
        organizationId: organization._id,
        issueId: issue._id,
        githubIssueId: artifact._id,
        repoFullName: repository.fullName,
        number: artifact.number,
        actorId: args.userId,
      });

      return {
        issueKey: issue.key,
        linked: `${repository.fullName}#${artifact.number}`,
        summary: `Linked GitHub issue ${repository.fullName}#${artifact.number} to ${issue.key}.`,
      };
    }

    const artifact = await ctx.db
      .query('githubCommits')
      .withIndex('by_org_sha', q =>
        q.eq('organizationId', organization._id).eq('sha', parsed.sha),
      )
      .first();
    if (!artifact || artifact.repositoryId !== repository._id) {
      throw new ConvexError('GITHUB_ARTIFACT_NOT_INGESTED');
    }

    await ctx.runMutation(internal.github.mutations.linkCommitManually, {
      organizationId: organization._id,
      issueId: issue._id,
      commitId: artifact._id,
      repoFullName: repository.fullName,
      sha: artifact.sha,
      actorId: args.userId,
    });

    return {
      issueKey: issue.key,
      linked: `${repository.fullName}@${artifact.shortSha}`,
      summary: `Linked commit ${repository.fullName}@${artifact.shortSha} to ${issue.key}.`,
    };
  },
});

export const listProjects = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    teamKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const team =
      args.teamKey || args.pageContext?.kind === 'team_detail'
        ? await resolveTeamFromContext(
            ctx,
            organization._id,
            args.pageContext,
            args.teamKey,
          ).catch(() => null)
        : null;

    let projects = await ctx.db
      .query('projects')
      .withIndex('by_organization', q =>
        q.eq('organizationId', organization._id),
      )
      .collect();

    if (team) {
      projects = projects.filter(project => project.teamId === team._id);
    }

    const visible = [];
    for (const project of projects) {
      if (await canViewEntity(ctx, args.userId, project, 'project')) {
        visible.push(project);
      }
    }

    return visible.slice(0, args.limit ?? 25).map(project => ({
      id: String(project._id),
      key: project.key,
      name: project.name,
      visibility: project.visibility ?? 'organization',
      teamId: project.teamId ? String(project.teamId) : undefined,
      statusId: project.statusId ? String(project.statusId) : undefined,
      createdAt: project._creationTime,
    }));
  },
});

export const getProject = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    projectKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const project = await resolveProjectFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.projectKey ?? null,
    );

    if (!(await canViewEntity(ctx, args.userId, project, 'project'))) {
      throw new ConvexError('FORBIDDEN');
    }

    const status = project.statusId
      ? await ctx.db.get('projectStatuses', project.statusId)
      : null;

    return {
      id: String(project._id),
      key: project.key,
      name: project.name,
      description: project.description ?? '',
      visibility: project.visibility ?? 'organization',
      teamId: project.teamId ? String(project.teamId) : undefined,
      statusName: status?.name ?? undefined,
      startDate: project.startDate ?? undefined,
      dueDate: project.dueDate ?? undefined,
    };
  },
});

export const createProject = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    teamKey: v.optional(v.string()),
    statusName: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.PROJECT_CREATE,
    );

    const projectKey = args.key.trim();
    const projectName = args.name.trim();
    if (!projectKey || !projectName) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (projectKey.length > 20 || projectName.length > 100) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (args.description && args.description.length > 5000) {
      throw new ConvexError('INVALID_INPUT');
    }

    const existingProject = await ctx.db
      .query('projects')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', organization._id).eq('key', projectKey),
      )
      .first();
    if (existingProject) {
      throw new ConvexError('PROJECT_KEY_EXISTS');
    }

    const fallbackTeam =
      args.pageContext?.kind === 'team_detail'
        ? await resolveTeamFromContext(
            ctx,
            organization._id,
            args.pageContext,
          ).catch(() => null)
        : null;
    const team = args.teamKey
      ? await resolveTeamFromContext(
          ctx,
          organization._id,
          undefined,
          args.teamKey,
        )
      : fallbackTeam;
    const status = await findProjectStatusByName(
      ctx,
      organization._id,
      args.statusName,
    );

    const projectId = await ctx.db.insert('projects', {
      organizationId: organization._id,
      key: projectKey,
      name: projectName,
      description: args.description?.trim(),
      teamId: team?._id,
      statusId: status?._id ?? undefined,
      createdBy: args.userId,
      visibility: args.visibility ?? 'organization',
      icon: args.icon,
      color: args.color,
    });

    await ctx.db.insert('projectMembers', {
      projectId,
      userId: args.userId,
      role: 'lead',
      joinedAt: Date.now(),
    });
    await syncProjectRoleAssignment(ctx, projectId, args.userId, 'lead');

    return {
      projectId: String(projectId),
      key: projectKey,
      name: projectName,
    };
  },
});

export const updateProject = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    projectKey: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    teamKey: v.optional(v.union(v.string(), v.null())),
    statusName: v.optional(v.union(v.string(), v.null())),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    startDate: v.optional(v.union(v.string(), v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
    icon: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const project = await resolveProjectFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.projectKey ?? null,
    );

    if (!(await canEditEntity(ctx, args.userId, project, 'project'))) {
      throw new ConvexError('FORBIDDEN');
    }
    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (!trimmedName || trimmedName.length > 100) {
        throw new ConvexError('INVALID_INPUT');
      }
    }
    if (args.description !== undefined && args.description.length > 5000) {
      throw new ConvexError('INVALID_INPUT');
    }

    const team =
      args.teamKey === undefined
        ? undefined
        : args.teamKey === null
          ? null
          : await resolveTeamFromContext(
              ctx,
              organization._id,
              undefined,
              args.teamKey,
            );
    const status =
      args.statusName === undefined
        ? undefined
        : args.statusName === null
          ? null
          : await findProjectStatusByName(
              ctx,
              organization._id,
              args.statusName,
            );

    await ctx.db.patch('projects', project._id, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(team !== undefined ? { teamId: team?._id } : {}),
      ...(status !== undefined ? { statusId: status?._id } : {}),
      ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
      ...(args.startDate !== undefined
        ? { startDate: args.startDate ?? undefined }
        : {}),
      ...(args.dueDate !== undefined
        ? { dueDate: args.dueDate ?? undefined }
        : {}),
      ...(args.icon !== undefined ? { icon: args.icon ?? undefined } : {}),
      ...(args.color !== undefined ? { color: args.color ?? undefined } : {}),
    });

    return {
      projectId: String(project._id),
      key: project.key,
      name: args.name?.trim() ?? project.name,
    };
  },
});

export const listTeams = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );

    const teams = await ctx.db
      .query('teams')
      .withIndex('by_organization', q =>
        q.eq('organizationId', organization._id),
      )
      .collect();

    const visible = [];
    for (const team of teams) {
      if (await canViewEntity(ctx, args.userId, team, 'team')) {
        visible.push(team);
      }
    }

    return visible.slice(0, args.limit ?? 25).map(team => ({
      id: String(team._id),
      key: team.key,
      name: team.name,
      visibility: team.visibility ?? 'organization',
      createdAt: team._creationTime,
    }));
  },
});

export const getTeam = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    teamKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const team = await resolveTeamFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.teamKey ?? null,
    );

    if (!(await canViewEntity(ctx, args.userId, team, 'team'))) {
      throw new ConvexError('FORBIDDEN');
    }

    return {
      id: String(team._id),
      key: team.key,
      name: team.name,
      description: team.description ?? '',
      visibility: team.visibility ?? 'organization',
      icon: team.icon ?? undefined,
      color: team.color ?? undefined,
    };
  },
});

export const createTeam = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.TEAM_CREATE,
    );

    const teamKey = args.key.trim();
    const teamName = args.name.trim();
    if (!teamKey || !teamName) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (teamKey.length > 10 || teamName.length > 100) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (args.description && args.description.length > 2000) {
      throw new ConvexError('INVALID_INPUT');
    }

    const existingTeam = await ctx.db
      .query('teams')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', organization._id).eq('key', teamKey),
      )
      .first();
    if (existingTeam) {
      throw new ConvexError('TEAM_KEY_EXISTS');
    }

    const teamId = await ctx.db.insert('teams', {
      organizationId: organization._id,
      key: teamKey,
      name: teamName,
      description: args.description?.trim(),
      icon: args.icon,
      color: args.color,
      visibility: args.visibility ?? 'organization',
      createdBy: args.userId,
    });

    await ctx.db.insert('teamMembers', {
      teamId,
      userId: args.userId,
      role: 'lead',
      joinedAt: Date.now(),
    });
    await syncTeamRoleAssignment(ctx, teamId, args.userId, 'lead');

    return {
      teamId: String(teamId),
      key: teamKey,
      name: teamName,
    };
  },
});

export const updateTeam = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    teamKey: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
    icon: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const team = await resolveTeamFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.teamKey ?? null,
    );

    if (!(await canEditEntity(ctx, args.userId, team, 'team'))) {
      throw new ConvexError('FORBIDDEN');
    }
    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (!trimmedName || trimmedName.length > 100) {
        throw new ConvexError('INVALID_INPUT');
      }
    }
    if (args.description !== undefined && args.description.length > 2000) {
      throw new ConvexError('INVALID_INPUT');
    }

    await ctx.db.patch('teams', team._id, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
      ...(args.icon !== undefined ? { icon: args.icon ?? undefined } : {}),
      ...(args.color !== undefined ? { color: args.color ?? undefined } : {}),
    });

    return {
      teamId: String(team._id),
      key: team.key,
      name: args.name?.trim() ?? team.name,
    };
  },
});

export const setPendingDeleteAction = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    assistantThreadId: v.id('assistantThreads'),
    pageContext: v.optional(assistantPageContextValidator),
    entityType: v.union(
      v.literal('document'),
      v.literal('issue'),
      v.literal('project'),
      v.literal('team'),
    ),
    documentId: v.optional(v.string()),
    issueKey: v.optional(v.string()),
    projectKey: v.optional(v.string()),
    teamKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const row = await requireAssistantThreadRow(
      ctx,
      organization._id,
      args.userId,
    );
    if (row._id !== args.assistantThreadId) {
      throw new ConvexError('FORBIDDEN');
    }

    const entity =
      args.entityType === 'document'
        ? await resolveDocumentFromContext(
            ctx,
            organization._id,
            args.pageContext,
            args.documentId ?? null,
          )
        : args.entityType === 'issue'
          ? await resolveIssueFromContext(
              ctx,
              organization._id,
              args.pageContext,
              args.issueKey ?? null,
            )
          : args.entityType === 'project'
            ? await resolveProjectFromContext(
                ctx,
                organization._id,
                args.pageContext,
                args.projectKey ?? null,
              )
            : await resolveTeamFromContext(
                ctx,
                organization._id,
                args.pageContext,
                args.teamKey ?? null,
              );

    if (!(await canDeleteEntity(ctx, args.userId, entity, args.entityType))) {
      throw new ConvexError('FORBIDDEN');
    }

    const label = 'title' in entity ? entity.title : entity.name;
    const pendingAction: AssistantPendingAction = {
      id: makePendingActionId(),
      kind: 'delete_entity',
      entityType: args.entityType,
      entityId: String(entity._id),
      entityLabel: label,
      summary: `Delete ${args.entityType} "${label}"`,
      createdAt: Date.now(),
    };

    await ctx.db.patch('assistantThreads', row._id, {
      pendingAction,
      updatedAt: Date.now(),
      ...buildAssistantThreadPatch(
        args.pageContext ?? {
          kind: 'org_generic',
          orgSlug: args.orgSlug,
          path: `/${args.orgSlug}`,
        },
      ),
    });

    return pendingAction;
  },
});

export const executePendingAction = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    actionId: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const row = await requireAssistantThreadRow(
      ctx,
      organization._id,
      args.userId,
    );
    const pendingAction = row.pendingAction;

    if (!pendingAction || pendingAction.id !== args.actionId) {
      throw new ConvexError('PENDING_ACTION_NOT_FOUND');
    }

    switch (pendingAction.entityType) {
      case 'document': {
        const documentId = ctx.db.normalizeId(
          'documents',
          pendingAction.entityId,
        );
        if (!documentId) throw new ConvexError('DOCUMENT_NOT_FOUND');
        const document = await ctx.db.get('documents', documentId);
        if (!document) throw new ConvexError('DOCUMENT_NOT_FOUND');
        if (!(await canDeleteEntity(ctx, args.userId, document, 'document'))) {
          throw new ConvexError('FORBIDDEN');
        }
        const mentions = await ctx.db
          .query('documentMentions')
          .withIndex('by_document', q => q.eq('documentId', document._id))
          .collect();
        for (const mention of mentions) {
          await ctx.db.delete('documentMentions', mention._id);
        }
        await ctx.db.delete('documents', document._id);
        break;
      }
      case 'issue': {
        const issueId = ctx.db.normalizeId('issues', pendingAction.entityId);
        if (!issueId) throw new ConvexError('ISSUE_NOT_FOUND');
        const issue = await ctx.db.get('issues', issueId);
        if (!issue) throw new ConvexError('ISSUE_NOT_FOUND');
        if (!(await canDeleteEntity(ctx, args.userId, issue, 'issue'))) {
          throw new ConvexError('FORBIDDEN');
        }
        const child = await ctx.db
          .query('issues')
          .withIndex('by_parent', q => q.eq('parentIssueId', issue._id))
          .first();
        if (child) throw new ConvexError('HAS_CHILD_ISSUES');
        const assignees = await ctx.db
          .query('issueAssignees')
          .withIndex('by_issue', q => q.eq('issueId', issue._id))
          .collect();
        for (const assignee of assignees) {
          await ctx.db.delete('issueAssignees', assignee._id);
        }
        const comments = await ctx.db
          .query('comments')
          .withIndex('by_issue', q => q.eq('issueId', issue._id))
          .collect();
        for (const comment of comments) {
          await ctx.db.delete('comments', comment._id);
        }
        await ctx.db.delete('issues', issue._id);
        break;
      }
      case 'project': {
        const projectId = ctx.db.normalizeId(
          'projects',
          pendingAction.entityId,
        );
        if (!projectId) throw new ConvexError('PROJECT_NOT_FOUND');
        const project = await ctx.db.get('projects', projectId);
        if (!project) throw new ConvexError('PROJECT_NOT_FOUND');
        if (!(await canDeleteEntity(ctx, args.userId, project, 'project'))) {
          throw new ConvexError('FORBIDDEN');
        }
        const members = await ctx.db
          .query('projectMembers')
          .withIndex('by_project', q => q.eq('projectId', project._id))
          .collect();
        for (const member of members) {
          await ctx.db.delete('projectMembers', member._id);
        }
        const roleAssignments = await ctx.db
          .query('roleAssignments')
          .withIndex('by_project_user', q => q.eq('projectId', project._id))
          .collect();
        for (const assignment of roleAssignments) {
          await ctx.db.delete('roleAssignments', assignment._id);
        }
        const legacyAssignments = await ctx.db
          .query('projectRoleAssignments')
          .withIndex('by_project', q => q.eq('projectId', project._id))
          .collect();
        for (const assignment of legacyAssignments) {
          await ctx.db.delete('projectRoleAssignments', assignment._id);
        }
        const projectTeams = await ctx.db
          .query('projectTeams')
          .withIndex('by_project', q => q.eq('projectId', project._id))
          .collect();
        for (const projectTeam of projectTeams) {
          await ctx.db.delete('projectTeams', projectTeam._id);
        }
        await ctx.db.delete('projects', project._id);
        break;
      }
      case 'team': {
        const teamId = ctx.db.normalizeId('teams', pendingAction.entityId);
        if (!teamId) throw new ConvexError('TEAM_NOT_FOUND');
        const team = await ctx.db.get('teams', teamId);
        if (!team) throw new ConvexError('TEAM_NOT_FOUND');
        if (!(await canDeleteEntity(ctx, args.userId, team, 'team'))) {
          throw new ConvexError('FORBIDDEN');
        }
        const members = await ctx.db
          .query('teamMembers')
          .withIndex('by_team', q => q.eq('teamId', team._id))
          .collect();
        for (const member of members) {
          await ctx.db.delete('teamMembers', member._id);
        }
        const roleAssignments = await ctx.db
          .query('roleAssignments')
          .withIndex('by_team_user', q => q.eq('teamId', team._id))
          .collect();
        for (const assignment of roleAssignments) {
          await ctx.db.delete('roleAssignments', assignment._id);
        }
        const legacyAssignments = await ctx.db
          .query('teamRoleAssignments')
          .withIndex('by_team', q => q.eq('teamId', team._id))
          .collect();
        for (const assignment of legacyAssignments) {
          await ctx.db.delete('teamRoleAssignments', assignment._id);
        }
        await ctx.db.delete('teams', team._id);
        break;
      }
      case 'folder': {
        const folderId = ctx.db.normalizeId(
          'documentFolders',
          pendingAction.entityId,
        );
        if (!folderId) throw new ConvexError('FOLDER_NOT_FOUND');
        const folder = await ctx.db.get('documentFolders', folderId);
        if (!folder || folder.organizationId !== organization._id) {
          throw new ConvexError('FOLDER_NOT_FOUND');
        }
        await requireOrgPermissionForUser(
          ctx,
          organization._id,
          args.userId,
          PERMISSIONS.DOCUMENT_DELETE,
        );
        const documents = await ctx.db
          .query('documents')
          .withIndex('by_folder', q => q.eq('folderId', folder._id))
          .collect();
        for (const document of documents) {
          await ctx.db.patch('documents', document._id, {
            folderId: undefined,
          });
        }
        await ctx.db.delete('documentFolders', folder._id);
        break;
      }
    }

    await ctx.db.patch('assistantThreads', row._id, {
      pendingAction: undefined,
      updatedAt: Date.now(),
    });

    return pendingAction;
  },
});

// ──── Client action queue ────

export const enqueueClientAction = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    type: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const actionId = await ctx.db.insert('assistantActions', {
      organizationId: organization._id,
      userId: args.userId,
      type: args.type,
      payload: args.payload,
      status: 'pending',
      createdAt: Date.now(),
    });
    return { actionId: String(actionId) };
  },
});

export const clearPendingAction = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const row = await requireAssistantThreadRow(
      ctx,
      organization._id,
      args.userId,
    );
    await ctx.db.patch('assistantThreads', row._id, {
      pendingAction: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// ──── Team member management ────

export const addTeamMember = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    teamKey: v.optional(v.string()),
    memberName: v.string(),
    role: v.optional(v.union(v.literal('lead'), v.literal('member'))),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const team = await resolveTeamFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.teamKey,
    );
    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.memberName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');
    if (!(await canManageTeamMembersForUser(ctx, args.userId, team, 'add'))) {
      throw new ConvexError('FORBIDDEN');
    }

    const existing = await ctx.db
      .query('teamMembers')
      .withIndex('by_team_user', q =>
        q.eq('teamId', team._id).eq('userId', memberMatch.user._id),
      )
      .first();
    if (existing) {
      return {
        message: `${memberMatch.user.name ?? memberMatch.user.email} is already a member of ${team.name}`,
      };
    }

    const role = args.role ?? 'member';
    await ctx.db.insert('teamMembers', {
      teamId: team._id,
      userId: memberMatch.user._id,
      role,
      joinedAt: Date.now(),
    });
    await syncTeamRoleAssignment(ctx, team._id, memberMatch.user._id, role);

    return {
      message: `Added ${memberMatch.user.name ?? memberMatch.user.email} to ${team.name} as ${role}`,
      teamKey: team.key,
      userName: memberMatch.user.name ?? memberMatch.user.email,
    };
  },
});

export const removeTeamMember = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    teamKey: v.optional(v.string()),
    memberName: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const team = await resolveTeamFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.teamKey,
    );
    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.memberName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');
    if (
      !(await canManageTeamMembersForUser(ctx, args.userId, team, 'remove'))
    ) {
      throw new ConvexError('FORBIDDEN');
    }

    const membership = await ctx.db
      .query('teamMembers')
      .withIndex('by_team_user', q =>
        q.eq('teamId', team._id).eq('userId', memberMatch.user._id),
      )
      .first();
    if (!membership) {
      return {
        message: `${memberMatch.user.name ?? memberMatch.user.email} is not a member of ${team.name}`,
      };
    }

    const scopedAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_team_user', q =>
        q.eq('teamId', team._id).eq('userId', memberMatch.user._id),
      )
      .collect();
    for (const assignment of scopedAssignments) {
      await ctx.db.delete('roleAssignments', assignment._id);
    }

    const legacyAssignments = await ctx.db
      .query('teamRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', memberMatch.user._id))
      .collect();
    for (const assignment of legacyAssignments) {
      if (assignment.teamId === team._id) {
        await ctx.db.delete('teamRoleAssignments', assignment._id);
      }
    }

    await ctx.db.delete('teamMembers', membership._id);
    return {
      message: `Removed ${memberMatch.user.name ?? memberMatch.user.email} from ${team.name}`,
      teamKey: team.key,
      userName: memberMatch.user.name ?? memberMatch.user.email,
    };
  },
});

export const changeTeamLead = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    teamKey: v.optional(v.string()),
    leadName: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const team = await resolveTeamFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.teamKey,
    );
    if (
      !(await canManageTeamMembersForUser(ctx, args.userId, team, 'update'))
    ) {
      throw new ConvexError('FORBIDDEN');
    }

    if (args.leadName === null) {
      await setTeamLeadMemberRole(ctx, team, null);
      return { message: `Removed lead from ${team.name}`, teamKey: team.key };
    }

    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.leadName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');

    await setTeamLeadMemberRole(ctx, team, memberMatch.user._id);

    return {
      message: `Set ${memberMatch.user.name ?? memberMatch.user.email} as lead of ${team.name}`,
      teamKey: team.key,
      userName: memberMatch.user.name ?? memberMatch.user.email,
    };
  },
});

// ──── Project member management ────

export const addProjectMember = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    projectKey: v.optional(v.string()),
    memberName: v.string(),
    role: v.optional(v.union(v.literal('lead'), v.literal('member'))),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const project = await resolveProjectFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.projectKey,
    );
    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.memberName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');
    if (
      !(await canManageProjectMembersForUser(ctx, args.userId, project, 'add'))
    ) {
      throw new ConvexError('FORBIDDEN');
    }

    const existing = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', q =>
        q.eq('projectId', project._id).eq('userId', memberMatch.user._id),
      )
      .first();
    if (existing) {
      return {
        message: `${memberMatch.user.name ?? memberMatch.user.email} is already a member of ${project.name}`,
      };
    }

    const role = args.role ?? 'member';
    await ctx.db.insert('projectMembers', {
      projectId: project._id,
      userId: memberMatch.user._id,
      role,
      joinedAt: Date.now(),
    });
    await syncProjectRoleAssignment(
      ctx,
      project._id,
      memberMatch.user._id,
      role,
    );

    return {
      message: `Added ${memberMatch.user.name ?? memberMatch.user.email} to ${project.name} as ${role}`,
      projectKey: project.key,
      userName: memberMatch.user.name ?? memberMatch.user.email,
    };
  },
});

export const removeProjectMember = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    projectKey: v.optional(v.string()),
    memberName: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const project = await resolveProjectFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.projectKey,
    );
    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.memberName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');
    if (
      !(await canManageProjectMembersForUser(
        ctx,
        args.userId,
        project,
        'remove',
      ))
    ) {
      throw new ConvexError('FORBIDDEN');
    }

    const membership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', q =>
        q.eq('projectId', project._id).eq('userId', memberMatch.user._id),
      )
      .first();
    if (!membership) {
      return {
        message: `${memberMatch.user.name ?? memberMatch.user.email} is not a member of ${project.name}`,
      };
    }

    const scopedAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_project_user', q =>
        q.eq('projectId', project._id).eq('userId', memberMatch.user._id),
      )
      .collect();
    for (const assignment of scopedAssignments) {
      await ctx.db.delete('roleAssignments', assignment._id);
    }

    const legacyAssignments = await ctx.db
      .query('projectRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', memberMatch.user._id))
      .collect();
    for (const assignment of legacyAssignments) {
      if (assignment.projectId === project._id) {
        await ctx.db.delete('projectRoleAssignments', assignment._id);
      }
    }

    await ctx.db.delete('projectMembers', membership._id);
    return {
      message: `Removed ${memberMatch.user.name ?? memberMatch.user.email} from ${project.name}`,
      projectKey: project.key,
      userName: memberMatch.user.name ?? memberMatch.user.email,
    };
  },
});

export const changeProjectLead = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    projectKey: v.optional(v.string()),
    leadName: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const project = await resolveProjectFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.projectKey,
    );
    if (
      !(await canManageProjectMembersForUser(
        ctx,
        args.userId,
        project,
        'update',
      ))
    ) {
      throw new ConvexError('FORBIDDEN');
    }

    if (args.leadName === null) {
      await setProjectLeadMemberRole(ctx, project, null);
      return {
        message: `Removed lead from ${project.name}`,
        projectKey: project.key,
      };
    }

    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.leadName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');

    await setProjectLeadMemberRole(ctx, project, memberMatch.user._id);

    return {
      message: `Set ${memberMatch.user.name ?? memberMatch.user.email} as lead of ${project.name}`,
      projectKey: project.key,
      userName: memberMatch.user.name ?? memberMatch.user.email,
    };
  },
});

// ──── Issue assignment (delegation) ────

export const assignIssue = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    issueKey: v.optional(v.string()),
    assigneeName: v.string(),
    stateName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const issue = await resolveIssueFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.issueKey ?? null,
    );
    if (!(await canAssignIssueForUser(ctx, args.userId, issue))) {
      throw new ConvexError('FORBIDDEN');
    }

    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.assigneeName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');

    // Check if already assigned
    const existing = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue_assignee', q =>
        q.eq('issueId', issue._id).eq('assigneeId', memberMatch.user._id),
      )
      .first();
    if (existing) {
      // Update state if requested
      if (args.stateName) {
        const state = await findIssueStateByName(
          ctx,
          organization._id,
          args.stateName,
        );
        if (state) {
          await ctx.db.patch('issueAssignees', existing._id, {
            stateId: state._id,
          });
          return {
            message: `Updated ${memberMatch.user.name ?? memberMatch.user.email}'s state on ${issue.key} to ${state.name}`,
          };
        }
      }
      return {
        message: `${memberMatch.user.name ?? memberMatch.user.email} is already assigned to ${issue.key}`,
      };
    }

    const state = args.stateName
      ? await findIssueStateByName(ctx, organization._id, args.stateName)
      : await ctx.db
          .query('issueStates')
          .withIndex('by_organization', q =>
            q.eq('organizationId', organization._id),
          )
          .filter(q => q.eq(q.field('type'), 'todo'))
          .first();

    if (!state) throw new ConvexError('NO_DEFAULT_STATE');

    // If there's a single unassigned entry, update it instead of inserting
    const allAssignments = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue', q => q.eq('issueId', issue._id))
      .collect();
    const unassignedEntry =
      allAssignments.length === 1 && !allAssignments[0].assigneeId
        ? allAssignments[0]
        : null;

    if (unassignedEntry) {
      await ctx.db.patch('issueAssignees', unassignedEntry._id, {
        assigneeId: memberMatch.user._id,
        stateId: state._id,
      });
    } else {
      await ctx.db.insert('issueAssignees', {
        issueId: issue._id,
        assigneeId: memberMatch.user._id,
        stateId: state._id,
      });
    }

    // Record activity
    await recordActivity(ctx, {
      scope: resolveIssueScope(issue),
      actorId: args.userId,
      entityType: 'issue',
      eventType: 'issue_assignees_changed',
      details: {
        addedUserNames: [
          memberMatch.user.name ?? memberMatch.user.email ?? 'Unknown',
        ],
        viaAgent: true,
      },
      snapshot: snapshotForIssue(issue),
    });

    return {
      message: `Assigned ${memberMatch.user.name ?? memberMatch.user.email} to ${issue.key}`,
      issueKey: issue.key,
      userName: memberMatch.user.name ?? memberMatch.user.email,
    };
  },
});

export const unassignIssue = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    issueKey: v.optional(v.string()),
    assigneeName: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const issue = await resolveIssueFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.issueKey ?? null,
    );
    if (!(await canAssignIssueForUser(ctx, args.userId, issue))) {
      throw new ConvexError('FORBIDDEN');
    }

    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.assigneeName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');

    const assignment = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue_assignee', q =>
        q.eq('issueId', issue._id).eq('assigneeId', memberMatch.user._id),
      )
      .first();
    if (!assignment) {
      return {
        message: `${memberMatch.user.name ?? memberMatch.user.email} is not assigned to ${issue.key}`,
      };
    }

    await ctx.db.delete('issueAssignees', assignment._id);
    return {
      message: `Unassigned ${memberMatch.user.name ?? memberMatch.user.email} from ${issue.key}`,
      issueKey: issue.key,
      userName: memberMatch.user.name ?? memberMatch.user.email,
    };
  },
});

// ──── Document folder management ────

export const createFolder = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.DOCUMENT_CREATE,
    );

    if (!args.name.trim()) throw new ConvexError('INVALID_INPUT');
    if (args.name.trim().length > 100) throw new ConvexError('INVALID_INPUT');

    const folderId = await ctx.db.insert('documentFolders', {
      organizationId: organization._id,
      name: args.name.trim(),
      description: args.description?.trim(),
      icon: args.icon,
      color: args.color,
      createdBy: args.userId,
    });

    return {
      folderId: String(folderId),
      name: args.name.trim(),
      message: `Created folder "${args.name.trim()}"`,
    };
  },
});

export const updateFolder = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    folderId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    icon: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const folderDocId = ctx.db.normalizeId('documentFolders', args.folderId);
    if (!folderDocId) throw new ConvexError('FOLDER_NOT_FOUND');
    const folder = await ctx.db.get('documentFolders', folderDocId);
    if (!folder || folder.organizationId !== organization._id)
      throw new ConvexError('FOLDER_NOT_FOUND');
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.DOCUMENT_EDIT,
    );
    if (args.name !== undefined && !args.name.trim()) {
      throw new ConvexError('INVALID_INPUT');
    }
    if (args.name !== undefined && args.name.trim().length > 100) {
      throw new ConvexError('INVALID_INPUT');
    }

    await ctx.db.patch('documentFolders', folderDocId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.description !== undefined
        ? { description: args.description ?? undefined }
        : {}),
      ...(args.icon !== undefined ? { icon: args.icon ?? undefined } : {}),
      ...(args.color !== undefined ? { color: args.color ?? undefined } : {}),
    });

    return {
      folderId: args.folderId,
      name: args.name?.trim() ?? folder.name,
      message: `Updated folder "${args.name?.trim() ?? folder.name}"`,
    };
  },
});

export const requestDeleteFolder = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    assistantThreadId: v.id('assistantThreads'),
    folderId: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const folderDocId = ctx.db.normalizeId('documentFolders', args.folderId);
    if (!folderDocId) throw new ConvexError('FOLDER_NOT_FOUND');
    const folder = await ctx.db.get('documentFolders', folderDocId);
    if (!folder || folder.organizationId !== organization._id)
      throw new ConvexError('FOLDER_NOT_FOUND');
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.DOCUMENT_DELETE,
    );
    const row = await requireAssistantThreadRow(
      ctx,
      organization._id,
      args.userId,
    );
    if (row._id !== args.assistantThreadId) {
      throw new ConvexError('FORBIDDEN');
    }

    const actionId = makePendingActionId();
    const pendingAction: AssistantPendingAction = {
      id: actionId,
      kind: 'delete_entity',
      entityType: 'folder',
      entityId: args.folderId,
      entityLabel: folder.name,
      summary: `Delete folder "${folder.name}" and unlink its documents`,
      createdAt: Date.now(),
    };

    await ctx.db.patch('assistantThreads', row._id, {
      pendingAction,
      updatedAt: Date.now(),
    });

    return { summary: pendingAction.summary };
  },
});

export const moveDocumentToFolder = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    pageContext: v.optional(assistantPageContextValidator),
    documentId: v.optional(v.string()),
    folderId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const document = await resolveDocumentFromContext(
      ctx,
      organization._id,
      args.pageContext,
      args.documentId ?? null,
    );
    if (!(await canEditEntity(ctx, args.userId, document, 'document'))) {
      throw new ConvexError('FORBIDDEN');
    }

    if (args.folderId === null) {
      await ctx.db.patch('documents', document._id, { folderId: undefined });
      return {
        message: `Removed "${document.title}" from its folder`,
        documentTitle: document.title,
      };
    }

    const folderDocId = ctx.db.normalizeId('documentFolders', args.folderId);
    if (!folderDocId) throw new ConvexError('FOLDER_NOT_FOUND');
    const folder = await ctx.db.get('documentFolders', folderDocId);
    if (!folder || folder.organizationId !== organization._id)
      throw new ConvexError('FOLDER_NOT_FOUND');

    await ctx.db.patch('documents', document._id, { folderId: folderDocId });
    return {
      message: `Moved "${document.title}" to folder "${folder.name}"`,
      documentTitle: document.title,
      folderName: folder.name,
    };
  },
});

export const listFolders = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const folders = await ctx.db
      .query('documentFolders')
      .withIndex('by_organizationId', q =>
        q.eq('organizationId', organization._id),
      )
      .collect();

    const results = [];
    for (const folder of folders) {
      const docCount = await ctx.db
        .query('documents')
        .withIndex('by_folder', q => q.eq('folderId', folder._id))
        .collect();
      results.push({
        id: String(folder._id),
        name: folder.name,
        description: folder.description ?? undefined,
        color: folder.color ?? undefined,
        documentCount: docCount.length,
        createdAt: folder._creationTime,
      });
    }
    return results;
  },
});

// ──── Organization member management ────

export const listOrgMembers = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const members = await ctx.db
      .query('members')
      .withIndex('by_organization', q =>
        q.eq('organizationId', organization._id),
      )
      .collect();

    const results = [];
    for (const member of members) {
      const user = await ctx.db.get('users', member.userId);
      if (!user) continue;
      results.push({
        name: user.name ?? user.username ?? user.email ?? 'Unknown',
        email: user.email ?? undefined,
        role: member.role,
        userId: String(member.userId),
      });
    }
    return results;
  },
});

export const listOrgInvites = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const invites = await ctx.db
      .query('invitations')
      .withIndex('by_organization', q =>
        q.eq('organizationId', organization._id),
      )
      .collect();

    const pending = invites.filter(
      inv => inv.status === 'pending' && inv.expiresAt > Date.now(),
    );

    const results = [];
    for (const inv of pending) {
      const inviter = await ctx.db.get('users', inv.inviterId);
      results.push({
        inviteId: String(inv._id),
        email: inv.email,
        role: inv.role,
        invitedBy: inviter?.name ?? inviter?.email ?? 'Unknown',
        expiresAt: new Date(inv.expiresAt).toISOString(),
      });
    }
    return results;
  },
});

export const inviteOrgMember = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    email: v.string(),
    role: v.union(v.literal('member'), v.literal('admin')),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const email = args.email.toLowerCase().trim();
    if (!email || !email.includes('@')) {
      throw new ConvexError('INVALID_EMAIL');
    }

    const existingUser = await ctx.db
      .query('users')
      .withIndex('email', q => q.eq('email', email))
      .first();

    if (existingUser) {
      const existingMembership = await ctx.db
        .query('members')
        .withIndex('by_org_user', q =>
          q
            .eq('organizationId', organization._id)
            .eq('userId', existingUser._id),
        )
        .first();
      if (existingMembership) {
        return { message: `${email} is already a member of this organization` };
      }
    }

    const inviteId = await ctx.db.insert('invitations', {
      organizationId: organization._id,
      email,
      role: args.role,
      status: 'pending',
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      inviterId: args.userId,
    });

    const inviter = await ctx.db.get('users', args.userId);

    await createNotificationEvent(ctx, {
      type: 'organization_invite',
      actorId: args.userId,
      organizationId: organization._id,
      invitationId: inviteId,
      payload: {
        organizationName: organization.name,
        inviterName:
          inviter?.name ?? inviter?.username ?? inviter?.email ?? 'Someone',
        roleLabel: args.role,
        href: '/settings/invites',
      },
      recipients: [
        {
          userId: existingUser?._id,
          email,
        },
      ],
    });

    return {
      message: `Invited ${email} as ${args.role}`,
      inviteId: String(inviteId),
      email,
      role: args.role,
    };
  },
});

export const revokeOrgInvite = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    inviteId: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const inviteDocId = ctx.db.normalizeId('invitations', args.inviteId);
    if (!inviteDocId) throw new ConvexError('INVITE_NOT_FOUND');
    const invite = await ctx.db.get('invitations', inviteDocId);
    if (!invite || invite.organizationId !== organization._id) {
      throw new ConvexError('INVITE_NOT_FOUND');
    }
    if (invite.status !== 'pending') {
      return {
        message: `Invitation to ${invite.email} is already ${invite.status}`,
      };
    }

    await ctx.db.patch('invitations', invite._id, {
      status: 'revoked',
      revokedAt: Date.now(),
    });

    return { message: `Revoked invitation to ${invite.email}` };
  },
});

export const removeOrgMember = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    memberName: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.memberName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');

    const member = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q
          .eq('organizationId', organization._id)
          .eq('userId', memberMatch.user._id),
      )
      .first();
    if (!member) throw new ConvexError('MEMBER_NOT_FOUND');

    if (member.role === 'owner') {
      return { message: 'Cannot remove the organization owner' };
    }

    // Clean up all role assignments
    const orgAssignments = await ctx.db
      .query('roleAssignments')
      .withIndex('by_org_user', q =>
        q
          .eq('organizationId', organization._id)
          .eq('userId', memberMatch.user._id),
      )
      .collect();
    for (const assignment of orgAssignments) {
      await ctx.db.delete('roleAssignments', assignment._id);
    }

    const legacyOrgAssignments = await ctx.db
      .query('orgRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', memberMatch.user._id))
      .collect();
    for (const assignment of legacyOrgAssignments) {
      if (assignment.organizationId === organization._id) {
        await ctx.db.delete('orgRoleAssignments', assignment._id);
      }
    }

    const legacyTeamAssignments = await ctx.db
      .query('teamRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', memberMatch.user._id))
      .collect();
    for (const assignment of legacyTeamAssignments) {
      const team = await ctx.db.get('teams', assignment.teamId);
      if (team?.organizationId === organization._id) {
        await ctx.db.delete('teamRoleAssignments', assignment._id);
      }
    }

    const legacyProjectAssignments = await ctx.db
      .query('projectRoleAssignments')
      .withIndex('by_user', q => q.eq('userId', memberMatch.user._id))
      .collect();
    for (const assignment of legacyProjectAssignments) {
      const project = await ctx.db.get('projects', assignment.projectId);
      if (project?.organizationId === organization._id) {
        await ctx.db.delete('projectRoleAssignments', assignment._id);
      }
    }

    // Remove from all teams in this org
    const teamMemberships = await ctx.db
      .query('teamMembers')
      .withIndex('by_user', q => q.eq('userId', memberMatch.user._id))
      .collect();
    for (const membership of teamMemberships) {
      const team = await ctx.db.get('teams', membership.teamId);
      if (team?.organizationId === organization._id) {
        await ctx.db.delete('teamMembers', membership._id);
      }
    }

    // Remove from all projects in this org
    const projectMemberships = await ctx.db
      .query('projectMembers')
      .withIndex('by_user', q => q.eq('userId', memberMatch.user._id))
      .collect();
    for (const membership of projectMemberships) {
      const project = await ctx.db.get('projects', membership.projectId);
      if (project?.organizationId === organization._id) {
        await ctx.db.delete('projectMembers', membership._id);
      }
    }

    await ctx.db.delete('members', member._id);

    const displayName =
      memberMatch.user.name ?? memberMatch.user.email ?? 'Unknown';
    return {
      message: `Removed ${displayName} from the organization`,
      userName: displayName,
    };
  },
});

export const updateOrgMemberRole = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    memberName: v.string(),
    role: v.union(v.literal('member'), v.literal('admin')),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.memberName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');

    const member = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q
          .eq('organizationId', organization._id)
          .eq('userId', memberMatch.user._id),
      )
      .first();
    if (!member) throw new ConvexError('MEMBER_NOT_FOUND');

    if (member.role === 'owner') {
      return { message: "Cannot change the organization owner's role" };
    }

    await ctx.db.patch('members', member._id, { role: args.role });
    await syncOrganizationRoleAssignment(
      ctx,
      organization._id,
      memberMatch.user._id,
      args.role,
    );

    const displayName =
      memberMatch.user.name ?? memberMatch.user.email ?? 'Unknown';
    return {
      message: `Updated ${displayName}'s role to ${args.role}`,
      userName: displayName,
      role: args.role,
    };
  },
});

export const renameMember = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    memberName: v.string(),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.memberName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');

    const trimmedName = args.newName.trim();
    if (!trimmedName) throw new ConvexError('INVALID_INPUT');

    const oldName =
      memberMatch.user.name ?? memberMatch.user.email ?? 'Unknown';

    await ctx.db.patch('users', memberMatch.user._id, { name: trimmedName });

    return {
      message: `Renamed "${oldName}" to "${trimmedName}"`,
      oldName,
      newName: trimmedName,
    };
  },
});

export const sendEmailToMember = internalMutation({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    recipientName: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    await requireOrgPermissionForUser(
      ctx,
      organization._id,
      args.userId,
      PERMISSIONS.ORG_MANAGE_MEMBERS,
    );

    const memberMatch = await findMemberByName(
      ctx,
      organization._id,
      args.recipientName,
    );
    if (!memberMatch) throw new ConvexError('MEMBER_NOT_FOUND');

    const recipientEmail = memberMatch.user.email;
    if (!recipientEmail) {
      throw new ConvexError('Member does not have an email address');
    }

    const sender = await ctx.db.get('users', args.userId);
    const senderName =
      sender?.name ?? sender?.email ?? sender?.username ?? 'Vector';

    // Build a simple HTML email
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#f0f0f0;font-family:Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#111111;border:1px solid #222222;border-radius:8px;padding:24px">
      <div style="font-size:22px;font-weight:600;font-family:Urbanist,Poppins,sans-serif;margin-bottom:16px;color:#ffffff">${args.subject}</div>
      <div style="font-size:14px;line-height:1.6;color:#f0f0f0;white-space:pre-wrap">${args.body}</div>
      <hr style="border:none;border-top:1px solid #222222;margin:20px 0">
      <div style="font-size:12px;color:#888888">Sent by ${senderName} via Vector &middot; ${organization.name}</div>
    </div>
  </div>
</body>
</html>`;

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.actions.sendCustomEmail,
      {
        to: recipientEmail,
        subject: args.subject,
        html,
      },
    );

    const displayName =
      memberMatch.user.name ?? memberMatch.user.email ?? 'Unknown';
    return {
      message: `Email sent to ${displayName} (${recipientEmail})`,
      recipient: displayName,
      recipientEmail,
      subject: args.subject,
    };
  },
});

// ──── Activity feed ────

type ActivityEventDoc = Doc<'activityEvents'>;

function matchesAssistantActivityFilters(
  event: ActivityEventDoc,
  args: {
    entityType?: ActivityEventDoc['entityType'];
    eventType?: ActivityEventDoc['eventType'];
    since?: number;
    until?: number;
  },
) {
  if (args.since != null && event._creationTime < args.since) {
    return false;
  }

  if (args.until != null && event._creationTime > args.until) {
    return false;
  }

  if (args.entityType && event.entityType !== args.entityType) {
    return false;
  }

  if (args.eventType && event.eventType !== args.eventType) {
    return false;
  }

  return true;
}

async function canUserViewActivityEvent(
  ctx: QueryCtx,
  userId: Id<'users'>,
  event: ActivityEventDoc,
) {
  switch (event.entityType) {
    case 'issue': {
      if (!event.issueId) return false;
      const issue = await ctx.db.get('issues', event.issueId);
      return issue ? await canViewEntity(ctx, userId, issue, 'issue') : false;
    }
    case 'project': {
      if (!event.projectId) return false;
      const project = await ctx.db.get('projects', event.projectId);
      return project
        ? await canViewEntity(ctx, userId, project, 'project')
        : false;
    }
    case 'document': {
      if (!event.documentId) return false;
      const document = await ctx.db.get('documents', event.documentId);
      return document
        ? await canViewEntity(ctx, userId, document, 'document')
        : false;
    }
    case 'team': {
      if (!event.teamId) return false;
      const team = await ctx.db.get('teams', event.teamId);
      return team ? await canViewEntity(ctx, userId, team, 'team') : false;
    }
  }
}

async function collectAssistantActivityPage(
  ctx: QueryCtx,
  organizationId: Id<'organizations'>,
  args: {
    userId: Id<'users'>;
    entityType?: ActivityEventDoc['entityType'];
    eventType?: ActivityEventDoc['eventType'];
    since?: number;
    until?: number;
    limit?: number;
    cursor?: string;
  },
) {
  const limit = Math.min(args.limit ?? 25, 100);
  const events: ActivityEventDoc[] = [];
  let cursor = args.cursor ?? null;
  let isDone = false;

  while (events.length < limit && !isDone) {
    const page = await ctx.db
      .query('activityEvents')
      .withIndex('by_organization', q => q.eq('organizationId', organizationId))
      .order('desc')
      .paginate({
        cursor,
        numItems: limit - events.length,
      });

    const matchingEvents = page.page.filter(event =>
      matchesAssistantActivityFilters(event, args),
    );
    const visibility = await Promise.all(
      matchingEvents.map(event =>
        canUserViewActivityEvent(ctx, args.userId, event),
      ),
    );

    events.push(
      ...matchingEvents.filter((_, index) => visibility[index] === true),
    );

    cursor = page.continueCursor;
    isDone = page.isDone || !page.continueCursor;
  }

  return {
    events,
    nextCursor: isDone ? null : cursor,
  };
}

export const listActivity = internalQuery({
  args: {
    orgSlug: v.string(),
    userId: v.id('users'),
    entityType: v.optional(activityEntityTypeValidator),
    eventType: v.optional(activityEventTypeValidator),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      args.userId,
    );
    const result = await collectAssistantActivityPage(ctx, organization._id, {
      ...args,
      userId: args.userId,
    });

    // Hydrate actors
    const actorIds = [...new Set(result.events.map(e => e.actorId))];
    const actors = await Promise.all(
      actorIds.map(id => ctx.db.get('users', id)),
    );
    const actorMap = new Map(
      actorIds.flatMap((id, i) => (actors[i] ? [[id, actors[i]]] : [])),
    );

    const items = result.events.map(e => {
      const actor = actorMap.get(e.actorId);
      return {
        id: String(e._id),
        createdAt: new Date(e._creationTime).toISOString(),
        entityType: e.entityType,
        eventType: e.eventType,
        actor: actor
          ? { name: actor.name ?? actor.username ?? actor.email ?? 'Unknown' }
          : null,
        target: {
          key: e.snapshot.entityKey ?? null,
          name: e.snapshot.entityName ?? null,
        },
        details: {
          field: e.details.field ?? null,
          fromLabel: e.details.fromLabel ?? null,
          toLabel: e.details.toLabel ?? null,
          commentPreview: e.details.commentPreview ?? null,
        },
      };
    });

    return { items, nextCursor: result.nextCursor };
  },
});
