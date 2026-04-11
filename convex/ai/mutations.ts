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
  canEditThread,
  canViewThread,
  getAssistantThreadRow,
  requireOrgForAssistant,
} from './lib';

type ConfirmedActionEntityType =
  | 'document'
  | 'issue'
  | 'project'
  | 'team'
  | 'folder';

type ConfirmedActionResult = {
  actionId: string;
  kind: 'delete_entity' | 'bulk_delete_entities' | 'send_email';
  summary: string;
  entityType?: ConfirmedActionEntityType;
  entityLabel?: string;
};

type ExecutedPendingAction = {
  id: string;
  kind: 'delete_entity' | 'bulk_delete_entities' | 'send_email';
  summary: string;
  entityType?: ConfirmedActionEntityType;
  entityLabel?: string;
};

// --- Active thread helpers ---

async function getOrCreateUserState(
  ctx: any,
  organizationId: any,
  userId: any,
) {
  const existing = await ctx.db
    .query('assistantUserState')
    .withIndex('by_org_user', (q: any) =>
      q.eq('organizationId', organizationId).eq('userId', userId),
    )
    .first();
  if (existing) return existing;

  const id = await ctx.db.insert('assistantUserState', {
    organizationId,
    userId,
    activeThreadId: undefined,
  });
  return await ctx.db.get('assistantUserState', id);
}

async function resolveActiveThread(ctx: any, organizationId: any, userId: any) {
  const userState = await ctx.db
    .query('assistantUserState')
    .withIndex('by_org_user', (q: any) =>
      q.eq('organizationId', organizationId).eq('userId', userId),
    )
    .first();

  if (userState?.activeThreadId) {
    const thread = await ctx.db.get(
      'assistantThreads',
      userState.activeThreadId,
    );
    if (thread && (await canViewThread(ctx, thread, userId))) {
      return thread;
    }
  }

  // Fallback: legacy single thread
  return await getAssistantThreadRow(ctx, organizationId, userId);
}

// --- Thread CRUD ---

export const createThread = mutation({
  args: {
    orgSlug: v.string(),
    title: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      userId,
    );

    const title = args.title || 'New Thread';
    const visibility = args.visibility ?? 'private';

    const { threadId } = await assistantAgent.createThread(ctx, {
      userId,
      title,
    });

    const rowId = await ctx.db.insert('assistantThreads', {
      organizationId: organization._id,
      userId,
      threadId,
      updatedAt: Date.now(),
      threadStatus: 'idle',
      title,
      visibility,
      createdBy: userId,
    });

    // Set as active thread
    const userState = await getOrCreateUserState(ctx, organization._id, userId);
    await ctx.db.patch('assistantUserState', userState._id, {
      activeThreadId: rowId,
    });

    return await ctx.db.get('assistantThreads', rowId);
  },
});

export const setActiveThread = mutation({
  args: {
    orgSlug: v.string(),
    threadId: v.id('assistantThreads'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      userId,
    );

    const thread = await ctx.db.get('assistantThreads', args.threadId);
    if (!thread || !(await canViewThread(ctx, thread, userId))) {
      throw new ConvexError('THREAD_NOT_FOUND');
    }

    const userState = await getOrCreateUserState(ctx, organization._id, userId);
    await ctx.db.patch('assistantUserState', userState._id, {
      activeThreadId: args.threadId,
    });

    return thread;
  },
});

export const updateThread = mutation({
  args: {
    threadId: v.id('assistantThreads'),
    title: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal('private'),
        v.literal('organization'),
        v.literal('public'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const thread = await ctx.db.get('assistantThreads', args.threadId);
    if (!thread || !(await canEditThread(ctx, thread, userId))) {
      throw new ConvexError('THREAD_NOT_FOUND');
    }

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.visibility !== undefined) patch.visibility = args.visibility;

    await ctx.db.patch('assistantThreads', args.threadId, patch);
    return await ctx.db.get('assistantThreads', args.threadId);
  },
});

export const addThreadMember = mutation({
  args: {
    threadId: v.id('assistantThreads'),
    userId: v.id('users'),
    role: v.union(
      v.literal('viewer'),
      v.literal('commenter'),
      v.literal('editor'),
    ),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireAuthUserId(ctx);
    const thread = await ctx.db.get('assistantThreads', args.threadId);
    if (!thread || !(await canEditThread(ctx, thread, currentUserId))) {
      throw new ConvexError('THREAD_NOT_FOUND');
    }

    // Check if already a member
    const existing = await ctx.db
      .query('threadMembers')
      .withIndex('by_thread_user', q =>
        q.eq('threadId', args.threadId).eq('userId', args.userId),
      )
      .first();

    if (existing) {
      await ctx.db.patch('threadMembers', existing._id, { role: args.role });
      return existing._id;
    }

    return await ctx.db.insert('threadMembers', {
      threadId: args.threadId,
      userId: args.userId,
      role: args.role,
      addedBy: currentUserId,
      addedAt: Date.now(),
    });
  },
});

export const removeThreadMember = mutation({
  args: {
    threadId: v.id('assistantThreads'),
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireAuthUserId(ctx);
    const thread = await ctx.db.get('assistantThreads', args.threadId);
    if (!thread || !(await canEditThread(ctx, thread, currentUserId))) {
      throw new ConvexError('THREAD_NOT_FOUND');
    }

    const membership = await ctx.db
      .query('threadMembers')
      .withIndex('by_thread_user', q =>
        q.eq('threadId', args.threadId).eq('userId', args.userId),
      )
      .first();

    if (membership) {
      await ctx.db.delete('threadMembers', membership._id);
    }
    return null;
  },
});

export const updateThreadMemberRole = mutation({
  args: {
    threadId: v.id('assistantThreads'),
    userId: v.id('users'),
    role: v.union(
      v.literal('viewer'),
      v.literal('commenter'),
      v.literal('editor'),
    ),
  },
  handler: async (ctx, args) => {
    const currentUserId = await requireAuthUserId(ctx);
    const thread = await ctx.db.get('assistantThreads', args.threadId);
    if (!thread || !(await canEditThread(ctx, thread, currentUserId))) {
      throw new ConvexError('THREAD_NOT_FOUND');
    }

    const membership = await ctx.db
      .query('threadMembers')
      .withIndex('by_thread_user', q =>
        q.eq('threadId', args.threadId).eq('userId', args.userId),
      )
      .first();

    if (!membership) {
      throw new ConvexError('MEMBER_NOT_FOUND');
    }

    await ctx.db.patch('threadMembers', membership._id, { role: args.role });
    return null;
  },
});

export const deleteThread = mutation({
  args: {
    threadId: v.id('assistantThreads'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const thread = await ctx.db.get('assistantThreads', args.threadId);
    if (!thread || !(await canEditThread(ctx, thread, userId))) {
      throw new ConvexError('THREAD_NOT_FOUND');
    }

    // Delete thread members
    const members = await ctx.db
      .query('threadMembers')
      .withIndex('by_thread', q => q.eq('threadId', args.threadId))
      .collect();
    for (const member of members) {
      await ctx.db.delete('threadMembers', member._id);
    }

    // Clear activeThreadId for any user state pointing to this thread
    // (we search by org to limit scope)
    const userStates = await ctx.db
      .query('assistantUserState')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', thread.organizationId),
      )
      .collect();
    for (const state of userStates) {
      if (state.activeThreadId === args.threadId) {
        await ctx.db.patch('assistantUserState', state._id, {
          activeThreadId: undefined,
        });
      }
    }

    // Schedule agent component data cleanup
    await ctx.scheduler.runAfter(0, internal.ai.actions.cleanupThreadData, {
      threadId: thread.threadId,
    });

    // Delete the app-level row
    await ctx.db.delete('assistantThreads', args.threadId);

    return null;
  },
});

// --- Existing mutations (updated) ---

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

    // Try to use the active thread
    const active = await resolveActiveThread(ctx, organization._id, userId);
    if (active) {
      await ctx.db.patch('assistantThreads', active._id, {
        updatedAt: Date.now(),
        ...buildAssistantThreadPatch(args.pageContext),
      });
      return active;
    }

    // No active thread — create one
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
      title: 'Vector Assistant',
      visibility: 'private',
      createdBy: userId,
      ...buildAssistantThreadPatch(args.pageContext),
    });

    // Set as active
    const userState = await getOrCreateUserState(ctx, organization._id, userId);
    await ctx.db.patch('assistantUserState', userState._id, {
      activeThreadId: rowId,
    });

    return await ctx.db.get('assistantThreads', rowId);
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {
    orgSlug: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireOrgForAssistant(ctx, args.orgSlug, userId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const sendMessage = mutation({
  args: {
    orgSlug: v.string(),
    pageContext: assistantPageContextValidator,
    prompt: v.string(),
    threadId: v.optional(v.id('assistantThreads')),
    model: v.optional(v.string()),
    thinkingLevel: v.optional(
      v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    ),
    skipConfirmations: v.optional(v.boolean()),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id('_storage'),
          filename: v.optional(v.string()),
          mediaType: v.string(),
        }),
      ),
    ),
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
    const attachments = args.attachments ?? [];
    if (!prompt && attachments.length === 0) {
      throw new ConvexError('PROMPT_REQUIRED');
    }

    // Resolve which thread to use
    let row = args.threadId
      ? await ctx.db.get('assistantThreads', args.threadId)
      : await resolveActiveThread(ctx, organization._id, userId);

    // Verify access if we got a specific thread
    if (row && !(await canViewThread(ctx, row, userId))) {
      row = null;
    }

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
        title: 'New Thread',
        visibility: 'private',
        createdBy: userId,
        ...buildAssistantThreadPatch(args.pageContext),
      });
      row = await ctx.db.get('assistantThreads', rowId);

      // Set as active
      const userState = await getOrCreateUserState(
        ctx,
        organization._id,
        userId,
      );
      await ctx.db.patch('assistantUserState', userState._id, {
        activeThreadId: rowId,
      });
    }

    if (!row) {
      throw new ConvexError('THREAD_CREATE_FAILED');
    }

    const content: Array<
      | { type: 'text'; text: string }
      | {
          type: 'image';
          image: URL;
          mediaType: string;
        }
      | {
          type: 'file';
          data: URL;
          mediaType: string;
          filename?: string;
        }
    > = [];

    if (prompt) {
      content.push({ type: 'text', text: prompt });
    }

    for (const attachment of attachments) {
      const url = await ctx.storage.getUrl(attachment.storageId);
      if (!url) {
        throw new ConvexError(
          `ATTACHMENT_NOT_FOUND:${String(attachment.storageId)}`,
        );
      }

      if (attachment.mediaType.startsWith('image/')) {
        content.push({
          type: 'image',
          image: new URL(url),
          mediaType: attachment.mediaType,
        });
      } else {
        content.push({
          type: 'file',
          data: new URL(url),
          mediaType: attachment.mediaType,
          filename: attachment.filename,
        });
      }
    }

    const saved = await saveMessage(ctx, components.agent, {
      threadId: row.threadId,
      userId,
      message:
        content.length === 1 && content[0]?.type === 'text'
          ? {
              role: 'user',
              content: content[0].text,
            }
          : {
              role: 'user',
              content,
            },
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
      promptText: prompt || undefined,
      model: args.model?.trim() || undefined,
      thinkingLevel: args.thinkingLevel,
      skipConfirmations: args.skipConfirmations,
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
    kind: v.union(
      v.literal('delete_entity'),
      v.literal('bulk_delete_entities'),
      v.literal('send_email'),
    ),
    summary: v.string(),
    entityType: v.optional(
      v.union(
        v.literal('document'),
        v.literal('issue'),
        v.literal('project'),
        v.literal('team'),
        v.literal('folder'),
      ),
    ),
    entityLabel: v.optional(v.string()),
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

    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      userId,
    );
    const row = await resolveActiveThread(ctx, organization._id, userId);

    if (row) {
      await saveMessage(ctx, components.agent, {
        threadId: row.threadId,
        userId,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text:
                executed.kind === 'send_email'
                  ? `Confirmed and sent: ${executed.summary}.`
                  : `Confirmed and completed: ${executed.summary}.`,
            },
          ],
        },
      });
    }

    return {
      actionId: executed.id,
      kind: executed.kind,
      summary: executed.summary,
      entityType: executed.entityType,
      entityLabel: executed.entityLabel,
    };
  },
});

export const cancelPendingAction = mutation({
  args: {
    orgSlug: v.string(),
    actionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await ctx.runMutation(internal.ai.internal.clearPendingAction, {
      orgSlug: args.orgSlug,
      userId,
      actionId: args.actionId,
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
    const row = await ctx.db.get('assistantThreads', args.assistantThreadId);
    if (!row) return null; // Thread was cleared while generating
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
    const row = await ctx.db.get('assistantThreads', args.assistantThreadId);
    if (!row) return null; // Thread was cleared while generating
    await ctx.db.patch('assistantThreads', args.assistantThreadId, {
      threadStatus: 'error',
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// --- Migration backfill ---

export const backfillThreadFields = internalMutation({
  args: {},
  returns: v.number(),
  handler: async ctx => {
    const threads = await ctx.db.query('assistantThreads').collect();
    let patched = 0;
    for (const thread of threads) {
      if (thread.createdBy === undefined) {
        await ctx.db.patch('assistantThreads', thread._id, {
          createdBy: thread.userId,
          visibility: 'private',
          title: thread.title ?? 'Vector Assistant',
        });
        patched++;
      }
    }
    return patched;
  },
});
