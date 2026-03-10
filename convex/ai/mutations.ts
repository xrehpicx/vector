import { saveMessage } from '@convex-dev/agent';
import type { RegisteredMutation } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { components, internal } from '../_generated/api';
import { internalMutation, mutation } from '../_generated/server';
import { requireAuthUserId } from '../authUtils';
import { assistantAgent } from './agent';
import {
  assistantPageContextValidator,
  buildAssistantThreadPatch,
  getAssistantThreadRow,
  requireOrgForAssistant,
} from './lib';

type ConfirmedActionEntityType = 'document' | 'issue' | 'project' | 'team';

type ConfirmedActionResult = {
  actionId: string;
  entityType: ConfirmedActionEntityType;
  entityLabel: string;
};

type ExecutedPendingAction = {
  id: string;
  entityType: ConfirmedActionEntityType;
  entityLabel: string;
};

export const ensureThread = mutation({
  args: {
    orgSlug: v.string(),
    pageContext: assistantPageContextValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      userId,
    );

    const existing = await getAssistantThreadRow(ctx, organization._id, userId);
    if (existing) {
      await ctx.db.patch('assistantThreads', existing._id, {
        updatedAt: Date.now(),
        ...buildAssistantThreadPatch(args.pageContext),
      });
      return existing;
    }

    const { threadId } = await assistantAgent.createThread(ctx, {
      userId,
      title: 'Vector Assistant',
    });

    const rowId = await ctx.db.insert('assistantThreads', {
      organizationId: organization._id,
      userId,
      threadId,
      updatedAt: Date.now(),
      threadStatus: 'idle',
      ...buildAssistantThreadPatch(args.pageContext),
    });

    return await ctx.db.get('assistantThreads', rowId);
  },
});

export const sendMessage = mutation({
  args: {
    orgSlug: v.string(),
    pageContext: assistantPageContextValidator,
    prompt: v.string(),
  },
  returns: v.object({
    threadId: v.string(),
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      userId,
    );

    const prompt = args.prompt.trim();
    if (!prompt) {
      throw new ConvexError('PROMPT_REQUIRED');
    }

    let row = await getAssistantThreadRow(ctx, organization._id, userId);
    if (!row) {
      const { threadId } = await assistantAgent.createThread(ctx, {
        userId,
        title: 'Vector Assistant',
      });
      const rowId = await ctx.db.insert('assistantThreads', {
        organizationId: organization._id,
        userId,
        threadId,
        updatedAt: Date.now(),
        threadStatus: 'idle',
        ...buildAssistantThreadPatch(args.pageContext),
      });
      row = await ctx.db.get('assistantThreads', rowId);
    }

    if (!row) {
      throw new ConvexError('THREAD_CREATE_FAILED');
    }

    const saved = await saveMessage(ctx, components.agent, {
      threadId: row.threadId,
      userId,
      prompt,
    });

    await ctx.db.patch('assistantThreads', row._id, {
      updatedAt: Date.now(),
      threadStatus: 'pending',
      errorMessage: undefined,
      ...buildAssistantThreadPatch(args.pageContext),
    });

    await ctx.scheduler.runAfter(0, internal.ai.actions.generateResponse, {
      assistantThreadId: row._id,
      orgSlug: args.orgSlug,
      userId,
      threadId: row.threadId,
      promptMessageId: saved.messageId,
      pageContext: args.pageContext,
    });

    return {
      threadId: row.threadId,
      messageId: saved.messageId,
    };
  },
});

export const executeConfirmedAction: RegisteredMutation<
  'public',
  { orgSlug: string; actionId: string },
  ConfirmedActionResult
> = mutation({
  args: {
    orgSlug: v.string(),
    actionId: v.string(),
  },
  returns: v.object({
    actionId: v.string(),
    entityType: v.union(
      v.literal('document'),
      v.literal('issue'),
      v.literal('project'),
      v.literal('team'),
    ),
    entityLabel: v.string(),
  }),
  handler: async (ctx, args): Promise<ConfirmedActionResult> => {
    const userId = await requireAuthUserId(ctx);
    const executed = (await ctx.runMutation(
      internal.ai.internal.executePendingAction,
      {
        orgSlug: args.orgSlug,
        userId,
        actionId: args.actionId,
      },
    )) as ExecutedPendingAction;

    const row = await getAssistantThreadRow(
      ctx,
      (await requireOrgForAssistant(ctx, args.orgSlug, userId))._id,
      userId,
    );

    if (row) {
      await saveMessage(ctx, components.agent, {
        threadId: row.threadId,
        userId,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `Confirmed and completed deletion of ${executed.entityType} "${executed.entityLabel}".`,
            },
          ],
        },
      });
    }

    return {
      actionId: executed.id,
      entityType: executed.entityType,
      entityLabel: executed.entityLabel,
    };
  },
});

export const cancelPendingAction = mutation({
  args: {
    orgSlug: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await ctx.runMutation(internal.ai.internal.clearPendingAction, {
      orgSlug: args.orgSlug,
      userId,
    });
    return null;
  },
});

export const markActionCompleted = mutation({
  args: {
    actionId: v.id('assistantActions'),
    status: v.union(v.literal('done'), v.literal('failed')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const action = await ctx.db.get('assistantActions', args.actionId);
    if (!action || action.userId !== userId) {
      throw new ConvexError('ACTION_NOT_FOUND');
    }
    await ctx.db.patch('assistantActions', args.actionId, {
      status: args.status,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const setThreadCompleted = internalMutation({
  args: {
    assistantThreadId: v.id('assistantThreads'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('assistantThreads', args.assistantThreadId, {
      threadStatus: 'completed',
      errorMessage: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setThreadError = internalMutation({
  args: {
    assistantThreadId: v.id('assistantThreads'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('assistantThreads', args.assistantThreadId, {
      threadStatus: 'error',
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
    return null;
  },
});
