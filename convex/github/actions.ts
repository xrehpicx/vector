'use node';

import { generateObject } from 'ai';
import { ConvexError, v } from 'convex/values';
import { action, internalAction } from '../_generated/server';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { z } from 'zod';
import { PERMISSIONS } from '../_shared/permissions';
import {
  defaultAssistantModel,
  openrouterLanguageModelWithAnnotations,
} from '../ai/provider';

/**
 * Provider options used for all `generateObject` calls in this file.
 *
 * The workspace default model is a reasoning model (Kimi K2.5 at time of
 * writing). For structured-output calls the reasoning channel eats into the
 * generation budget and frequently truncates the final JSON, which then
 * fails schema validation and propagates up as `AI_NoObjectGeneratedError`.
 * Disabling reasoning here keeps the full token budget available for the
 * actual JSON response.
 */
const STRUCTURED_OUTPUT_PROVIDER_OPTIONS = {
  openrouter: {
    reasoning: { enabled: false, exclude: true },
  },
} as const;
import {
  decryptSecret,
  encryptSecret,
  fetchCommit,
  fetchIssue,
  fetchPullRequest,
  fingerprintSecret,
  generateGitHubWebhookSecret,
  listInstallationRepositories,
  listRecentCommits,
  listRecentIssues,
  listRecentPullRequests,
  parseGitHubUrl,
  verifyGitHubWebhookSignature,
  withGitHubToken,
} from './node';
import { buildArtifactExternalKey } from './shared';
import { extractIssueKeysFromText } from './shared';

async function requireOrgSettingsAccess(ctx: any, orgSlug: string) {
  const allowed = await ctx.runQuery(api.permissions.queries.has, {
    orgSlug,
    permission: PERMISSIONS.ORG_MANAGE_SETTINGS,
  });
  if (!allowed) {
    throw new ConvexError('FORBIDDEN');
  }

  return await ctx.runQuery(api.organizations.queries.getBySlug, { orgSlug });
}

async function requireIssueEditAccess(
  ctx: any,
  orgSlug: string,
  issueKey: string,
) {
  const allowed = await ctx.runQuery(api.permissions.queries.has, {
    orgSlug,
    permission: PERMISSIONS.ISSUE_EDIT,
  });
  if (!allowed) {
    throw new ConvexError('FORBIDDEN');
  }

  const issue = await ctx.runQuery(api.issues.queries.getByKey, {
    orgSlug,
    issueKey,
  });

  if (!issue) {
    throw new ConvexError('ISSUE_NOT_FOUND');
  }

  return issue;
}

async function loadGitHubAuth(
  ctx: any,
  organizationId: Id<'organizations'>,
): Promise<{
  integration: any;
  repositories: any[];
  fallbackToken: string | null;
  appCredentials?: { appId: string; privateKey: string };
}> {
  const platformCreds = await ctx.runQuery(
    internal.platformAdmin.queries.getGitHubAppCredentials,
    {},
  );

  const result: {
    integration: any;
    repositories: any[];
  } = await ctx.runQuery(
    internal.github.queries.getIntegrationForOrganization,
    {
      organizationId,
    },
  );
  const { integration, repositories } = result;

  const encryptedToken = integration?.encryptedToken ?? null;
  const fallbackToken = encryptedToken ? decryptSecret(encryptedToken) : null;

  // WIP: platform app credentials are still plumbed through for the
  // installation-token path, but workspace GitHub connectivity itself should be
  // modeled as org-owned. Avoid adding new product flows that depend on
  // platform-level GitHub auth here without revisiting that design.
  const appCredentials =
    platformCreds.appId && platformCreds.encryptedPrivateKey
      ? {
          appId: platformCreds.appId,
          privateKey: decryptSecret(platformCreds.encryptedPrivateKey),
        }
      : undefined;

  return {
    integration,
    repositories,
    fallbackToken,
    appCredentials,
  };
}

async function syncRepositoriesForOrganization(
  ctx: any,
  organizationId: Id<'organizations'>,
) {
  const { integration, fallbackToken, appCredentials } = await loadGitHubAuth(
    ctx,
    organizationId,
  );

  const repositories: any[] = await withGitHubToken({
    installationId: integration?.installationId,
    fallbackToken,
    appCredentials,
    run: async token => {
      const result = await listInstallationRepositories(token);
      return result.repositories;
    },
  });

  await ctx.runMutation(internal.github.mutations.replaceRepositories, {
    organizationId,
    repositories: repositories.map(repo => ({
      githubRepoId: repo.id,
      nodeId: repo.node_id ?? undefined,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch ?? undefined,
      private: repo.private,
      installationAccessible: true,
      lastPushedAt: repo.pushed_at ? Date.parse(repo.pushed_at) : undefined,
    })),
  });

  await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
    organizationId,
    lastReconciledAt: Date.now(),
    clearFailure: true,
  });

  return repositories.length;
}

async function resolveAutoLinkIssueKeys(
  ctx: any,
  args: {
    organizationId: Id<'organizations'>;
    artifactType: 'pull_request' | 'issue';
    repoFullName: string;
    title: string;
    body?: string | null;
    branchName?: string | null;
    initialIssueKeys: string[];
  },
) {
  const integrationResult = await ctx.runQuery(
    internal.github.queries.getIntegrationForOrganization,
    {
      organizationId: args.organizationId,
    },
  );
  const autoLinkEnabled =
    integrationResult.integration?.autoLinkEnabled ?? true;

  if (!autoLinkEnabled) {
    return [];
  }

  if (args.initialIssueKeys.length > 0) {
    return args.initialIssueKeys;
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return [];
  }

  // Clean branch name: "feature/add-user-auth" → "add user auth"
  const cleanBranch = (args.branchName ?? '')
    .replace(
      /^(feature|fix|bugfix|hotfix|chore|refactor|docs|ci|test)[\/\-_]/i,
      '',
    )
    .replace(/[\/\-_]+/g, ' ')
    .trim();

  // Strip markdown noise from PR body (code blocks, URLs, template headers)
  const cleanBody = (args.body ?? '')
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/https?:\/\/\S+/g, '') // URLs
    .replace(/#+\s*/g, '') // headers
    .replace(/<!--[\s\S]*?-->/g, '') // HTML comments
    .replace(/\[x\]|\[ \]/g, '') // checkboxes
    .replace(/[*_~`]/g, '') // formatting
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  // Run multiple search passes for better recall
  // Pass 1: title-focused (most relevant signal)
  const titleQuery = args.title.replace(/\s+/g, ' ').trim().slice(0, 200);
  // Pass 2: branch-focused (often contains issue description)
  const branchQuery = cleanBranch.slice(0, 100);
  // Pass 3: broader search with body context
  const broadQuery = [args.title, cleanBranch, cleanBody]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

  const candidateMap = new Map<string, any>();

  for (const searchQuery of [titleQuery, branchQuery, broadQuery]) {
    if (!searchQuery.trim()) continue;

    const batch = await ctx.runQuery(
      internal.github.queries.searchAutoLinkIssueCandidates,
      {
        organizationId: args.organizationId,
        searchQuery,
        limit: 8,
        repoFullName: args.repoFullName,
      },
    );

    for (const candidate of batch) {
      if (!candidateMap.has(candidate.key)) {
        candidateMap.set(candidate.key, candidate);
      }
    }

    // Stop early if we have enough candidates
    if (candidateMap.size >= 10) break;
  }

  const candidates = Array.from(candidateMap.values()).slice(0, 12);

  if (candidates.length === 0) {
    return [];
  }

  try {
    const result = await generateObject({
      model: openrouterLanguageModelWithAnnotations(defaultAssistantModel),
      providerOptions: STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
      maxOutputTokens: 512,
      schema: z.object({
        issueKey: z.string().nullable(),
        confidence: z.enum(['high', 'low']),
      }),
      prompt: [
        'Choose at most one Vector issue that this GitHub artifact should link to.',
        'A single Vector issue can correctly have multiple linked pull requests.',
        'If a candidate already has related pull requests linked, treat that as supporting evidence instead of a reason to reject it.',
        'Match based on semantic similarity — the PR and issue describe the same work even if worded differently.',
        'Consider the branch name as a strong signal (e.g. "fix-login-bug" matches an issue about login authentication).',
        'Only choose an issue if the match is clearly the same work item.',
        'If the match is uncertain, return null with low confidence.',
        '',
        `Artifact type: ${args.artifactType}`,
        `Repository: ${args.repoFullName}`,
        `Title: ${args.title}`,
        args.branchName ? `Branch: ${args.branchName}` : '',
        args.body ? `Body (summary): ${cleanBody.slice(0, 800)}` : '',
        '',
        'Candidate Vector issues:',
        ...candidates.flatMap(
          (issue: {
            key: string;
            title: string;
            description: string;
            teamName?: string;
            projectName?: string;
            linkedPullRequests: Array<{
              repoFullName: string;
              number: number;
              title: string;
              state: string;
            }>;
          }) =>
            [
              `- ${issue.key}: ${issue.title}${issue.projectName ? ` [project: ${issue.projectName}]` : ''}${issue.teamName ? ` [team: ${issue.teamName}]` : ''}${issue.description ? ` — ${issue.description.slice(0, 220)}` : ''}`,
              issue.linkedPullRequests.length > 0
                ? `  linked PRs: ${issue.linkedPullRequests
                    .map(
                      pullRequest =>
                        `${pullRequest.repoFullName}#${pullRequest.number} (${pullRequest.state}) ${pullRequest.title}`,
                    )
                    .join(' | ')}`
                : null,
            ].filter((line): line is string => Boolean(line)),
        ),
        '',
        'Return only one issueKey from the candidate list when the match is clearly correct, including when this PR looks like another part of work already tracked on the same issue.',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    if (
      result.object.confidence === 'high' &&
      result.object.issueKey &&
      candidates.some(
        (candidate: { key: string }) =>
          candidate.key === result.object.issueKey,
      )
    ) {
      return [result.object.issueKey];
    }
  } catch (error) {
    console.error('[github.autoLink] model fallback failed', error);
  }

  return [];
}

function buildFallbackPullRequestSummaryMarkdown(args: {
  issueTitle: string;
  pullRequests: Array<{
    number: number;
    title: string;
    body: string;
    url: string;
    state: string;
    repoFullName: string;
  }>;
}) {
  const overview =
    args.pullRequests.length === 1
      ? 'This issue is currently tracked by 1 linked GitHub pull request.'
      : `This issue is currently tracked by ${args.pullRequests.length} linked GitHub pull requests.`;

  const changeLines = args.pullRequests.flatMap(pullRequest => {
    const bodySnippet = pullRequest.body
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);

    return [
      `- \`${pullRequest.repoFullName}#${pullRequest.number}\` ${pullRequest.title} (${pullRequest.state})`,
      `  URL: ${pullRequest.url}`,
      `  Changes: ${bodySnippet || 'No additional description provided in GitHub.'}`,
      args.pullRequests.length > 1
        ? '  Conflicts / overlap: Review this PR against the other linked pull requests before merging because this issue is split across multiple PRs.'
        : null,
    ].filter(Boolean);
  });

  return [
    '## GitHub PR Summary',
    overview,
    '### Linked pull requests',
    ...changeLines,
  ]
    .filter(Boolean)
    .join('\n');
}

export const refreshIssuePullRequestSummary = internalAction({
  args: {
    organizationId: v.id('organizations'),
    issueId: v.id('issues'),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.github.queries.getPullRequestSummaryContextForIssue,
      args,
    );

    if (!context) {
      return { updated: false } as const;
    }

    if (context.pullRequests.length === 0) {
      await ctx.runMutation(
        internal.github.mutations.applyPullRequestSummaryToIssue,
        {
          issueId: args.issueId,
        },
      );
      return { updated: true } as const;
    }

    const fallbackSummary = buildFallbackPullRequestSummaryMarkdown({
      issueTitle: context.issue.title,
      pullRequests: context.pullRequests,
    });

    let summaryMarkdown = fallbackSummary;

    if (process.env.OPENROUTER_API_KEY?.trim()) {
      try {
        const result = await generateObject({
          model: openrouterLanguageModelWithAnnotations(defaultAssistantModel),
          providerOptions: STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
          maxOutputTokens: 2048,
          schema: z.object({
            overview: z.string().nullable(),
            pullRequests: z.array(
              z.object({
                label: z.string(),
                changes: z.string(),
                conflicts: z.string().nullable(),
              }),
            ),
            overallConflicts: z.string().nullable(),
          }),
          prompt: [
            'Summarize the linked GitHub pull requests for a Vector issue.',
            'Be concise and concrete.',
            'Call out what each pull request changes.',
            'If there is likely overlap, sequencing risk, or merge conflict potential between pull requests, mention it. If not, say none.',
            'Do not invent file names or implementation details that are not supported by the pull request titles, branches, or descriptions.',
            '',
            `Issue: ${context.issue.key} ${context.issue.title}`,
            context.issue.description
              ? `Current issue description:\n${context.issue.description.slice(0, 1600)}`
              : 'Current issue description: (empty)',
            '',
            'Linked pull requests:',
            ...context.pullRequests.map(
              (pullRequest: {
                repoFullName: string;
                number: number;
                title: string;
                state: string;
                headRefName?: string | null;
                baseRefName?: string | null;
                url: string;
                body?: string | null;
              }) =>
                [
                  `- ${pullRequest.repoFullName}#${pullRequest.number} ${pullRequest.title}`,
                  `  State: ${pullRequest.state}`,
                  pullRequest.headRefName
                    ? `  Branch: ${pullRequest.headRefName}`
                    : null,
                  pullRequest.baseRefName
                    ? `  Base: ${pullRequest.baseRefName}`
                    : null,
                  `  URL: ${pullRequest.url}`,
                  pullRequest.body
                    ? `  Description: ${pullRequest.body.slice(0, 1200)}`
                    : '  Description: (empty)',
                ]
                  .filter(Boolean)
                  .join('\n'),
            ),
          ]
            .filter(Boolean)
            .join('\n\n'),
        });

        summaryMarkdown = [
          '## GitHub PR Summary',
          result.object.overview ? result.object.overview : null,
          '### Linked pull requests',
          ...result.object.pullRequests.flatMap(pullRequest => [
            `- ${pullRequest.label}`,
            `  Changes: ${pullRequest.changes}`,
            pullRequest.conflicts
              ? `  Conflicts / overlap: ${pullRequest.conflicts}`
              : '  Conflicts / overlap: None called out.',
          ]),
          result.object.overallConflicts
            ? `### Overall conflicts\n${result.object.overallConflicts}`
            : null,
        ]
          .filter(Boolean)
          .join('\n');
      } catch (error) {
        console.error('[github.prSummary] model summary failed', error);
      }
    }

    await ctx.runMutation(
      internal.github.mutations.applyPullRequestSummaryToIssue,
      {
        issueId: args.issueId,
        legacyImportedDescriptions: context.pullRequests.map(
          (pullRequest: {
            repoFullName: string;
            number: number;
            url: string;
            body?: string | null;
          }) =>
            [
              `Imported from GitHub PR ${pullRequest.repoFullName}#${pullRequest.number}`,
              pullRequest.url,
              pullRequest.body?.trim() || null,
            ]
              .filter(Boolean)
              .join('\n\n'),
        ),
        summaryMarkdown,
      },
    );

    return { updated: true } as const;
  },
});

function parseGitHubWebhookPayload(body: string) {
  try {
    return JSON.parse(body);
  } catch {
    const form = new URLSearchParams(body);
    const payload = form.get('payload');
    if (payload) {
      return JSON.parse(payload);
    }

    const bodyObject = Object.fromEntries(form.entries());
    if (Object.keys(bodyObject).length > 0) {
      return bodyObject;
    }

    throw new Error('Invalid GitHub webhook payload');
  }
}

function extractGitHubArtifactUrls(text: string) {
  type ParsedArtifactUrl =
    | ({ type: 'pull_request'; owner: string; repo: string; number: number } & {
        url: string;
      })
    | ({ type: 'issue'; owner: string; repo: string; number: number } & {
        url: string;
      })
    | ({ type: 'commit'; owner: string; repo: string; sha: string } & {
        url: string;
      });

  const matches =
    text.match(/https?:\/\/github\.com\/[^\s<>()\[\]{}]+/gi) ?? [];
  const urls = new Map<string, ParsedArtifactUrl>();

  for (const rawMatch of matches) {
    const url = rawMatch.replace(/[),.;!?]+$/g, '');
    const parsed = parseGitHubUrl(url);
    if (!parsed) continue;
    urls.set(url, { ...parsed, url });
  }

  return Array.from(urls.values());
}

async function linkArtifactToIssueRecord(
  ctx: any,
  args: {
    organizationId: Id<'organizations'>;
    issueId: Id<'issues'>;
    issueKey: string;
    url: string;
    actorId?: Id<'users'>;
  },
) {
  const parsed = parseGitHubUrl(args.url.trim());
  if (!parsed) {
    throw new ConvexError('INVALID_GITHUB_URL');
  }

  const repoFullName = `${parsed.owner}/${parsed.repo}`;
  const repository = await ctx.runQuery(
    internal.github.queries.getRepositoryByFullName,
    {
      organizationId: args.organizationId,
      fullName: repoFullName,
    },
  );

  if (!repository?.selected) {
    throw new ConvexError('REPOSITORY_NOT_CONNECTED');
  }

  const alreadyLinked = await ctx.runQuery(
    internal.github.queries.hasActiveLinkForIssueArtifact,
    {
      issueId: args.issueId,
      artifactType: parsed.type,
      repoFullName,
      number: parsed.type === 'commit' ? undefined : parsed.number,
      sha: parsed.type === 'commit' ? parsed.sha : undefined,
    },
  );

  if (alreadyLinked) {
    return { success: true, linked: false, reason: 'already_linked' } as const;
  }

  const storedArtifact = await ctx.runQuery(
    internal.github.queries.findStoredArtifactForLinking,
    {
      organizationId: args.organizationId,
      artifactType: parsed.type,
      fullName: repoFullName,
      number: parsed.type === 'commit' ? undefined : parsed.number,
      sha: parsed.type === 'commit' ? parsed.sha : undefined,
    },
  );

  if (storedArtifact) {
    if (parsed.type === 'pull_request' && 'pullRequestId' in storedArtifact) {
      await ctx.runMutation(internal.github.mutations.linkPullRequestManually, {
        organizationId: args.organizationId,
        issueId: args.issueId,
        pullRequestId: storedArtifact.pullRequestId,
        repoFullName,
        number: parsed.number,
        actorId: args.actorId,
      });
      return { success: true, linked: true } as const;
    }

    if (parsed.type === 'issue' && 'githubIssueId' in storedArtifact) {
      await ctx.runMutation(internal.github.mutations.linkGitHubIssueManually, {
        organizationId: args.organizationId,
        issueId: args.issueId,
        githubIssueId: storedArtifact.githubIssueId,
        repoFullName,
        number: parsed.number,
        actorId: args.actorId,
      });
      return { success: true, linked: true } as const;
    }

    if (parsed.type === 'commit' && 'commitId' in storedArtifact) {
      await ctx.runMutation(internal.github.mutations.linkCommitManually, {
        organizationId: args.organizationId,
        issueId: args.issueId,
        commitId: storedArtifact.commitId,
        repoFullName,
        sha: parsed.sha,
        actorId: args.actorId,
      });
      return { success: true, linked: true } as const;
    }
  }

  const { integration, fallbackToken, appCredentials } = await loadGitHubAuth(
    ctx,
    args.organizationId,
  );

  const artifactResult = await withGitHubToken({
    installationId: integration?.installationId,
    fallbackToken,
    appCredentials,
    run: async token => {
      if (parsed.type === 'pull_request') {
        return {
          type: parsed.type,
          payload: await fetchPullRequest(
            token,
            parsed.owner,
            parsed.repo,
            parsed.number,
          ),
        };
      }
      if (parsed.type === 'issue') {
        return {
          type: parsed.type,
          payload: await fetchIssue(
            token,
            parsed.owner,
            parsed.repo,
            parsed.number,
          ),
        };
      }
      return {
        type: parsed.type,
        payload: await fetchCommit(
          token,
          parsed.owner,
          parsed.repo,
          parsed.sha,
        ),
      };
    },
  });

  if (artifactResult.type === 'pull_request') {
    const pullRequestId = await persistPullRequestPayload(ctx, {
      organizationId: args.organizationId,
      repository,
      payload: artifactResult.payload,
    });
    await ctx.runMutation(internal.github.mutations.linkPullRequestManually, {
      organizationId: args.organizationId,
      issueId: args.issueId,
      pullRequestId,
      repoFullName,
      number: artifactResult.payload.number,
      actorId: args.actorId,
    });
    return { success: true, linked: true } as const;
  }

  if (artifactResult.type === 'issue') {
    const githubIssueId = await persistGitHubIssuePayload(ctx, {
      organizationId: args.organizationId,
      repository,
      payload: artifactResult.payload,
    });
    if (!githubIssueId) {
      throw new ConvexError('INVALID_GITHUB_ISSUE');
    }
    await ctx.runMutation(internal.github.mutations.linkGitHubIssueManually, {
      organizationId: args.organizationId,
      issueId: args.issueId,
      githubIssueId,
      repoFullName,
      number: artifactResult.payload.number,
      actorId: args.actorId,
    });
    return { success: true, linked: true } as const;
  }

  const commitId = await persistCommitPayload(ctx, {
    organizationId: args.organizationId,
    repository,
    payload: artifactResult.payload,
  });
  await ctx.runMutation(internal.github.mutations.linkCommitManually, {
    organizationId: args.organizationId,
    issueId: args.issueId,
    commitId,
    repoFullName,
    sha: artifactResult.payload.sha,
    actorId: args.actorId,
  });

  return { success: true, linked: true } as const;
}

async function ensureRepository(
  ctx: any,
  organizationId: Id<'organizations'>,
  repo: {
    id: number;
    node_id?: string | null;
    name: string;
    full_name: string;
    private: boolean;
    default_branch?: string | null;
    pushed_at?: string | null;
    owner: { login: string };
  },
) {
  const repositoryId = await ctx.runMutation(
    internal.github.mutations.upsertWebhookRepository,
    {
      organizationId,
      githubRepoId: repo.id,
      nodeId: repo.node_id ?? undefined,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch ?? undefined,
      private: repo.private,
      lastPushedAt: repo.pushed_at ? Date.parse(repo.pushed_at) : undefined,
    },
  );

  const repository = await ctx.runQuery(
    internal.github.queries.getRepositoryByFullName,
    {
      organizationId,
      fullName: repo.full_name,
    },
  );

  if (!repository) {
    throw new Error(`Failed to persist repository ${repo.full_name}`);
  }

  if (String(repository._id) !== String(repositoryId)) {
    const ensuredRepository = await ctx.runQuery(
      internal.github.queries.getRepositoryByFullName,
      {
        organizationId,
        fullName: repo.full_name,
      },
    );
    if (ensuredRepository) {
      return ensuredRepository;
    }
  }

  return repository;
}

async function persistPullRequestPayload(
  ctx: any,
  args: {
    organizationId: Id<'organizations'>;
    repository: any;
    payload: any;
  },
) {
  const state = args.payload.merged_at
    ? 'merged'
    : args.payload.state === 'closed'
      ? 'closed'
      : args.payload.draft
        ? 'draft'
        : 'open';

  const upsertResult = await ctx.runMutation(
    internal.github.mutations.upsertPullRequest,
    {
      organizationId: args.organizationId,
      repositoryId: args.repository._id,
      githubPullRequestId: args.payload.id,
      nodeId: args.payload.node_id ?? undefined,
      number: args.payload.number,
      title: args.payload.title,
      body: args.payload.body ?? undefined,
      url: args.payload.html_url,
      state,
      isDraft: Boolean(args.payload.draft),
      headRefName: args.payload.head?.ref ?? undefined,
      baseRefName: args.payload.base?.ref ?? undefined,
      authorGitHubUserId:
        typeof args.payload.user?.id === 'number'
          ? args.payload.user.id
          : undefined,
      authorLogin: args.payload.user?.login ?? undefined,
      authorAvatarUrl: args.payload.user?.avatar_url ?? undefined,
      assigneeGitHubUserIds: Array.isArray(args.payload.assignees)
        ? args.payload.assignees
            .map((a: any) => a?.id)
            .filter((id: unknown): id is number => typeof id === 'number')
        : undefined,
      assigneeLogins: Array.isArray(args.payload.assignees)
        ? args.payload.assignees
            .map((a: any) => a?.login)
            .filter((l: unknown): l is string => typeof l === 'string')
        : undefined,
      mergedAt: args.payload.merged_at
        ? Date.parse(args.payload.merged_at)
        : undefined,
      closedAt: args.payload.closed_at
        ? Date.parse(args.payload.closed_at)
        : undefined,
      lastActivityAt: Date.parse(
        args.payload.updated_at ??
          args.payload.created_at ??
          new Date().toISOString(),
      ),
    },
  );
  const pullRequestId = upsertResult.pullRequestId;

  const issueKeys = extractIssueKeysFromText(
    args.payload.title,
    args.payload.body,
    args.payload.head?.ref,
  );
  const resolvedIssueKeys = await resolveAutoLinkIssueKeys(ctx, {
    organizationId: args.organizationId,
    artifactType: 'pull_request',
    repoFullName: args.repository.fullName,
    title: args.payload.title,
    body: args.payload.body,
    branchName: args.payload.head?.ref,
    initialIssueKeys: issueKeys,
  });

  await ctx.runMutation(internal.github.mutations.syncPullRequestLinks, {
    organizationId: args.organizationId,
    pullRequestId,
    repoFullName: args.repository.fullName,
    number: args.payload.number,
    issueKeys: resolvedIssueKeys,
  });

  if (
    upsertResult.previousTitle !== undefined ||
    upsertResult.previousBody !== undefined
  ) {
    await ctx.runMutation(
      internal.github.mutations.syncLinkedIssueContentFromPullRequest,
      {
        organizationId: args.organizationId,
        pullRequestId,
        repoFullName: args.repository.fullName,
        previousTitle: upsertResult.previousTitle,
        previousBody: upsertResult.previousBody,
      },
    );
  }

  return pullRequestId;
}

async function persistGitHubIssuePayload(
  ctx: any,
  args: {
    organizationId: Id<'organizations'>;
    repository: any;
    payload: any;
  },
) {
  if (args.payload.pull_request) {
    return null;
  }

  const githubIssueId = await ctx.runMutation(
    internal.github.mutations.upsertGitHubIssue,
    {
      organizationId: args.organizationId,
      repositoryId: args.repository._id,
      githubIssueId: args.payload.id,
      nodeId: args.payload.node_id ?? undefined,
      number: args.payload.number,
      title: args.payload.title,
      body: args.payload.body ?? undefined,
      url: args.payload.html_url,
      state: args.payload.state,
      authorGitHubUserId:
        typeof args.payload.user?.id === 'number'
          ? args.payload.user.id
          : undefined,
      authorLogin: args.payload.user?.login ?? undefined,
      authorAvatarUrl: args.payload.user?.avatar_url ?? undefined,
      assigneeGitHubUserIds: Array.isArray(args.payload.assignees)
        ? args.payload.assignees
            .map((assignee: any) => assignee?.id)
            .filter((id: unknown): id is number => typeof id === 'number')
        : undefined,
      assigneeLogins: Array.isArray(args.payload.assignees)
        ? args.payload.assignees
            .map((assignee: any) => assignee?.login)
            .filter((login: any): login is string => Boolean(login))
        : undefined,
      closedAt: args.payload.closed_at
        ? Date.parse(args.payload.closed_at)
        : undefined,
      lastActivityAt: Date.parse(
        args.payload.updated_at ??
          args.payload.created_at ??
          new Date().toISOString(),
      ),
    },
  );

  const issueKeys = extractIssueKeysFromText(
    args.payload.title,
    args.payload.body,
  );
  const resolvedIssueKeys = await resolveAutoLinkIssueKeys(ctx, {
    organizationId: args.organizationId,
    artifactType: 'issue',
    repoFullName: args.repository.fullName,
    title: args.payload.title,
    body: args.payload.body,
    initialIssueKeys: issueKeys,
  });

  await ctx.runMutation(internal.github.mutations.syncGitHubIssueLinks, {
    organizationId: args.organizationId,
    githubIssueId,
    repoFullName: args.repository.fullName,
    number: args.payload.number,
    issueKeys: resolvedIssueKeys,
  });

  return githubIssueId;
}

async function persistCommitPayload(
  ctx: any,
  args: {
    organizationId: Id<'organizations'>;
    repository: any;
    payload: any;
  },
) {
  const sha =
    typeof args.payload.sha === 'string' && args.payload.sha.trim().length > 0
      ? args.payload.sha
      : typeof args.payload.id === 'string' && args.payload.id.trim().length > 0
        ? args.payload.id
        : null;
  if (!sha) {
    return null;
  }

  const commitMessage: string =
    args.payload.commit?.message ?? args.payload.message ?? '';
  const [headline, ...bodyLines] = commitMessage.split('\n');
  const commitId = await ctx.runMutation(
    internal.github.mutations.upsertCommit,
    {
      organizationId: args.organizationId,
      repositoryId: args.repository._id,
      sha,
      shortSha: sha.slice(0, 7),
      messageHeadline: headline || sha.slice(0, 7),
      messageBody: bodyLines.join('\n').trim() || undefined,
      url: args.payload.html_url ?? args.payload.url,
      authorName:
        args.payload.commit?.author?.name ??
        args.payload.author?.login ??
        undefined,
      authorEmail: args.payload.commit?.author?.email ?? undefined,
      committedAt: args.payload.commit?.committer?.date
        ? Date.parse(args.payload.commit.committer.date)
        : undefined,
      authoredAt: args.payload.commit?.author?.date
        ? Date.parse(args.payload.commit.author.date)
        : undefined,
    },
  );

  const issueKeys = extractIssueKeysFromText(commitMessage);
  await ctx.runMutation(internal.github.mutations.syncCommitLinks, {
    organizationId: args.organizationId,
    commitId,
    repoFullName: args.repository.fullName,
    sha,
    issueKeys,
  });

  return commitId;
}

export const saveInstallationConnection = action({
  args: {
    orgSlug: v.string(),
    installationId: v.number(),
    installationAccountLogin: v.optional(v.string()),
    installationAccountType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgSettingsAccess(ctx, args.orgSlug);
    await ctx.runMutation(
      internal.github.mutations.upsertInstallationConnection,
      {
        organizationId: org._id,
        connectionMode: 'app',
        installationId: args.installationId,
        installationAccountLogin: args.installationAccountLogin,
        installationAccountType: args.installationAccountType,
      },
    );
    return { success: true } as const;
  },
});

export const saveTokenFallback = action({
  args: {
    orgSlug: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgSettingsAccess(ctx, args.orgSlug);
    await ctx.runMutation(internal.github.mutations.setEncryptedToken, {
      organizationId: org._id,
      encryptedToken: encryptSecret(args.token.trim()),
      tokenFingerprint: fingerprintSecret(args.token.trim()),
    });
    return { success: true } as const;
  },
});

export const removeTokenFallback = action({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgSettingsAccess(ctx, args.orgSlug);
    await ctx.runMutation(internal.github.mutations.setEncryptedToken, {
      organizationId: org._id,
      encryptedToken: undefined,
      tokenFingerprint: undefined,
    });
    return { success: true } as const;
  },
});

export const rotateWebhookSecret = action({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await requireOrgSettingsAccess(ctx, args.orgSlug);
    const webhookSecret = generateGitHubWebhookSecret();

    await ctx.runMutation(internal.github.mutations.setWebhookSecret, {
      organizationId: org._id,
      encryptedWebhookSecret: encryptSecret(webhookSecret),
      webhookSecretFingerprint: fingerprintSecret(webhookSecret),
    });

    return {
      success: true,
      webhookSecret,
      webhookSecretFingerprint: fingerprintSecret(webhookSecret),
    } as const;
  },
});

export const syncRepositories = action({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true; count: number }> => {
    const org = await requireOrgSettingsAccess(ctx, args.orgSlug);
    const count = await syncRepositoriesForOrganization(ctx, org._id);
    return { success: true, count } as const;
  },
});

export const linkArtifactByUrl = action({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const issue = await requireIssueEditAccess(
      ctx,
      args.orgSlug,
      args.issueKey,
    );
    const viewer = await ctx.runQuery(api.users.currentUser, {});
    if (!viewer?._id) {
      throw new ConvexError('UNAUTHORIZED');
    }

    await linkArtifactToIssueRecord(ctx, {
      organizationId: issue.organizationId,
      issueId: issue._id,
      issueKey: issue.key,
      url: args.url,
      actorId: viewer._id,
    });

    return { success: true } as const;
  },
});

export const syncIssueLinksFromContent = internalAction({
  args: {
    issueId: v.id('issues'),
    actorId: v.optional(v.id('users')),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: true; scanned: number; linked: number }> => {
    const issue: {
      _id: Id<'issues'>;
      organizationId: Id<'organizations'>;
      key: string;
      title: string;
      description: string | null;
    } | null = await ctx.runQuery(internal.github.queries.getIssueForLinkSync, {
      issueId: args.issueId,
    });

    if (!issue) {
      return { success: true, scanned: 0, linked: 0 } as const;
    }

    const artifactUrls: Array<{
      url: string;
      type: 'pull_request';
      owner: string;
      repo: string;
      number: number;
    }> = extractGitHubArtifactUrls(
      [issue.title, issue.description ?? ''].filter(Boolean).join('\n'),
    ).filter(artifact => artifact.type === 'pull_request');

    let linked = 0;

    for (const artifact of artifactUrls) {
      try {
        const result = await linkArtifactToIssueRecord(ctx, {
          organizationId: issue.organizationId,
          issueId: issue._id,
          issueKey: issue.key,
          url: artifact.url,
          actorId: args.actorId,
        });
        if (result.linked) {
          linked += 1;
        }
      } catch (error) {
        const parsed = parseGitHubUrl(artifact.url);
        const externalKey = parsed
          ? buildArtifactExternalKey(
              parsed.type,
              `${parsed.owner}/${parsed.repo}`,
              parsed.type === 'commit' ? parsed.sha : parsed.number,
            )
          : artifact.url;
        console.error(
          `[github.issueContentAutoLink] failed to link ${externalKey} for issue ${issue.key}`,
          error,
        );
      }
    }

    return {
      success: true,
      scanned: artifactUrls.length,
      linked,
    } as const;
  },
});

export const refreshIssueDevelopment = action({
  args: {
    issueId: v.id('issues'),
  },
  handler: async (ctx, args): Promise<{ success: true; refreshed: number }> => {
    const development: any = await ctx.runQuery(
      api.github.queries.getIssueDevelopment,
      {
        issueId: args.issueId,
      },
    );

    const links: Array<
      | { type: 'pull_request'; repo: any; number: number }
      | { type: 'issue'; repo: any; number: number }
      | { type: 'commit'; repo: any; sha: string }
    > = [
      ...development.pullRequests.map((item: any) => ({
        type: 'pull_request' as const,
        repo: item.repository,
        number: item.number,
      })),
      ...development.githubIssues.map((item: any) => ({
        type: 'issue' as const,
        repo: item.repository,
        number: item.number,
      })),
      ...development.commits.map((item: any) => ({
        type: 'commit' as const,
        repo: item.repository,
        sha: item.sha,
      })),
    ];

    if (links.length === 0) {
      return { success: true, refreshed: 0 } as const;
    }

    const organizationId = development.organizationId;

    const { integration, fallbackToken, appCredentials } = await loadGitHubAuth(
      ctx,
      organizationId,
    );

    await withGitHubToken({
      installationId: integration?.installationId,
      fallbackToken,
      appCredentials,
      run: async token => {
        for (const link of links) {
          if (!link.repo) continue;
          if (link.type === 'pull_request') {
            const payload = await fetchPullRequest(
              token,
              link.repo.owner,
              link.repo.name,
              link.number,
            );
            await persistPullRequestPayload(ctx, {
              organizationId,
              repository: link.repo,
              payload,
            });
          } else if (link.type === 'issue') {
            const payload = await fetchIssue(
              token,
              link.repo.owner,
              link.repo.name,
              link.number,
            );
            await persistGitHubIssuePayload(ctx, {
              organizationId,
              repository: link.repo,
              payload,
            });
          } else {
            const payload = await fetchCommit(
              token,
              link.repo.owner,
              link.repo.name,
              link.sha,
            );
            await persistCommitPayload(ctx, {
              organizationId,
              repository: link.repo,
              payload,
            });
          }
        }
      },
    });

    await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
      organizationId,
      lastReconciledAt: Date.now(),
      clearFailure: true,
    });

    return { success: true, refreshed: links.length } as const;
  },
});

export const processWebhook = internalAction({
  args: {
    body: v.string(),
    event: v.string(),
    deliveryId: v.optional(v.string()),
    orgSlug: v.optional(v.string()),
    signature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payload = parseGitHubWebhookPayload(args.body);
    const repoPayload = payload.repository;
    const installationId =
      typeof payload.installation?.id === 'number'
        ? payload.installation.id
        : null;

    if (args.orgSlug) {
      const integration = await ctx.runQuery(
        internal.github.queries.getIntegrationByOrgSlug,
        { orgSlug: args.orgSlug },
      );

      if (!integration) {
        return { ignored: true } as const;
      }

      const encryptedWebhookSecret =
        integration.integration?.encryptedWebhookSecret ?? null;
      const webhookSecret = encryptedWebhookSecret
        ? decryptSecret(encryptedWebhookSecret)
        : undefined;

      if (
        !integration.integration ||
        !verifyGitHubWebhookSignature(
          args.body,
          args.signature ?? null,
          webhookSecret,
        )
      ) {
        return { ignored: true } as const;
      }

      await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
        organizationId: integration.organizationId,
        lastWebhookAt: Date.now(),
        lastWebhookEvent: args.event,
      });

      const ensuredRepository = repoPayload
        ? await ensureRepository(ctx, integration.organizationId, {
            id: repoPayload.id,
            node_id: repoPayload.node_id,
            name: repoPayload.name,
            full_name: repoPayload.full_name,
            private: repoPayload.private,
            default_branch: repoPayload.default_branch,
            pushed_at: repoPayload.pushed_at,
            owner: { login: repoPayload.owner?.login ?? '' },
          })
        : null;

      if (
        args.event === 'pull_request' &&
        payload.pull_request &&
        ensuredRepository
      ) {
        const pullRequestId = await persistPullRequestPayload(ctx, {
          organizationId: integration.organizationId,
          repository: ensuredRepository,
          payload: payload.pull_request,
        });
        if (payload.action === 'opened') {
          await ctx.runMutation(
            internal.github.mutations.createIssueFromPullRequestIfNeeded,
            {
              organizationId: integration.organizationId,
              pullRequestId,
            },
          );
        }
        return { success: true } as const;
      }

      if (args.event === 'issues' && payload.issue && ensuredRepository) {
        await persistGitHubIssuePayload(ctx, {
          organizationId: integration.organizationId,
          repository: ensuredRepository,
          payload: payload.issue,
        });
        return { success: true } as const;
      }

      if (
        args.event === 'push' &&
        Array.isArray(payload.commits) &&
        ensuredRepository
      ) {
        for (const commit of payload.commits) {
          await persistCommitPayload(ctx, {
            organizationId: integration.organizationId,
            repository: ensuredRepository,
            payload: {
              ...commit,
              repository: repoPayload,
            },
          });
        }
        return { success: true } as const;
      }

      if (
        args.event === 'installation' ||
        args.event === 'installation_repositories'
      ) {
        return { success: true } as const;
      }

      return { ignored: true } as const;
    }

    let matchedIntegration: {
      organizationId: Id<'organizations'>;
      integration: any;
    } | null = null;

    if (installationId) {
      const integration = await ctx.runQuery(
        internal.github.queries.getIntegrationByInstallationId,
        { installationId },
      );
      if (integration) {
        const webhookSecret = integration.encryptedWebhookSecret
          ? decryptSecret(integration.encryptedWebhookSecret)
          : undefined;
        if (
          verifyGitHubWebhookSignature(
            args.body,
            args.signature ?? null,
            webhookSecret,
          )
        ) {
          matchedIntegration = {
            organizationId: integration.organizationId,
            integration,
          };
        }
      }
    }

    if (!matchedIntegration && typeof repoPayload?.full_name === 'string') {
      const candidates = await ctx.runQuery(
        internal.github.queries.getWebhookCandidatesByRepositoryFullName,
        { fullName: repoPayload.full_name },
      );

      for (const candidate of candidates) {
        const webhookSecret = candidate.integration.encryptedWebhookSecret
          ? decryptSecret(candidate.integration.encryptedWebhookSecret)
          : undefined;
        if (
          verifyGitHubWebhookSignature(
            args.body,
            args.signature ?? null,
            webhookSecret,
          )
        ) {
          matchedIntegration = candidate;
          break;
        }
      }
    }

    if (!matchedIntegration) {
      return { ignored: true } as const;
    }

    if (
      (args.event === 'installation' ||
        args.event === 'installation_repositories') &&
      installationId
    ) {
      const integration = matchedIntegration.integration;

      if (!integration) {
        return { ignored: true } as const;
      }

      const shouldSyncRepositories =
        args.event === 'installation_repositories' ||
        payload.action === 'created' ||
        payload.action === 'new_permissions_accepted' ||
        payload.action === 'unsuspend';

      await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
        organizationId: integration.organizationId,
        lastWebhookAt: Date.now(),
        lastWebhookEvent: args.event,
      });

      if (shouldSyncRepositories) {
        try {
          await syncRepositoriesForOrganization(
            ctx,
            integration.organizationId,
          );
        } catch (error) {
          await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
            organizationId: integration.organizationId,
            lastSyncFailureAt: Date.now(),
            lastSyncFailureMessage:
              error instanceof Error
                ? error.message
                : 'GitHub installation sync failed',
          });
          throw error;
        }
      }

      return { success: true } as const;
    }

    const organizationId = matchedIntegration.organizationId;
    if (!organizationId) {
      return { ignored: true } as const;
    }

    await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
      organizationId,
      lastWebhookAt: Date.now(),
      lastWebhookEvent: args.event,
    });

    let repository = null;
    if (typeof repoPayload?.full_name === 'string') {
      repository = await ctx.runQuery(
        internal.github.queries.getRepositoryByFullName,
        {
          organizationId,
          fullName: repoPayload.full_name,
        },
      );
    }

    const ensuredRepository = repoPayload
      ? await ensureRepository(ctx, organizationId, {
          id: repoPayload.id,
          node_id: repoPayload.node_id,
          name: repoPayload.name,
          full_name: repoPayload.full_name,
          private: repoPayload.private,
          default_branch: repoPayload.default_branch,
          pushed_at: repoPayload.pushed_at,
          owner: { login: repoPayload.owner?.login ?? '' },
        })
      : repository;

    if (!ensuredRepository) {
      return { ignored: true } as const;
    }

    if (args.event === 'pull_request' && payload.pull_request) {
      const pullRequestId = await persistPullRequestPayload(ctx, {
        organizationId,
        repository: ensuredRepository,
        payload: payload.pull_request,
      });
      if (payload.action === 'opened') {
        await ctx.runMutation(
          internal.github.mutations.createIssueFromPullRequestIfNeeded,
          {
            organizationId,
            pullRequestId,
          },
        );
      }
      return { success: true } as const;
    }

    if (args.event === 'issues' && payload.issue) {
      await persistGitHubIssuePayload(ctx, {
        organizationId,
        repository: ensuredRepository,
        payload: payload.issue,
      });
      return { success: true } as const;
    }

    if (args.event === 'push' && Array.isArray(payload.commits)) {
      for (const commit of payload.commits) {
        await persistCommitPayload(ctx, {
          organizationId,
          repository: ensuredRepository,
          payload: {
            ...commit,
            repository: repoPayload,
          },
        });
      }
      return { success: true } as const;
    }

    if (
      args.event === 'installation' ||
      args.event === 'installation_repositories'
    ) {
      await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
        organizationId,
        lastWebhookAt: Date.now(),
        lastWebhookEvent: args.event,
      });
      return { success: true } as const;
    }

    return { ignored: true } as const;
  },
});

export const reconcileRecentArtifacts = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: true; organizations: number }> => {
    const integrations: Array<{ integration: any; repositories: any[] }> =
      await ctx.runQuery(
        internal.github.queries.listIntegrationsForReconcile,
        {},
      );

    const platformCreds = await ctx.runQuery(
      internal.platformAdmin.queries.getGitHubAppCredentials,
      {},
    );
    const appCredentials =
      platformCreds.appId && platformCreds.encryptedPrivateKey
        ? {
            appId: platformCreds.appId,
            privateKey: decryptSecret(platformCreds.encryptedPrivateKey),
          }
        : undefined;

    const sinceIso = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    for (const item of integrations) {
      const fallbackToken = item.integration.encryptedToken
        ? decryptSecret(item.integration.encryptedToken)
        : null;
      const installationId = item.integration.installationId ?? null;

      try {
        await withGitHubToken({
          installationId,
          fallbackToken,
          appCredentials,
          run: async token => {
            for (const repository of item.repositories) {
              const [pullRequests, githubIssues, commits] = await Promise.all([
                listRecentPullRequests(
                  token,
                  repository.owner,
                  repository.name,
                ),
                listRecentIssues(token, repository.owner, repository.name),
                listRecentCommits(
                  token,
                  repository.owner,
                  repository.name,
                  sinceIso,
                ),
              ]);

              for (const pr of pullRequests) {
                await persistPullRequestPayload(ctx, {
                  organizationId: repository.organizationId,
                  repository,
                  payload: pr,
                });
              }

              for (const ghIssue of githubIssues) {
                await persistGitHubIssuePayload(ctx, {
                  organizationId: repository.organizationId,
                  repository,
                  payload: ghIssue,
                });
              }

              for (const commit of commits) {
                await persistCommitPayload(ctx, {
                  organizationId: repository.organizationId,
                  repository,
                  payload: commit,
                });
              }
            }
          },
        });

        await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
          organizationId: item.integration.organizationId,
          lastReconciledAt: Date.now(),
          clearFailure: true,
        });
      } catch (error) {
        await ctx.runMutation(internal.github.mutations.upsertSyncHealth, {
          organizationId: item.integration.organizationId,
          lastSyncFailureAt: Date.now(),
          lastSyncFailureMessage:
            error instanceof Error ? error.message : 'GitHub reconcile failed',
        });
      }
    }

    return { success: true, organizations: integrations.length } as const;
  },
});
