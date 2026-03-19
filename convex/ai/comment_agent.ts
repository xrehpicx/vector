/**
 * Agent integration for issue comments.
 *
 * When a user @mentions Vector in a comment, a placeholder "thinking"
 * comment is created immediately. A background action then generates
 * the agent's response and updates the placeholder with the result.
 */
import { saveMessage } from '@convex-dev/agent';
import { v } from 'convex/values';
import { components, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { internalAction, internalMutation } from '../_generated/server';
import { assistantAgent } from './agent';
import { assertAssistantModelConfigured } from './provider';

// ─── Detect @Vector mention in comment body ──────────────────────────────────

const VECTOR_MENTION_PATTERN = /\/ai\/vector/;

export function hasAgentMention(body: string): boolean {
  return VECTOR_MENTION_PATTERN.test(body);
}

// ─── Build issue context for the agent ───────────────────────────────────────

export const buildIssueContext = internalMutation({
  args: {
    issueId: v.id('issues'),
    triggerCommentId: v.id('comments'),
  },
  returns: v.object({
    systemPrompt: v.string(),
    userPrompt: v.string(),
    issueKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue) throw new Error('Issue not found');

    const [org, team, project, priority, comments] = await Promise.all([
      ctx.db.get('organizations', issue.organizationId),
      issue.teamId ? ctx.db.get('teams', issue.teamId) : null,
      issue.projectId ? ctx.db.get('projects', issue.projectId) : null,
      issue.priorityId ? ctx.db.get('issuePriorities', issue.priorityId) : null,
      ctx.db
        .query('comments')
        .withIndex('by_issue_deleted', q =>
          q.eq('issueId', issue._id).eq('deleted', false),
        )
        .collect(),
    ]);

    const assignees = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue', q => q.eq('issueId', issue._id))
      .collect();
    const assigneeNames = await Promise.all(
      assignees.map(async a => {
        if (!a.assigneeId) return null;
        const user = await ctx.db.get('users', a.assigneeId);
        return user?.name ?? null;
      }),
    );

    const commentsWithAuthors = await Promise.all(
      comments
        .filter(c => !c.agentStatus || c.agentStatus === 'done')
        .map(async c => {
          const author = await ctx.db.get('users', c.authorId);
          return { ...c, authorName: author?.name ?? 'Unknown' };
        }),
    );

    const triggerComment = commentsWithAuthors.find(
      c => c._id === args.triggerCommentId,
    );

    const contextParts = [
      `You are responding to a comment on issue ${issue.key}: "${issue.title}".`,
      `Organization: ${org?.name ?? 'Unknown'}`,
    ];

    if (issue.description) {
      contextParts.push(`Issue description: ${issue.description}`);
    }
    if (team) contextParts.push(`Team: ${team.name} (${team.key})`);
    if (project) contextParts.push(`Project: ${project.name} (${project.key})`);
    if (priority) contextParts.push(`Priority: ${priority.name}`);
    if (assigneeNames.filter(Boolean).length > 0) {
      contextParts.push(
        `Assignees: ${assigneeNames.filter(Boolean).join(', ')}`,
      );
    }

    const otherComments = commentsWithAuthors
      .filter(c => c._id !== args.triggerCommentId)
      .slice(-10);
    if (otherComments.length > 0) {
      contextParts.push('Recent comments on this issue:');
      for (const c of otherComments) {
        const preview =
          c.body.length > 200 ? c.body.slice(0, 200) + '...' : c.body;
        contextParts.push(`- ${c.authorName}: ${preview}`);
      }
    }

    contextParts.push(
      'Respond concisely and helpfully. You can use your tools to take actions on the issue or workspace.',
      'Your response will be posted as a reply comment, so format it appropriately as markdown.',
    );

    const userPrompt = triggerComment
      ? triggerComment.body
          .replace(/\[@?Vector\]\([^)]*\/ai\/vector\)/g, '')
          .replace(/<[^>]*>/g, '')
          .trim() || 'What can you help with on this issue?'
      : 'What can you help with on this issue?';

    return {
      systemPrompt: contextParts.join('\n'),
      userPrompt,
      issueKey: issue.key,
    };
  },
});

// ─── Update the placeholder comment with agent response ──────────────────────

export const updateAgentComment = internalMutation({
  args: {
    commentId: v.id('comments'),
    body: v.string(),
    status: v.union(v.literal('done'), v.literal('error')),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('comments', args.commentId, {
      body: args.body,
      agentStatus: args.status,
    });
  },
});

// ─── Main action: generate agent response ────────────────────────────────────

export const generateCommentResponse = internalAction({
  args: {
    issueId: v.id('issues'),
    triggerCommentId: v.id('comments'),
    parentCommentId: v.optional(v.id('comments')),
    orgSlug: v.string(),
    userId: v.id('users'),
    agentCommentId: v.id('comments'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      assertAssistantModelConfigured();

      const { systemPrompt, userPrompt, issueKey } = await ctx.runMutation(
        internal.ai.comment_agent.buildIssueContext,
        {
          issueId: args.issueId,
          triggerCommentId: args.triggerCommentId,
        },
      );

      const { threadId } = await assistantAgent.createThread(ctx, {
        userId: args.userId,
        title: 'Comment agent',
      });

      const saved = await saveMessage(ctx, components.agent, {
        threadId,
        userId: args.userId,
        prompt: userPrompt,
      });

      const organization = await ctx.runQuery(
        internal.ai.internal.getAssistantOrganization,
        { orgSlug: args.orgSlug, userId: args.userId },
      );
      if (!organization) {
        await ctx.runMutation(internal.ai.comment_agent.updateAgentComment, {
          commentId: args.agentCommentId,
          body: 'Could not resolve organization.',
          status: 'error',
        });
        return null;
      }

      const currentUserContextSummary = await ctx.runQuery(
        internal.ai.internal.getCurrentUserContextSummary,
        { orgSlug: args.orgSlug, userId: args.userId },
      );
      const currentUserDeviceContextSummary = await ctx.runQuery(
        internal.ai.internal.getCurrentUserDeviceContextSummary,
        { orgSlug: args.orgSlug, userId: args.userId },
      );

      const pageContext = {
        kind: 'issue_detail' as const,
        orgSlug: args.orgSlug,
        path: `/${args.orgSlug}/issues/${issueKey}`,
        issueKey,
        entityType: 'issue' as const,
        entityId: args.issueId,
        entityKey: issueKey,
      };

      const assistantCtx = Object.assign({}, ctx, {
        organizationId: organization._id as Id<'organizations'>,
        userId: args.userId,
        currentPageContext: pageContext,
      });

      const stream = await assistantAgent.streamText(
        assistantCtx,
        { threadId, userId: args.userId },
        {
          promptMessageId: saved.messageId,
          system: [
            currentUserContextSummary,
            currentUserDeviceContextSummary,
            systemPrompt,
          ].join('\n'),
        },
      );

      await stream.consumeStream();

      // Fetch the assistant's response from the thread
      const messages = await ctx.runQuery(
        components.agent.messages.listMessagesByThreadId,
        {
          threadId,
          order: 'desc' as const,
          paginationOpts: { numItems: 5, cursor: null },
        },
      );
      // Messages are ordered desc, find the latest assistant message
      const assistantMessage = messages.page.find(
        (m: any) => m.message?.role === 'assistant',
      );
      const textParts =
        (assistantMessage?.message?.content as any[])?.filter(
          (p: any) => p.type === 'text',
        ) ?? [];
      const responseText =
        textParts
          .map((p: any) => p.text ?? '')
          .join('')
          .trim() || 'Done.';

      await ctx.runMutation(internal.ai.comment_agent.updateAgentComment, {
        commentId: args.agentCommentId,
        body: responseText,
        status: 'done',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message.slice(0, 200)
          : 'Agent response failed';

      await ctx.runMutation(internal.ai.comment_agent.updateAgentComment, {
        commentId: args.agentCommentId,
        body: `Sorry, I encountered an error: ${errorMessage}`,
        status: 'error',
      });
    }
    return null;
  },
});
