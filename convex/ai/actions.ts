import { generateText } from 'ai';
import { saveMessage } from '@convex-dev/agent';
import { ConvexError, v } from 'convex/values';
import { api, components, internal } from '../_generated/api';
import { action, internalAction } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { assistantAgent } from './agent';
import { assistantPageContextValidator } from './lib';
import {
  assertAssistantModelConfigured,
  defaultAssistantModel,
  openrouterChatWithAnnotations,
} from './provider';

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
    threadId: v.optional(v.id('assistantThreads')),
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

    let row;
    if (args.threadId) {
      row = await ctx.runQuery(api.ai.queries.getThreadById, {
        threadId: args.threadId,
      });
    } else {
      row = await ctx.runQuery(
        internal.ai.internal.getAssistantThreadForAuthUser,
        {
          orgSlug: args.orgSlug,
          authUserId: authUser.userId,
        },
      );
    }

    if (!row) {
      return null;
    }

    await ctx.runMutation(internal.ai.internal.deleteAssistantThreadRow, {
      assistantThreadId: row._id,
    });

    try {
      await ctx.runAction(components.agent.threads.deleteAllForThreadIdSync, {
        threadId: row.threadId,
      });
    } catch (error) {
      console.error('[clearThreadHistory] component cleanup error:', error);
    }

    return { deleted: true };
  },
});

export const cleanupThreadData = internalAction({
  args: {
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runAction(components.agent.threads.deleteAllForThreadIdSync, {
        threadId: args.threadId,
      });
    } catch (error) {
      console.error('[cleanupThreadData] component cleanup error:', error);
    }
    return null;
  },
});

export const autoTitleThread = internalAction({
  args: {
    assistantThreadId: v.id('assistantThreads'),
    firstUserMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      assertAssistantModelConfigured();

      const model = openrouterChatWithAnnotations(defaultAssistantModel, {});
      const result = await generateText({
        model,
        system:
          'Generate a very short title (3-6 words, no quotes) for an assistant conversation thread based on the first user message. Just output the title, nothing else.',
        prompt: args.firstUserMessage,
      });

      const title =
        result.text
          ?.trim()
          .replace(/^["']|["']$/g, '')
          .slice(0, 80) || null;
      if (title) {
        await ctx.runMutation(internal.ai.internal.setThreadTitle, {
          assistantThreadId: args.assistantThreadId,
          title,
        });
      }
    } catch (error) {
      console.error('[autoTitleThread] error:', error);
    }
    return null;
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
    promptText: v.optional(v.string()),
    model: v.optional(v.string()),
    thinkingLevel: v.optional(
      v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    ),
    skipConfirmations: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      assertAssistantModelConfigured();
      // Check admin-configured default, then env var default
      let selectedModel = args.model?.trim();
      if (!selectedModel) {
        const adminDefault = await ctx.runQuery(
          internal.platformAdmin.queries.getDefaultAssistantModel,
          {},
        );
        selectedModel = adminDefault || defaultAssistantModel;
      }

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
        skipConfirmations: args.skipConfirmations ?? false,
      });

      // Build provider options for thinking/reasoning budget
      const thinkingBudgets: Record<string, number> = {
        low: 1024,
        medium: 4096,
        high: 16384,
      };
      const providerOptions = args.thinkingLevel
        ? {
            openrouter: {
              reasoning: {
                effort: args.thinkingLevel,
                ...(thinkingBudgets[args.thinkingLevel]
                  ? { max_tokens: thinkingBudgets[args.thinkingLevel] }
                  : {}),
              },
            },
          }
        : undefined;

      const stream = await assistantAgent.streamText(
        assistantCtx,
        {
          threadId: args.threadId,
          userId: args.userId,
        },
        {
          model: openrouterChatWithAnnotations(selectedModel, {
            parallelToolCalls: false,
          }),
          promptMessageId: args.promptMessageId,
          system: buildSystemPrompt(
            pageContextSummary,
            currentUserContextSummary,
            currentUserDeviceContextSummary,
          ),
          providerOptions,
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

      // Auto-title: check if thread still has default title and schedule titling
      if (args.promptText) {
        const threadRow = await ctx.runQuery(
          internal.ai.internal.getAssistantThreadRowById,
          { assistantThreadId: args.assistantThreadId },
        );
        if (
          threadRow &&
          (!threadRow.title ||
            threadRow.title === 'Vector Assistant' ||
            threadRow.title === 'New Thread')
        ) {
          await ctx.scheduler.runAfter(0, internal.ai.actions.autoTitleThread, {
            assistantThreadId: args.assistantThreadId,
            firstUserMessage: args.promptText,
          });
        }
      }
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
