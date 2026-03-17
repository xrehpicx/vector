import { saveMessage } from '@convex-dev/agent';
import { ConvexError, v } from 'convex/values';
import { components, internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from '../_generated/server';
import {
  getOrganizationBySlug,
  requireAuthUser,
  requireOrgPermission,
} from '../authz';
import { canEditIssue } from '../access';
import {
  recordActivity,
  resolveIssueScope,
  snapshotForIssue,
} from '../activities/lib';
import { PERMISSIONS } from '../_shared/permissions';
import { buildIssueSearchText } from '../issues/search';
import {
  buildArtifactExternalKey,
  normalizeIssueKey,
  selectWorkflowTypeFromGitHubIssues,
  selectWorkflowTypeFromPullRequests,
  type GitHubArtifactType,
} from './shared';

async function getOrCreateIntegration(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
) {
  const existing = await ctx.db
    .query('githubIntegrations')
    .withIndex('by_org_provider', q =>
      q.eq('organizationId', organizationId).eq('provider', 'github'),
    )
    .first();

  if (existing) return existing;

  const id = await ctx.db.insert('githubIntegrations', {
    organizationId,
    provider: 'github',
    autoLinkEnabled: true,
    connectionMode: 'webhook',
    updatedAt: Date.now(),
  });
  return await ctx.db.get('githubIntegrations', id);
}

async function getIssueStateIdByType(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  type: Doc<'issueStates'>['type'],
) {
  return await ctx.db
    .query('issueStates')
    .withIndex('by_org_type', q =>
      q.eq('organizationId', organizationId).eq('type', type),
    )
    .first()
    .then(state => state?._id ?? null);
}

async function getDefaultAssignmentState(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
) {
  return (
    (await ctx.db
      .query('issueStates')
      .withIndex('by_org_type', q =>
        q.eq('organizationId', organizationId).eq('type', 'in_progress'),
      )
      .first()) ??
    (await ctx.db
      .query('issueStates')
      .withIndex('by_org_type', q =>
        q.eq('organizationId', organizationId).eq('type', 'todo'),
      )
      .first()) ??
    (await ctx.db
      .query('issueStates')
      .withIndex('by_organization', q => q.eq('organizationId', organizationId))
      .order('asc')
      .first()) ??
    null
  );
}

function buildImportedPullRequestDescription(args: {
  repoFullName: string;
  number: number;
  url: string;
  body?: string | null;
}) {
  return [
    `Imported from GitHub PR ${args.repoFullName}#${args.number}`,
    args.url,
    args.body?.trim() || null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const PULL_REQUEST_SUMMARY_START = '<!-- vector-github-pr-summary:start -->';
const PULL_REQUEST_SUMMARY_END = '<!-- vector-github-pr-summary:end -->';

function stripManagedPullRequestSummary(description?: string | null) {
  if (!description) {
    return '';
  }

  return description
    .replace(
      new RegExp(
        `${PULL_REQUEST_SUMMARY_START}[\\s\\S]*?${PULL_REQUEST_SUMMARY_END}`,
        'g',
      ),
      '',
    )
    .trim();
}

function stripLegacyImportedPullRequestDescription(args: {
  description?: string | null;
  legacyImportedDescriptions?: string[];
}) {
  const description = stripManagedPullRequestSummary(args.description);
  if (!description.trim().startsWith('Imported from GitHub PR ')) {
    return description.trim();
  }

  const trimmedDescription = description.trim();
  const matchingLegacyDescription = (args.legacyImportedDescriptions ?? [])
    .map(value => value.trim())
    .sort((a, b) => b.length - a.length)
    .find(value => trimmedDescription.startsWith(value));

  if (matchingLegacyDescription) {
    return trimmedDescription.slice(matchingLegacyDescription.length).trim();
  }

  return trimmedDescription
    .replace(
      /^Imported from GitHub PR [^\n]+\n+(?:https?:\/\/[^\n]+)(?:\n+)?/i,
      '',
    )
    .trim();
}

function mergeIssueDescriptionWithPullRequestSummary(args: {
  currentDescription?: string | null;
  summaryMarkdown?: string | null;
  legacyImportedDescriptions?: string[];
}) {
  const userDescription = stripLegacyImportedPullRequestDescription({
    description: args.currentDescription,
    legacyImportedDescriptions: args.legacyImportedDescriptions,
  });

  if (!args.summaryMarkdown?.trim()) {
    return userDescription.trim();
  }

  return [
    userDescription || null,
    PULL_REQUEST_SUMMARY_START,
    args.summaryMarkdown.trim(),
    PULL_REQUEST_SUMMARY_END,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

async function queueIssueDescriptionRefreshForAssistantThreads(
  ctx: MutationCtx,
  args: {
    organization: Doc<'organizations'>;
    issue: Doc<'issues'>;
    pullRequest: Doc<'githubPullRequests'>;
    repoFullName: string;
    previousImportedDescription: string;
    nextImportedDescription: string;
  },
) {
  const scopedThreads = await ctx.db
    .query('assistantThreads')
    .withIndex('by_org_context_entity', q =>
      q
        .eq('organizationId', args.organization._id)
        .eq('lastContextType', 'issue_detail')
        .eq('lastEntityKey', args.issue.key),
    )
    .collect();

  if (scopedThreads.length === 0) {
    return;
  }

  const pageContext = {
    kind: 'issue_detail' as const,
    orgSlug: args.organization.slug,
    path:
      args.issue.key.trim().length > 0
        ? `/${args.organization.slug}/issues/${args.issue.key}`
        : `/${args.organization.slug}/issues`,
    issueKey: args.issue.key,
    entityType: 'issue' as const,
    entityId: String(args.issue._id),
    entityKey: args.issue.key,
  };

  const prompt = [
    `The linked GitHub pull request ${args.repoFullName}#${args.pullRequest.number} description changed.`,
    'Update the current issue description so it reflects the latest pull request description while preserving any issue-specific context that still matters.',
    `Current issue description:\n${args.issue.description ?? '(empty)'}`,
    `Previous imported pull request description:\n${args.previousImportedDescription}`,
    `Latest imported pull request description:\n${args.nextImportedDescription}`,
    `Pull request URL: ${args.pullRequest.url}`,
  ].join('\n\n');

  for (const thread of scopedThreads) {
    if (thread.threadStatus === 'pending') {
      continue;
    }

    const saved = await saveMessage(ctx, components.agent, {
      threadId: thread.threadId,
      userId: thread.userId,
      prompt,
    });

    await ctx.db.patch('assistantThreads', thread._id, {
      updatedAt: Date.now(),
      threadStatus: 'pending',
      errorMessage: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.ai.actions.generateResponse, {
      assistantThreadId: thread._id,
      orgSlug: args.organization.slug,
      userId: thread.userId,
      threadId: thread.threadId,
      promptMessageId: saved.messageId,
      pageContext,
    });
  }
}

async function resolveOrgMemberByGitHubIdentity(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  identity: {
    githubUserId?: number | null;
    githubUsername?: string | null;
    email?: string | null;
  },
) {
  const candidateUsers: Doc<'users'>[] = [];
  const seenUserIds = new Set<string>();

  const addCandidate = (user: Doc<'users'> | null) => {
    if (!user) return;
    const key = String(user._id);
    if (seenUserIds.has(key)) return;
    seenUserIds.add(key);
    candidateUsers.push(user);
  };

  const addCandidateFromBetterAuthUser = async (authUserId: string | null) => {
    if (!authUserId) return;

    const authUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'user',
      where: [
        {
          field: '_id',
          operator: 'eq',
          value: authUserId,
        },
      ],
    });

    if (!authUser) return;

    const localUserId =
      typeof authUser.userId === 'string'
        ? ctx.db.normalizeId('users', authUser.userId)
        : null;
    if (localUserId) {
      addCandidate(await ctx.db.get('users', localUserId));
      return;
    }

    if (typeof authUser.email === 'string' && authUser.email.length > 0) {
      addCandidate(
        await ctx.db
          .query('users')
          .withIndex('email', q => q.eq('email', authUser.email))
          .first(),
      );
    }
  };

  const addCandidateFromGitHubAccountId = async (accountId: string | null) => {
    if (!accountId) return;

    const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: 'account',
      where: [
        {
          field: 'providerId',
          operator: 'eq',
          value: 'github',
        },
        {
          field: 'accountId',
          operator: 'eq',
          value: accountId,
        },
      ],
    });

    await addCandidateFromBetterAuthUser(account?.userId ?? null);
  };

  if (typeof identity.githubUserId === 'number') {
    addCandidate(
      await ctx.db
        .query('users')
        .withIndex('by_github_user_id', q =>
          q.eq('githubUserId', identity.githubUserId!),
        )
        .first(),
    );

    if (candidateUsers.length === 0) {
      await addCandidateFromGitHubAccountId(String(identity.githubUserId));
    }
  }

  if (identity.githubUsername) {
    addCandidate(
      await ctx.db
        .query('users')
        .withIndex('by_github_username', q =>
          q.eq('githubUsername', identity.githubUsername!),
        )
        .first(),
    );

    if (candidateUsers.length === 0) {
      await addCandidateFromGitHubAccountId(identity.githubUsername);
    }
  }

  if (identity.email) {
    addCandidate(
      await ctx.db
        .query('users')
        .withIndex('email', q => q.eq('email', identity.email!))
        .first(),
    );
  }

  for (const candidate of candidateUsers) {
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', organizationId).eq('userId', candidate._id),
      )
      .first();
    if (!membership) continue;

    if (
      (identity.githubUserId &&
        candidate.githubUserId !== identity.githubUserId) ||
      (identity.githubUsername &&
        candidate.githubUsername !== identity.githubUsername)
    ) {
      await ctx.db.patch('users', candidate._id, {
        githubUserId:
          identity.githubUserId ?? candidate.githubUserId ?? undefined,
        githubUsername:
          identity.githubUsername ?? candidate.githubUsername ?? undefined,
      });
    }

    return candidate;
  }

  return null;
}

async function recordGithubLinkActivity(
  ctx: MutationCtx,
  issue: Doc<'issues'>,
  actorId: Id<'users'> | undefined,
  eventType:
    | 'issue_github_artifact_linked'
    | 'issue_github_artifact_unlinked'
    | 'issue_github_artifact_suppressed'
    | 'issue_github_artifact_status_changed',
  toLabel: string,
) {
  if (!actorId) return;
  await recordActivity(ctx, {
    scope: resolveIssueScope(issue),
    actorId,
    entityType: 'issue',
    eventType,
    details: {
      toLabel,
    },
    snapshot: snapshotForIssue(issue),
  });
}

async function applyWorkflowAutomationForIssue(
  ctx: MutationCtx,
  issueId: Id<'issues'>,
) {
  const issue = await ctx.db.get('issues', issueId);
  if (!issue) return;

  const links = await ctx.db
    .query('githubArtifactLinks')
    .withIndex('by_issue_active', q =>
      q.eq('issueId', issueId).eq('active', true),
    )
    .collect();

  const pullRequests = await Promise.all(
    links
      .map(link => link.pullRequestId)
      .filter((id): id is Id<'githubPullRequests'> => Boolean(id))
      .map(id => ctx.db.get('githubPullRequests', id)),
  ).then(items =>
    items.filter((item): item is NonNullable<typeof item> => item !== null),
  );
  const githubIssues = await Promise.all(
    links
      .map(link => link.githubIssueId)
      .filter((id): id is Id<'githubIssues'> => Boolean(id))
      .map(id => ctx.db.get('githubIssues', id)),
  ).then(items =>
    items.filter((item): item is NonNullable<typeof item> => item !== null),
  );

  const targetType =
    selectWorkflowTypeFromPullRequests(pullRequests.map(pr => pr.state)) ??
    selectWorkflowTypeFromGitHubIssues(githubIssues.map(pr => pr.state));

  if (!targetType) {
    return;
  }

  const nextStateId = await getIssueStateIdByType(
    ctx,
    issue.organizationId,
    targetType,
  );

  if (!nextStateId) {
    return;
  }

  const previousState = issue.workflowStateId
    ? await ctx.db.get('issueStates', issue.workflowStateId)
    : null;
  const nextState = await ctx.db.get('issueStates', nextStateId);
  const assignments = await ctx.db
    .query('issueAssignees')
    .withIndex('by_issue', q => q.eq('issueId', issueId))
    .collect();
  const nextClosedAt =
    targetType === 'done' || targetType === 'canceled' ? Date.now() : undefined;
  const issueNeedsPatch =
    issue.workflowStateId !== nextStateId ||
    (targetType === 'done' || targetType === 'canceled'
      ? issue.closedAt === undefined
      : issue.closedAt !== undefined);
  const assignmentsOutOfSync =
    assignments.length === 0 ||
    assignments.some(assignment => assignment.stateId !== nextStateId);

  if (!issueNeedsPatch && !assignmentsOutOfSync) {
    return;
  }

  if (issueNeedsPatch) {
    await ctx.db.patch('issues', issueId, {
      workflowStateId: nextStateId,
      closedAt: nextClosedAt,
    });
  }

  if (assignmentsOutOfSync && assignments.length === 0) {
    await ctx.db.insert('issueAssignees', {
      issueId,
      assigneeId: undefined,
      stateId: nextStateId,
    });
  } else if (assignmentsOutOfSync) {
    for (const assignment of assignments) {
      if (assignment.stateId === nextStateId) continue;
      await ctx.db.patch('issueAssignees', assignment._id, {
        stateId: nextStateId,
      });
    }
  }

  const actorId = issue.createdBy ?? issue.reporterId ?? undefined;
  if (issueNeedsPatch && actorId && nextState) {
    await recordActivity(ctx, {
      scope: resolveIssueScope(issue),
      actorId,
      entityType: 'issue',
      eventType: 'issue_workflow_state_changed',
      details: {
        field: 'workflow_state',
        fromId: issue.workflowStateId,
        fromLabel: previousState?.name,
        toId: nextState._id,
        toLabel: nextState.name,
      },
      snapshot: snapshotForIssue(issue),
    });
  }
}

async function autoAssignFromGitHubLogins(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  issueId: Id<'issues'>,
  identities: Array<{
    githubUserId?: number | null;
    githubUsername?: string | null;
    email?: string | null;
  }>,
) {
  if (identities.length === 0) return;

  const issue = await ctx.db.get('issues', issueId);
  if (!issue) return;

  const defaultState = await getDefaultAssignmentState(ctx, organizationId);
  if (!defaultState) return;

  const existingAssignments = await ctx.db
    .query('issueAssignees')
    .withIndex('by_issue', q => q.eq('issueId', issueId))
    .collect();

  for (const identity of identities) {
    const vectorUser = await resolveOrgMemberByGitHubIdentity(
      ctx,
      organizationId,
      identity,
    );
    if (!vectorUser) continue;

    // Check not already assigned
    const existingAssignment = existingAssignments.find(
      assignment => assignment.assigneeId === vectorUser._id,
    );
    if (existingAssignment) {
      if (existingAssignment.stateId !== defaultState._id) {
        await ctx.db.patch('issueAssignees', existingAssignment._id, {
          stateId: defaultState._id,
        });
      }
      continue;
    }

    const unassignedAssignment = existingAssignments.find(
      assignment => !assignment.assigneeId,
    );
    if (unassignedAssignment) {
      await ctx.db.patch('issueAssignees', unassignedAssignment._id, {
        assigneeId: vectorUser._id,
        stateId: defaultState._id,
      });
      unassignedAssignment.assigneeId = vectorUser._id;
      unassignedAssignment.stateId = defaultState._id;
    } else {
      const assignmentId = await ctx.db.insert('issueAssignees', {
        issueId,
        assigneeId: vectorUser._id,
        stateId: defaultState._id,
      });
      existingAssignments.push({
        _id: assignmentId,
        _creationTime: Date.now(),
        issueId,
        assigneeId: vectorUser._id,
        stateId: defaultState._id,
      } as Doc<'issueAssignees'>);
    }

    // Record activity
    const actorId = issue.createdBy ?? issue.reporterId ?? undefined;
    if (actorId) {
      await recordActivity(ctx, {
        scope: resolveIssueScope(issue),
        actorId,
        entityType: 'issue',
        eventType: 'issue_assignees_changed',
        details: {
          addedUserNames: [
            vectorUser.name ??
              identity.githubUsername ??
              identity.email ??
              'GitHub user',
          ],
          removedUserNames: [],
        },
        snapshot: snapshotForIssue(issue),
      });
    }
  }
}

/**
 * Auto-assign Vector users to an issue based on the linked PR's author and assignees.
 * Only assigns users who have linked their GitHub account and are org members.
 */
async function autoAssignFromPullRequest(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  issueId: Id<'issues'>,
  pullRequestId: Id<'githubPullRequests'>,
) {
  const pr = await ctx.db.get('githubPullRequests', pullRequestId);
  if (!pr) return;

  const identities: Array<{
    githubUserId?: number | null;
    githubUsername?: string | null;
  }> = [];
  const seenIdentities = new Set<string>();

  const pushIdentity = (identity: {
    githubUserId?: number | null;
    githubUsername?: string | null;
  }) => {
    const key = `${identity.githubUserId ?? 'none'}:${identity.githubUsername ?? 'none'}`;
    if (seenIdentities.has(key)) return;
    seenIdentities.add(key);
    identities.push(identity);
  };

  if (pr.assigneeLogins || pr.assigneeGitHubUserIds) {
    const count = Math.max(
      pr.assigneeLogins?.length ?? 0,
      pr.assigneeGitHubUserIds?.length ?? 0,
    );
    for (let index = 0; index < count; index += 1) {
      pushIdentity({
        githubUserId: pr.assigneeGitHubUserIds?.[index] ?? null,
        githubUsername: pr.assigneeLogins?.[index] ?? null,
      });
    }
  }
  if (pr.authorLogin || pr.authorGitHubUserId) {
    pushIdentity({
      githubUserId: pr.authorGitHubUserId ?? null,
      githubUsername: pr.authorLogin ?? null,
    });
  }

  await autoAssignFromGitHubLogins(ctx, organizationId, issueId, identities);
}

async function autoAssignFromGitHubIssue(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  issueId: Id<'issues'>,
  githubIssueId: Id<'githubIssues'>,
) {
  const githubIssue = await ctx.db.get('githubIssues', githubIssueId);
  if (!githubIssue) return;

  const identities: Array<{
    githubUserId?: number | null;
    githubUsername?: string | null;
  }> = [];
  const seenIdentities = new Set<string>();

  const pushIdentity = (identity: {
    githubUserId?: number | null;
    githubUsername?: string | null;
  }) => {
    const key = `${identity.githubUserId ?? 'none'}:${identity.githubUsername ?? 'none'}`;
    if (seenIdentities.has(key)) return;
    seenIdentities.add(key);
    identities.push(identity);
  };

  if (githubIssue.assigneeLogins || githubIssue.assigneeGitHubUserIds) {
    const count = Math.max(
      githubIssue.assigneeLogins?.length ?? 0,
      githubIssue.assigneeGitHubUserIds?.length ?? 0,
    );
    for (let index = 0; index < count; index += 1) {
      pushIdentity({
        githubUserId: githubIssue.assigneeGitHubUserIds?.[index] ?? null,
        githubUsername: githubIssue.assigneeLogins?.[index] ?? null,
      });
    }
  }
  if (githubIssue.authorLogin || githubIssue.authorGitHubUserId) {
    pushIdentity({
      githubUserId: githubIssue.authorGitHubUserId ?? null,
      githubUsername: githubIssue.authorLogin ?? null,
    });
  }

  await autoAssignFromGitHubLogins(ctx, organizationId, issueId, identities);
}

async function syncArtifactLinksForIssues(args: {
  ctx: MutationCtx;
  organizationId: Id<'organizations'>;
  artifactType: GitHubArtifactType;
  artifactId:
    | Id<'githubPullRequests'>
    | Id<'githubIssues'>
    | Id<'githubCommits'>;
  repoFullName: string;
  identifier: string | number;
  issueKeys: string[];
  source: 'auto' | 'manual';
  actorId?: Id<'users'>;
}) {
  const {
    ctx,
    organizationId,
    artifactType,
    artifactId,
    repoFullName,
    identifier,
  } = args;
  const externalKey = buildArtifactExternalKey(
    artifactType,
    repoFullName,
    identifier,
  );

  const issueIds = await Promise.all(
    Array.from(new Set(args.issueKeys.map(normalizeIssueKey))).map(
      async key => {
        const issue = await ctx.db
          .query('issues')
          .withIndex('by_org_key', q =>
            q.eq('organizationId', organizationId).eq('key', key),
          )
          .first();
        return issue?._id ?? null;
      },
    ),
  ).then(ids => ids.filter((id): id is Id<'issues'> => id !== null));

  const existingLinks = await (artifactType === 'pull_request'
    ? ctx.db
        .query('githubArtifactLinks')
        .withIndex('by_pr', q =>
          q.eq('pullRequestId', artifactId as Id<'githubPullRequests'>),
        )
        .collect()
    : artifactType === 'issue'
      ? ctx.db
          .query('githubArtifactLinks')
          .withIndex('by_gh_issue', q =>
            q.eq('githubIssueId', artifactId as Id<'githubIssues'>),
          )
          .collect()
      : ctx.db
          .query('githubArtifactLinks')
          .withIndex('by_commit', q =>
            q.eq('commitId', artifactId as Id<'githubCommits'>),
          )
          .collect());

  let targetIssueIds: Id<'issues'>[] = [];
  if (
    args.source === 'auto' &&
    issueIds.length === 0 &&
    existingLinks.some(link => link.active)
  ) {
    targetIssueIds = Array.from(
      new Set(
        existingLinks.filter(link => link.active).map(link => link.issueId),
      ),
    );
  } else {
    for (const issueId of issueIds) {
      const suppression = await ctx.db
        .query('githubArtifactSuppressions')
        .withIndex('by_issue_external', q =>
          q
            .eq('issueId', issueId)
            .eq('artifactType', artifactType)
            .eq('externalKey', externalKey),
        )
        .first();
      if (!suppression) {
        targetIssueIds.push(issueId);
      }
    }
  }

  const targetSet = new Set(targetIssueIds.map(String));
  for (const link of existingLinks) {
    if (link.source !== 'auto') continue;
    if (targetSet.has(String(link.issueId))) continue;
    if (link.active) {
      await ctx.db.patch('githubArtifactLinks', link._id, {
        active: false,
        updatedAt: Date.now(),
      });
    }
  }

  for (const issueId of targetIssueIds) {
    const existing = existingLinks.find(link => link.issueId === issueId);
    if (existing) {
      if (!existing.active) {
        await ctx.db.patch('githubArtifactLinks', existing._id, {
          active: true,
          updatedAt: Date.now(),
        });
      }
    } else {
      await ctx.db.insert('githubArtifactLinks', {
        organizationId,
        issueId,
        artifactType,
        pullRequestId:
          artifactType === 'pull_request'
            ? (artifactId as Id<'githubPullRequests'>)
            : undefined,
        githubIssueId:
          artifactType === 'issue'
            ? (artifactId as Id<'githubIssues'>)
            : undefined,
        commitId:
          artifactType === 'commit'
            ? (artifactId as Id<'githubCommits'>)
            : undefined,
        source: args.source,
        active: true,
        matchReason: externalKey,
        createdBy: args.actorId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  // Auto-assign users from PR author/assignees when linking pull requests
  if (artifactType === 'pull_request') {
    for (const issueId of targetIssueIds) {
      await autoAssignFromPullRequest(
        ctx,
        organizationId,
        issueId,
        artifactId as Id<'githubPullRequests'>,
      );
    }
  }

  if (artifactType === 'issue') {
    for (const issueId of targetIssueIds) {
      await autoAssignFromGitHubIssue(
        ctx,
        organizationId,
        issueId,
        artifactId as Id<'githubIssues'>,
      );
    }
  }

  const affectedIssueIds = new Set([
    ...existingLinks.map(link => link.issueId),
    ...targetIssueIds,
  ]);

  for (const issueId of affectedIssueIds) {
    await applyWorkflowAutomationForIssue(ctx, issueId);
  }

  if (artifactType === 'pull_request') {
    for (const issueId of affectedIssueIds) {
      await ctx.scheduler.runAfter(
        0,
        internal.github.actions.refreshIssuePullRequestSummary,
        {
          organizationId,
          issueId,
        },
      );
    }
  }
}

export const upsertInstallationConnection = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    connectionMode: v.union(
      v.literal('app'),
      v.literal('token'),
      v.literal('hybrid'),
    ),
    installationId: v.optional(v.number()),
    installationAccountLogin: v.optional(v.string()),
    installationAccountType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const integration = await getOrCreateIntegration(ctx, args.organizationId);
    await ctx.db.patch('githubIntegrations', integration!._id, {
      connectionMode: args.connectionMode,
      installationId: args.installationId,
      installationAccountLogin: args.installationAccountLogin,
      installationAccountType: args.installationAccountType,
      connectedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return integration!._id;
  },
});

export const setWebhookSecret = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    encryptedWebhookSecret: v.optional(v.string()),
    webhookSecretFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const integration = await getOrCreateIntegration(ctx, args.organizationId);
    await ctx.db.patch('githubIntegrations', integration!._id, {
      connectionMode:
        integration!.installationId || integration!.encryptedToken
          ? integration!.connectionMode
          : 'webhook',
      encryptedWebhookSecret: args.encryptedWebhookSecret,
      webhookSecretFingerprint: args.webhookSecretFingerprint,
      webhookSecretLastUpdatedAt: args.encryptedWebhookSecret
        ? Date.now()
        : undefined,
      updatedAt: Date.now(),
    });
    return integration!._id;
  },
});

export const setAutoLinkEnabled = mutation({
  args: {
    orgSlug: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    await requireOrgPermission(ctx, org._id, PERMISSIONS.ORG_MANAGE_SETTINGS);

    const integration = await getOrCreateIntegration(ctx, org._id);
    await ctx.db.patch('githubIntegrations', integration!._id, {
      autoLinkEnabled: args.enabled,
      updatedAt: Date.now(),
    });

    return { success: true, actorId: userId } as const;
  },
});

export const setEncryptedToken = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    encryptedToken: v.optional(v.string()),
    tokenFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const integration = await getOrCreateIntegration(ctx, args.organizationId);
    await ctx.db.patch('githubIntegrations', integration!._id, {
      connectionMode: integration!.installationId ? 'hybrid' : 'token',
      encryptedToken: args.encryptedToken,
      tokenFingerprint: args.tokenFingerprint,
      tokenLastUpdatedAt: args.encryptedToken ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return integration!._id;
  },
});

export const upsertWebhookRepository = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    githubRepoId: v.number(),
    nodeId: v.optional(v.string()),
    owner: v.string(),
    name: v.string(),
    fullName: v.string(),
    defaultBranch: v.optional(v.string()),
    private: v.boolean(),
    lastPushedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const integration = await getOrCreateIntegration(ctx, args.organizationId);
    const existing = await ctx.db
      .query('githubRepositories')
      .withIndex('by_org_repo', q =>
        q
          .eq('organizationId', args.organizationId)
          .eq('githubRepoId', args.githubRepoId),
      )
      .first();

    const patch = {
      integrationId: integration!._id,
      nodeId: args.nodeId,
      owner: args.owner,
      name: args.name,
      fullName: args.fullName,
      defaultBranch: args.defaultBranch,
      private: args.private,
      installationAccessible: true,
      selected: true,
      lastPushedAt: args.lastPushedAt,
      lastSyncedAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch('githubRepositories', existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert('githubRepositories', {
      organizationId: args.organizationId,
      githubRepoId: args.githubRepoId,
      ...patch,
    });
  },
});

export const replaceRepositories = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    repositories: v.array(
      v.object({
        githubRepoId: v.number(),
        nodeId: v.optional(v.string()),
        owner: v.string(),
        name: v.string(),
        fullName: v.string(),
        defaultBranch: v.optional(v.string()),
        private: v.boolean(),
        installationAccessible: v.boolean(),
        lastPushedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const integration = await getOrCreateIntegration(ctx, args.organizationId);
    const existing = await ctx.db
      .query('githubRepositories')
      .withIndex('by_integration', q => q.eq('integrationId', integration!._id))
      .collect();

    for (const repo of args.repositories) {
      const current = existing.find(
        item => item.githubRepoId === repo.githubRepoId,
      );
      if (current) {
        await ctx.db.patch('githubRepositories', current._id, {
          ...repo,
          updatedAt: Date.now(),
          lastSyncedAt: Date.now(),
        });
      } else {
        await ctx.db.insert('githubRepositories', {
          organizationId: args.organizationId,
          integrationId: integration!._id,
          ...repo,
          selected: false,
          updatedAt: Date.now(),
          lastSyncedAt: Date.now(),
        });
      }
    }

    const incomingRepoIds = new Set(
      args.repositories.map(repo => repo.githubRepoId),
    );
    for (const repo of existing) {
      if (incomingRepoIds.has(repo.githubRepoId)) continue;
      await ctx.db.patch('githubRepositories', repo._id, {
        installationAccessible: false,
        selected: false,
        updatedAt: Date.now(),
      });
    }
  },
});

export const toggleRepositorySelection = mutation({
  args: {
    orgSlug: v.string(),
    repositoryId: v.id('githubRepositories'),
    selected: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    await requireOrgPermission(ctx, org._id, PERMISSIONS.ORG_MANAGE_SETTINGS);

    const repository = await ctx.db.get(
      'githubRepositories',
      args.repositoryId,
    );
    if (!repository || repository.organizationId !== org._id) {
      throw new ConvexError('REPOSITORY_NOT_FOUND');
    }

    await ctx.db.patch('githubRepositories', repository._id, {
      selected: args.selected,
      updatedAt: Date.now(),
    });

    return { success: true, actorId: userId } as const;
  },
});

export const upsertPullRequest = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    repositoryId: v.id('githubRepositories'),
    githubPullRequestId: v.number(),
    nodeId: v.optional(v.string()),
    number: v.number(),
    title: v.string(),
    body: v.optional(v.string()),
    url: v.string(),
    state: v.union(
      v.literal('draft'),
      v.literal('open'),
      v.literal('closed'),
      v.literal('merged'),
    ),
    isDraft: v.boolean(),
    headRefName: v.optional(v.string()),
    baseRefName: v.optional(v.string()),
    authorGitHubUserId: v.optional(v.number()),
    authorLogin: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
    assigneeGitHubUserIds: v.optional(v.array(v.number())),
    assigneeLogins: v.optional(v.array(v.string())),
    mergedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('githubPullRequests')
      .withIndex('by_org_external', q =>
        q
          .eq('organizationId', args.organizationId)
          .eq('githubPullRequestId', args.githubPullRequestId),
      )
      .first();

    if (existing) {
      const previousTitle = existing.title;
      const previousBody = existing.body ?? undefined;
      await ctx.db.patch('githubPullRequests', existing._id, {
        ...args,
        lastSyncedAt: Date.now(),
      });
      return {
        pullRequestId: existing._id,
        previousTitle,
        previousBody,
      } as const;
    }

    const pullRequestId = await ctx.db.insert('githubPullRequests', {
      ...args,
      lastSyncedAt: Date.now(),
    });
    return {
      pullRequestId,
      previousTitle: undefined,
      previousBody: undefined,
    } as const;
  },
});

export const upsertGitHubIssue = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    repositoryId: v.id('githubRepositories'),
    githubIssueId: v.number(),
    nodeId: v.optional(v.string()),
    number: v.number(),
    title: v.string(),
    body: v.optional(v.string()),
    url: v.string(),
    state: v.union(v.literal('open'), v.literal('closed')),
    authorGitHubUserId: v.optional(v.number()),
    authorLogin: v.optional(v.string()),
    authorAvatarUrl: v.optional(v.string()),
    assigneeGitHubUserIds: v.optional(v.array(v.number())),
    assigneeLogins: v.optional(v.array(v.string())),
    closedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('githubIssues')
      .withIndex('by_org_external', q =>
        q
          .eq('organizationId', args.organizationId)
          .eq('githubIssueId', args.githubIssueId),
      )
      .first();

    if (existing) {
      await ctx.db.patch('githubIssues', existing._id, {
        ...args,
        lastSyncedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert('githubIssues', {
      ...args,
      lastSyncedAt: Date.now(),
    });
  },
});

export const upsertCommit = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    repositoryId: v.id('githubRepositories'),
    sha: v.string(),
    shortSha: v.string(),
    messageHeadline: v.string(),
    messageBody: v.optional(v.string()),
    url: v.string(),
    authorName: v.optional(v.string()),
    authorEmail: v.optional(v.string()),
    committedAt: v.optional(v.number()),
    authoredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('githubCommits')
      .withIndex('by_org_sha', q =>
        q.eq('organizationId', args.organizationId).eq('sha', args.sha),
      )
      .first();

    if (existing) {
      await ctx.db.patch('githubCommits', existing._id, {
        ...args,
        lastSyncedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert('githubCommits', {
      ...args,
      lastSyncedAt: Date.now(),
    });
  },
});

export const syncPullRequestLinks = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    pullRequestId: v.id('githubPullRequests'),
    repoFullName: v.string(),
    number: v.number(),
    issueKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await syncArtifactLinksForIssues({
      ctx,
      organizationId: args.organizationId,
      artifactType: 'pull_request',
      artifactId: args.pullRequestId,
      repoFullName: args.repoFullName,
      identifier: args.number,
      issueKeys: args.issueKeys,
      source: 'auto',
    });
  },
});

export const syncLinkedIssueContentFromPullRequest = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    pullRequestId: v.id('githubPullRequests'),
    repoFullName: v.string(),
    previousTitle: v.optional(v.string()),
    previousBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [organization, pullRequest] = await Promise.all([
      ctx.db.get('organizations', args.organizationId),
      ctx.db.get('githubPullRequests', args.pullRequestId),
    ]);
    if (!organization || !pullRequest) {
      throw new ConvexError('PULL_REQUEST_NOT_FOUND');
    }

    const links = await ctx.db
      .query('githubArtifactLinks')
      .withIndex('by_pr', q => q.eq('pullRequestId', args.pullRequestId))
      .collect();

    for (const link of links) {
      if (!link.active) continue;
      const issue = await ctx.db.get('issues', link.issueId);
      if (!issue || issue.organizationId !== args.organizationId) continue;

      const patch: Partial<Doc<'issues'>> = {};
      if (args.previousTitle && issue.title === args.previousTitle) {
        patch.title = pullRequest.title;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch('issues', issue._id, {
          ...patch,
          searchText: buildIssueSearchText({
            key: issue.key,
            title: patch.title ?? issue.title,
            description:
              patch.description !== undefined
                ? patch.description
                : (issue.description ?? ''),
          }),
        });
      }

      await ctx.scheduler.runAfter(
        0,
        internal.github.actions.refreshIssuePullRequestSummary,
        {
          organizationId: args.organizationId,
          issueId: issue._id,
        },
      );

      await queueIssueDescriptionRefreshForAssistantThreads(ctx, {
        organization,
        issue: Object.keys(patch).length
          ? ({ ...issue, ...patch } as Doc<'issues'>)
          : issue,
        pullRequest,
        repoFullName: args.repoFullName,
        previousImportedDescription: buildImportedPullRequestDescription({
          repoFullName: args.repoFullName,
          number: pullRequest.number,
          url: pullRequest.url,
          body: args.previousBody ?? undefined,
        }),
        nextImportedDescription: buildImportedPullRequestDescription({
          repoFullName: args.repoFullName,
          number: pullRequest.number,
          url: pullRequest.url,
          body: pullRequest.body ?? undefined,
        }),
      });
    }
  },
});

export const applyPullRequestSummaryToIssue = internalMutation({
  args: {
    issueId: v.id('issues'),
    legacyImportedDescriptions: v.optional(v.array(v.string())),
    summaryMarkdown: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue) {
      return { updated: false } as const;
    }

    const description = mergeIssueDescriptionWithPullRequestSummary({
      currentDescription: issue.description,
      legacyImportedDescriptions: args.legacyImportedDescriptions,
      summaryMarkdown: args.summaryMarkdown,
    });

    if (description === (issue.description ?? '')) {
      return { updated: false } as const;
    }

    await ctx.db.patch('issues', issue._id, {
      description: description || undefined,
      searchText: buildIssueSearchText({
        key: issue.key,
        title: issue.title,
        description,
      }),
    });

    return { updated: true } as const;
  },
});

export const createIssueFromPullRequestIfNeeded = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    pullRequestId: v.id('githubPullRequests'),
  },
  handler: async (ctx, args) => {
    const integration = await getOrCreateIntegration(ctx, args.organizationId);
    if (integration?.autoLinkEnabled === false) {
      return { created: false } as const;
    }

    const existingLinks = await ctx.db
      .query('githubArtifactLinks')
      .withIndex('by_pr', q => q.eq('pullRequestId', args.pullRequestId))
      .collect();
    if (existingLinks.some(link => link.active)) {
      return { created: false } as const;
    }

    const [organization, pullRequest] = await Promise.all([
      ctx.db.get('organizations', args.organizationId),
      ctx.db.get('githubPullRequests', args.pullRequestId),
    ]);
    if (!organization || !pullRequest) {
      throw new ConvexError('PULL_REQUEST_NOT_FOUND');
    }

    const repository = await ctx.db.get(
      'githubRepositories',
      pullRequest.repositoryId,
    );
    if (!repository) {
      throw new ConvexError('REPOSITORY_NOT_CONNECTED');
    }

    const defaultState = await getDefaultAssignmentState(
      ctx,
      args.organizationId,
    );

    const linkedUser = await resolveOrgMemberByGitHubIdentity(
      ctx,
      args.organizationId,
      {
        githubUserId: pullRequest.authorGitHubUserId ?? null,
        githubUsername: pullRequest.authorLogin ?? null,
      },
    );

    const nextNumber =
      (
        await ctx.db
          .query('issues')
          .withIndex('by_organization', q =>
            q.eq('organizationId', args.organizationId),
          )
          .collect()
      ).length + 1;
    const issueKey = `${organization.slug.toUpperCase()}-${nextNumber}`;
    const title =
      pullRequest.title.trim() ||
      `${repository.fullName}#${pullRequest.number}`;
    const description = buildImportedPullRequestDescription({
      repoFullName: repository.fullName,
      number: pullRequest.number,
      url: pullRequest.url,
      body: pullRequest.body ?? undefined,
    });

    const issueId = await ctx.db.insert('issues', {
      organizationId: args.organizationId,
      key: issueKey,
      sequenceNumber: nextNumber,
      title,
      description,
      searchText: buildIssueSearchText({
        key: issueKey,
        title,
        description,
      }),
      workflowStateId: defaultState?._id,
      reporterId: linkedUser?._id,
      visibility: 'organization',
      createdBy: linkedUser?._id,
    });

    if (defaultState) {
      await ctx.db.insert('issueAssignees', {
        issueId,
        assigneeId: linkedUser?._id,
        stateId: defaultState._id,
      });
    }

    const createdIssue = await ctx.db.get('issues', issueId);
    if (createdIssue && linkedUser?._id) {
      await recordActivity(ctx, {
        scope: resolveIssueScope(createdIssue),
        actorId: linkedUser._id,
        entityType: 'issue',
        eventType: 'issue_created',
        snapshot: snapshotForIssue(createdIssue),
      });
    }

    await syncArtifactLinksForIssues({
      ctx,
      organizationId: args.organizationId,
      artifactType: 'pull_request',
      artifactId: args.pullRequestId,
      repoFullName: repository.fullName,
      identifier: pullRequest.number,
      issueKeys: [issueKey],
      source: 'auto',
      actorId: linkedUser?._id,
    });

    return {
      created: true,
      issueId,
      issueKey,
    } as const;
  },
});

export const syncGitHubIssueLinks = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    githubIssueId: v.id('githubIssues'),
    repoFullName: v.string(),
    number: v.number(),
    issueKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await syncArtifactLinksForIssues({
      ctx,
      organizationId: args.organizationId,
      artifactType: 'issue',
      artifactId: args.githubIssueId,
      repoFullName: args.repoFullName,
      identifier: args.number,
      issueKeys: args.issueKeys,
      source: 'auto',
    });
  },
});

export const syncCommitLinks = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    commitId: v.id('githubCommits'),
    repoFullName: v.string(),
    sha: v.string(),
    issueKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await syncArtifactLinksForIssues({
      ctx,
      organizationId: args.organizationId,
      artifactType: 'commit',
      artifactId: args.commitId,
      repoFullName: args.repoFullName,
      identifier: args.sha,
      issueKeys: args.issueKeys,
      source: 'auto',
    });
  },
});

export const linkPullRequestManually = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
    pullRequestId: v.id('githubPullRequests'),
    repoFullName: v.string(),
    number: v.number(),
    actorId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue || issue.organizationId !== args.organizationId) {
      throw new ConvexError('ISSUE_NOT_FOUND');
    }
    await syncArtifactLinksForIssues({
      ctx,
      organizationId: args.organizationId,
      artifactType: 'pull_request',
      artifactId: args.pullRequestId,
      repoFullName: args.repoFullName,
      identifier: args.number,
      issueKeys: [issue.key],
      source: 'manual',
      actorId: args.actorId,
    });
    await recordGithubLinkActivity(
      ctx,
      issue,
      args.actorId,
      'issue_github_artifact_linked',
      `${args.repoFullName}#${args.number}`,
    );
  },
});

export const linkGitHubIssueManually = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
    githubIssueId: v.id('githubIssues'),
    repoFullName: v.string(),
    number: v.number(),
    actorId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue || issue.organizationId !== args.organizationId) {
      throw new ConvexError('ISSUE_NOT_FOUND');
    }
    await syncArtifactLinksForIssues({
      ctx,
      organizationId: args.organizationId,
      artifactType: 'issue',
      artifactId: args.githubIssueId,
      repoFullName: args.repoFullName,
      identifier: args.number,
      issueKeys: [issue.key],
      source: 'manual',
      actorId: args.actorId,
    });
    await recordGithubLinkActivity(
      ctx,
      issue,
      args.actorId,
      'issue_github_artifact_linked',
      `${args.repoFullName}#${args.number}`,
    );
  },
});

export const linkCommitManually = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
    commitId: v.id('githubCommits'),
    repoFullName: v.string(),
    sha: v.string(),
    actorId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue || issue.organizationId !== args.organizationId) {
      throw new ConvexError('ISSUE_NOT_FOUND');
    }
    await syncArtifactLinksForIssues({
      ctx,
      organizationId: args.organizationId,
      artifactType: 'commit',
      artifactId: args.commitId,
      repoFullName: args.repoFullName,
      identifier: args.sha,
      issueKeys: [issue.key],
      source: 'manual',
      actorId: args.actorId,
    });
    await recordGithubLinkActivity(
      ctx,
      issue,
      args.actorId,
      'issue_github_artifact_linked',
      `${args.repoFullName}@${args.sha.slice(0, 7)}`,
    );
  },
});

export const upsertSyncHealth = internalMutation({
  args: {
    organizationId: v.id('organizations'),
    lastWebhookAt: v.optional(v.number()),
    lastWebhookEvent: v.optional(v.string()),
    lastReconciledAt: v.optional(v.number()),
    lastSyncFailureAt: v.optional(v.number()),
    lastSyncFailureMessage: v.optional(v.string()),
    clearFailure: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const integration = await getOrCreateIntegration(ctx, args.organizationId);
    const patch: Partial<Doc<'githubIntegrations'>> = {
      updatedAt: Date.now(),
    };

    if (args.lastWebhookAt !== undefined) {
      patch.lastWebhookAt = args.lastWebhookAt;
    }
    if (args.lastWebhookEvent !== undefined) {
      patch.lastWebhookEvent = args.lastWebhookEvent;
    }
    if (args.lastReconciledAt !== undefined) {
      patch.lastReconciledAt = args.lastReconciledAt;
    }
    if (args.lastSyncFailureAt !== undefined) {
      patch.lastSyncFailureAt = args.lastSyncFailureAt;
      patch.appWebhookStatus = 'failing';
    }
    if (args.lastSyncFailureMessage !== undefined) {
      patch.lastSyncFailureMessage = args.lastSyncFailureMessage;
      patch.appWebhookStatus = 'failing';
    }
    if (args.clearFailure) {
      patch.lastSyncFailureAt = undefined;
      patch.lastSyncFailureMessage = undefined;
      patch.appWebhookStatus = 'active';
    }

    await ctx.db.patch('githubIntegrations', integration!._id, patch);
  },
});

export const unlinkArtifact = mutation({
  args: {
    linkId: v.id('githubArtifactLinks'),
    suppress: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    const link = await ctx.db.get('githubArtifactLinks', args.linkId);
    if (!link) {
      throw new ConvexError('LINK_NOT_FOUND');
    }

    const issue = await ctx.db.get('issues', link.issueId);
    if (!issue) {
      throw new ConvexError('ISSUE_NOT_FOUND');
    }
    if (!(await canEditIssue(ctx, issue))) {
      throw new ConvexError('FORBIDDEN');
    }

    await ctx.db.patch('githubArtifactLinks', link._id, {
      active: false,
      updatedAt: Date.now(),
    });

    let suppressionId: Id<'githubArtifactSuppressions'> | null = null;
    if (args.suppress) {
      let externalKey: string | null = null;
      if (link.pullRequestId) {
        const pr = await ctx.db.get('githubPullRequests', link.pullRequestId);
        const repo = pr
          ? await ctx.db.get('githubRepositories', pr.repositoryId)
          : null;
        if (pr && repo) {
          externalKey = buildArtifactExternalKey(
            'pull_request',
            repo.fullName,
            pr.number,
          );
        }
      } else if (link.githubIssueId) {
        const ghIssue = await ctx.db.get('githubIssues', link.githubIssueId);
        const repo = ghIssue
          ? await ctx.db.get('githubRepositories', ghIssue.repositoryId)
          : null;
        if (ghIssue && repo) {
          externalKey = buildArtifactExternalKey(
            'issue',
            repo.fullName,
            ghIssue.number,
          );
        }
      } else if (link.commitId) {
        const commit = await ctx.db.get('githubCommits', link.commitId);
        const repo = commit
          ? await ctx.db.get('githubRepositories', commit.repositoryId)
          : null;
        if (commit && repo) {
          externalKey = buildArtifactExternalKey(
            'commit',
            repo.fullName,
            commit.sha,
          );
        }
      }

      if (externalKey) {
        const existingSuppression = await ctx.db
          .query('githubArtifactSuppressions')
          .withIndex('by_issue_external', q =>
            q
              .eq('issueId', issue._id)
              .eq('artifactType', link.artifactType)
              .eq('externalKey', externalKey),
          )
          .first();
        suppressionId =
          existingSuppression?._id ??
          (await ctx.db.insert('githubArtifactSuppressions', {
            organizationId: issue.organizationId,
            issueId: issue._id,
            artifactType: link.artifactType,
            externalKey,
            reason: 'manual_suppress',
            createdBy: userId,
            createdAt: Date.now(),
          }));
      }
    }

    await recordGithubLinkActivity(
      ctx,
      issue,
      userId,
      args.suppress
        ? 'issue_github_artifact_suppressed'
        : 'issue_github_artifact_unlinked',
      link.artifactType,
    );
    await applyWorkflowAutomationForIssue(ctx, issue._id);

    return { success: true, suppressionId } as const;
  },
});
