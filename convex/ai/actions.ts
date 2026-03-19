import { saveMessage } from '@convex-dev/agent';
import { ConvexError, v } from 'convex/values';
import { api, components, internal } from '../_generated/api';
import { action, internalAction } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { assistantAgent } from './agent';
import { assistantPageContextValidator } from './lib';
import { assertAssistantModelConfigured } from './provider';

function buildSystemPrompt(
  pageContextSummary: string,
  currentUserContextSummary: string,
  currentUserDeviceContextSummary: string,
) {
  return [
    currentUserContextSummary,
    currentUserDeviceContextSummary,
    `The user is currently viewing: ${pageContextSummary}.`,
    'Use this as the default target whenever the user does not provide explicit identifiers.',
  ].join('\n');
}

function sanitizeAssistantError(error: unknown) {
  if (
    error instanceof Error &&
    /auth|required|unauthorized/i.test(error.message)
  ) {
    return 'Assistant session was not available. Refresh and try again.';
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 240);
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim().slice(0, 240);
  }
  return 'Assistant response failed. Please try again.';
}

export const clearThreadHistory = action({
  args: {
    orgSlug: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      deleted: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const authUser = await ctx.runQuery(api.auth.getCurrentAuthUser, {});
    if (!authUser?.userId) {
      throw new ConvexError('AUTH_REQUIRED');
    }

    const row = await ctx.runQuery(
      internal.ai.internal.getAssistantThreadForAuthUser,
      {
        orgSlug: args.orgSlug,
        authUserId: authUser.userId,
      },
    );

    if (!row) {
      return null;
    }

    // Delete the app-level thread row first so the UI immediately sees it as gone
    // and so any in-flight generateResponse can no longer update it.
    await ctx.runMutation(internal.ai.internal.deleteAssistantThreadRow, {
      assistantThreadId: row._id,
    });

    // Now clean up the agent component data (messages, thread record, streams).
    // deleteAllForThreadIdSync handles messages + thread deletion + streams
    // in one call, so we don't need to call deleteAllStreamsForThreadIdSync separately.
    try {
      await ctx.runAction(components.agent.threads.deleteAllForThreadIdSync, {
        threadId: row.threadId,
      });
    } catch (error) {
      // Best-effort cleanup — the app-level row is already deleted,
      // so the user won't see the old conversation. Component data
      // will be orphaned but harmless.
      console.error('[clearThreadHistory] component cleanup error:', error);
    }

    return { deleted: true };
  },
});

export const generateResponse = internalAction({
  args: {
    assistantThreadId: v.id('assistantThreads'),
    orgSlug: v.string(),
    userId: v.id('users'),
    threadId: v.string(),
    promptMessageId: v.string(),
    pageContext: assistantPageContextValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      assertAssistantModelConfigured();

      const organization = await ctx.runQuery(
        internal.ai.internal.getAssistantOrganization,
        {
          orgSlug: args.orgSlug,
          userId: args.userId,
        },
      );
      if (!organization) {
        return null;
      }

      const pageContextSummary = await ctx.runQuery(
        internal.ai.internal.getPageContextSummary,
        {
          orgSlug: args.orgSlug,
          userId: args.userId,
          pageContext: args.pageContext,
        },
      );
      const currentUserContextSummary = await ctx.runQuery(
        internal.ai.internal.getCurrentUserContextSummary,
        {
          orgSlug: args.orgSlug,
          userId: args.userId,
        },
      );
      const currentUserDeviceContextSummary = await ctx.runQuery(
        internal.ai.internal.getCurrentUserDeviceContextSummary,
        {
          orgSlug: args.orgSlug,
          userId: args.userId,
        },
      );

      const assistantCtx = Object.assign({}, ctx, {
        organizationId: organization._id as Id<'organizations'>,
        userId: args.userId,
        assistantThreadId: args.assistantThreadId,
        currentPageContext: args.pageContext,
      });

      const stream = await assistantAgent.streamText(
        assistantCtx,
        {
          threadId: args.threadId,
          userId: args.userId,
        },
        {
          promptMessageId: args.promptMessageId,
          system: buildSystemPrompt(
            pageContextSummary,
            currentUserContextSummary,
            currentUserDeviceContextSummary,
          ),
          onError(error: unknown) {
            console.error('[ai.generateResponse] stream error', error);
          },
        },
        {
          saveStreamDeltas: {
            chunking: 'word',
            throttleMs: 750,
          },
        },
      );

      await stream.consumeStream();

      await ctx.runMutation(internal.ai.mutations.setThreadCompleted, {
        assistantThreadId: args.assistantThreadId,
      });
    } catch (error) {
      const errorMessage = sanitizeAssistantError(error);
      await ctx.runMutation(internal.ai.mutations.setThreadError, {
        assistantThreadId: args.assistantThreadId,
        errorMessage,
      });

      if (args.threadId) {
        await saveMessage(ctx, components.agent, {
          threadId: args.threadId,
          userId: args.userId,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: errorMessage,
              },
            ],
          },
        });
      }
    }
    return null;
  },
});
