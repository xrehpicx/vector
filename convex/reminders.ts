import { ConvexError, v } from 'convex/values';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { canEditRequest, canViewRequest } from './requests/lib';
import {
  createNotificationEvent,
  getIssueHref,
  getRequestHref,
} from './notifications/lib';
import {
  reminderCadenceValidator,
  reminderRecipientPolicyValidator,
  reminderTargetTypeValidator,
} from './_shared/work';
import { requireMessageAccess } from './collaboration/helpers';
import { requireOrganization, requireUser, requireWork } from './work/lib';

type LocalDate = { year: number; month: number; day: number };

function localDateParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function addLocalDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function localWeekday(date: LocalDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function localDateTimeToTimestamp(
  date: LocalDate,
  hour: number,
  minute: number,
  timezone: string,
) {
  const wallClockAsUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    hour,
    minute,
  );
  let candidate = wallClockAsUtc;

  // Convert an IANA-zone wall clock to an instant. Rechecking the offset makes
  // this work on both sides of daylight-saving transitions.
  for (let index = 0; index < 4; index += 1) {
    const local = localDateParts(candidate, timezone);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const next = wallClockAsUtc - (localAsUtc - candidate);
    if (Math.abs(next - candidate) < 1_000) return next;
    candidate = next;
  }
  return candidate;
}

export function nextOccurrence(
  rule: Doc<'reminderRules'>,
  scheduledFor: number,
) {
  if (rule.cadence === 'once') return null;
  const timeMatch = /^(\d{2}):(\d{2})/.exec(rule.localTime);
  if (!timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const interval =
    rule.cadence === 'weekly'
      ? 7
      : rule.cadence === 'custom_days'
        ? Math.max(1, rule.intervalDays ?? 1)
        : 1;
  let date = addLocalDays(
    localDateParts(scheduledFor, rule.timezone),
    interval,
  );
  if (rule.cadence === 'weekdays') {
    while ([0, 6].includes(localWeekday(date))) date = addLocalDays(date, 1);
  }
  return localDateTimeToTimestamp(date, hour, minute, rule.timezone);
}

export function nextFutureOccurrence(
  rule: Doc<'reminderRules'>,
  scheduledFor: number,
  now: number,
) {
  let next = nextOccurrence(rule, scheduledFor);
  while (next !== null && next <= now) {
    next = nextOccurrence(rule, next);
  }
  return next;
}

async function targetContext(ctx: MutationCtx, rule: Doc<'reminderRules'>) {
  if (rule.targetType === 'request' && rule.requestId) {
    const request = await ctx.db.get('requests', rule.requestId);
    if (!request) return null;
    return {
      completed: ['completed', 'declined', 'duplicate'].includes(
        request.status,
      ),
      updatedAt: request.updatedAt,
      request,
      work: null,
      task: null,
      message: null,
      channel: null,
    };
  }
  if (rule.targetType === 'work' && rule.workId) {
    const work = await ctx.db.get('issues', rule.workId);
    if (!work) return null;
    return {
      completed: ['completed', 'canceled'].includes(work.workStatus ?? ''),
      updatedAt:
        work.lastMeaningfulActivityAt ?? work.updatedAt ?? work._creationTime,
      request: null,
      work,
      task: null,
      message: null,
      channel: null,
    };
  }
  if (rule.targetType === 'task' && rule.taskId) {
    const task = await ctx.db.get('tasks', rule.taskId);
    if (!task) return null;
    const work = await ctx.db.get('issues', task.workId);
    return {
      completed: ['done', 'canceled'].includes(task.status),
      updatedAt: task.updatedAt,
      request: null,
      work,
      task,
      message: null,
      channel: null,
    };
  }
  if (rule.targetType === 'message' && rule.messageId) {
    const message = await ctx.db.get('channelMessages', rule.messageId);
    if (!message) return null;
    const channel = await ctx.db.get('channels', message.channelId);
    if (!channel) return null;
    return {
      completed: message.deletedAt !== undefined,
      updatedAt: message.editedAt ?? message.createdAt,
      request: null,
      work: null,
      task: null,
      message,
      channel,
    };
  }
  return null;
}

async function resolveRecipients(
  ctx: MutationCtx,
  rule: Doc<'reminderRules'>,
  target: NonNullable<Awaited<ReturnType<typeof targetContext>>>,
) {
  const recipients = new Set<Id<'users'>>();
  for (const policy of rule.recipientPolicies) {
    if (policy === 'requester' && target.request?.requesterId)
      recipients.add(target.request.requesterId);
    if (policy === 'request_owner' && target.request?.ownerId)
      recipients.add(target.request.ownerId);
    if (policy === 'work_owner' && target.work?.ownerId)
      recipients.add(target.work.ownerId);
    if (policy === 'work_creator' && target.work?.createdBy)
      recipients.add(target.work.createdBy);
    if (policy === 'task_assignee' && target.task?.assigneeId)
      recipients.add(target.task.assigneeId);
    if (policy === 'watchers' && target.request) {
      const watchers = await ctx.db
        .query('requestRecipients')
        .withIndex('by_request', q => q.eq('requestId', target.request!._id))
        .collect();
      for (const watcher of watchers.filter(row => row.role === 'watcher'))
        recipients.add(watcher.userId);
    }
    if (policy === 'reminder_creator') recipients.add(rule.createdBy);
  }
  return Array.from(recipients);
}

export const listForTarget = query({
  args: {
    orgSlug: v.string(),
    requestId: v.optional(v.id('requests')),
    workId: v.optional(v.id('issues')),
    taskId: v.optional(v.id('tasks')),
    messageId: v.optional(v.id('channelMessages')),
  },
  handler: async (ctx, args) => {
    const { organization } = await requireOrganization(ctx, args.orgSlug);
    const ids = [
      args.requestId,
      args.workId,
      args.taskId,
      args.messageId,
    ].filter(Boolean);
    if (ids.length !== 1)
      throw new ConvexError('EXACTLY_ONE_REMINDER_TARGET_REQUIRED');
    if (args.requestId) {
      const request = await ctx.db.get('requests', args.requestId);
      if (
        !request ||
        request.organizationId !== organization._id ||
        !(await canViewRequest(ctx, request))
      ) {
        throw new ConvexError('REQUEST_NOT_FOUND');
      }
    } else if (args.workId) {
      const work = await requireWork(ctx, args.workId, 'view');
      if (work.organizationId !== organization._id)
        throw new ConvexError('WORK_NOT_FOUND');
    } else if (args.taskId) {
      const task = await ctx.db.get('tasks', args.taskId);
      if (!task || task.organizationId !== organization._id)
        throw new ConvexError('TASK_NOT_FOUND');
      await requireWork(ctx, task.workId, 'view');
    } else if (args.messageId) {
      const { channel } = await requireMessageAccess(ctx, args.messageId);
      if (channel.organizationId !== organization._id)
        throw new ConvexError('MESSAGE_NOT_FOUND');
    }
    if (args.requestId)
      return await ctx.db
        .query('reminderRules')
        .withIndex('by_request', q => q.eq('requestId', args.requestId))
        .collect();
    if (args.workId)
      return await ctx.db
        .query('reminderRules')
        .withIndex('by_work', q => q.eq('workId', args.workId))
        .collect();
    if (args.taskId)
      return await ctx.db
        .query('reminderRules')
        .withIndex('by_task', q => q.eq('taskId', args.taskId))
        .collect();
    return await ctx.db
      .query('reminderRules')
      .withIndex('by_message', q => q.eq('messageId', args.messageId))
      .collect();
  },
});

export const create = mutation({
  args: {
    orgSlug: v.string(),
    targetType: reminderTargetTypeValidator,
    requestId: v.optional(v.id('requests')),
    workId: v.optional(v.id('issues')),
    taskId: v.optional(v.id('tasks')),
    messageId: v.optional(v.id('channelMessages')),
    recipientPolicies: v.array(reminderRecipientPolicyValidator),
    cadence: reminderCadenceValidator,
    intervalDays: v.optional(v.number()),
    localTime: v.string(),
    timezone: v.string(),
    inactivityHours: v.optional(v.number()),
    firstFireAt: v.number(),
  },
  returns: v.object({ reminderRuleId: v.id('reminderRules') }),
  handler: async (ctx, args) => {
    const { organization, userId } = await requireOrganization(
      ctx,
      args.orgSlug,
    );
    const ids = [
      args.requestId,
      args.workId,
      args.taskId,
      args.messageId,
    ].filter(Boolean);
    if (ids.length !== 1)
      throw new ConvexError('EXACTLY_ONE_REMINDER_TARGET_REQUIRED');
    if (args.targetType === 'request' && args.requestId) {
      const request = await ctx.db.get('requests', args.requestId);
      if (
        !request ||
        request.organizationId !== organization._id ||
        !(await canEditRequest(ctx, request))
      )
        throw new ConvexError('REQUEST_NOT_FOUND');
    } else if (args.targetType === 'work' && args.workId) {
      const work = await requireWork(ctx, args.workId, 'edit');
      if (work.organizationId !== organization._id)
        throw new ConvexError('WORK_NOT_FOUND');
    } else if (args.targetType === 'task' && args.taskId) {
      const task = await ctx.db.get('tasks', args.taskId);
      if (!task || task.organizationId !== organization._id)
        throw new ConvexError('TASK_NOT_FOUND');
      await requireWork(ctx, task.workId, 'edit');
    } else if (args.targetType === 'message' && args.messageId) {
      const { channel } = await requireMessageAccess(ctx, args.messageId);
      if (channel.organizationId !== organization._id)
        throw new ConvexError('MESSAGE_NOT_FOUND');
    } else throw new ConvexError('REMINDER_TARGET_MISMATCH');
    const recipientPolicies = Array.from(new Set(args.recipientPolicies));
    if (recipientPolicies.length === 0)
      throw new ConvexError('RECIPIENT_POLICY_REQUIRED');
    const applicablePolicies = new Set(
      args.targetType === 'request'
        ? ['requester', 'request_owner', 'watchers']
        : args.targetType === 'task'
          ? ['task_assignee', 'work_owner', 'work_creator']
          : args.targetType === 'message'
            ? ['reminder_creator']
            : ['work_owner', 'work_creator'],
    );
    if (recipientPolicies.some(policy => !applicablePolicies.has(policy)))
      throw new ConvexError('INCOMPATIBLE_RECIPIENT_POLICY');
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(args.localTime))
      throw new ConvexError('INVALID_REMINDER_LOCAL_TIME');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: args.timezone }).format();
    } catch {
      throw new ConvexError('INVALID_REMINDER_TIMEZONE');
    }
    if (
      args.cadence === 'custom_days' &&
      (!Number.isInteger(args.intervalDays) || (args.intervalDays ?? 0) < 1)
    )
      throw new ConvexError('INVALID_REMINDER_INTERVAL');
    if (
      args.inactivityHours !== undefined &&
      (!Number.isFinite(args.inactivityHours) || args.inactivityHours <= 0)
    )
      throw new ConvexError('INVALID_INACTIVITY_HOURS');
    if (args.firstFireAt <= Date.now())
      throw new ConvexError('REMINDER_MUST_BE_IN_FUTURE');
    const now = Date.now();
    const reminderRuleId = await ctx.db.insert('reminderRules', {
      organizationId: organization._id,
      targetType: args.targetType,
      requestId: args.requestId,
      workId: args.workId,
      taskId: args.taskId,
      messageId: args.messageId,
      recipientPolicies,
      cadence: args.cadence,
      intervalDays: args.intervalDays,
      localTime: args.localTime,
      timezone: args.timezone,
      inactivityHours: args.inactivityHours,
      enabled: true,
      nextFireAt: args.firstFireAt,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    return { reminderRuleId };
  },
});

export const setEnabled = mutation({
  args: { reminderRuleId: v.id('reminderRules'), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rule = await ctx.db.get('reminderRules', args.reminderRuleId);
    if (!rule || rule.createdBy !== userId)
      throw new ConvexError('REMINDER_NOT_FOUND');
    await ctx.db.patch('reminderRules', rule._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
    return { success: true } as const;
  },
});

export const processRule = internalMutation({
  args: {
    reminderRuleId: v.id('reminderRules'),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rule = await ctx.db.get('reminderRules', args.reminderRuleId);
    // A delayed or duplicated scheduler job must not fire a newer occurrence.
    if (
      !rule ||
      !rule.enabled ||
      rule.nextFireAt !== args.scheduledFor ||
      rule.nextFireAt > now
    ) {
      return { processed: false } as const;
    }

    const target = await targetContext(ctx, rule);
    if (!target || target.completed) {
      await ctx.db.patch('reminderRules', rule._id, {
        enabled: false,
        updatedAt: now,
      });
      return { processed: true, disabled: true } as const;
    }

    if (
      rule.inactivityHours &&
      now - target.updatedAt < rule.inactivityHours * 60 * 60 * 1000
    ) {
      const next =
        nextFutureOccurrence(rule, rule.nextFireAt, now) ??
        Math.max(
          now + 1,
          target.updatedAt + rule.inactivityHours * 60 * 60 * 1000,
        );
      await ctx.db.patch('reminderRules', rule._id, {
        nextFireAt: next,
        updatedAt: now,
      });
      return { processed: true, deferred: true } as const;
    }

    const dedupeKey = `reminder:${rule._id}:${rule.nextFireAt}`;
    const prior = await ctx.db
      .query('reminderOccurrences')
      .withIndex('by_dedupe_key', q => q.eq('dedupeKey', dedupeKey))
      .first();
    if (!prior) {
      const recipients = await resolveRecipients(ctx, rule, target);
      const org = await ctx.db.get('organizations', rule.organizationId);
      const href =
        target.request && org
          ? getRequestHref(org.slug, target.request.key)
          : target.work && org
            ? getIssueHref(org.slug, target.work.key)
            : target.message && target.channel && org
              ? `/${org.slug}/channels/${target.channel.slug}?message=${target.message._id}`
              : undefined;
      await createNotificationEvent(ctx, {
        type: 'reminder_due',
        organizationId: rule.organizationId,
        requestId: target.request?._id,
        issueId: target.work?._id,
        taskId: target.task?._id,
        payload: {
          requestKey: target.request?.key,
          requestTitle: target.request?.title,
          workKey: target.work?.key,
          workTitle: target.work?.title,
          taskTitle: target.task?.title,
          channelName: target.channel?.name,
          messagePreview:
            target.message?.body.trim().slice(0, 180) ||
            'Open the message in its channel.',
          href,
        },
        recipients: recipients.map(userId => ({ userId })),
        dedupeKey,
      });
      await ctx.db.insert('reminderOccurrences', {
        reminderRuleId: rule._id,
        scheduledFor: rule.nextFireAt,
        firedAt: now,
        recipientUserIds: recipients,
        dedupeKey,
      });
    }

    const next = nextFutureOccurrence(rule, rule.nextFireAt, now);
    await ctx.db.patch('reminderRules', rule._id, {
      enabled: next !== null,
      nextFireAt: next ?? rule.nextFireAt,
      lastFiredAt: now,
      updatedAt: now,
    });
    return { processed: true, notified: !prior } as const;
  },
});

export const processDue = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();
    const rules = await ctx.db
      .query('reminderRules')
      .withIndex('by_enabled_next_fire', q =>
        q.eq('enabled', true).lte('nextFireAt', now),
      )
      .take(50);
    for (const rule of rules) {
      // Each rule runs in its own transaction. A malformed target or a
      // notification delivery failure can be retried without rolling back the
      // other due reminders in this batch.
      await ctx.scheduler.runAfter(0, internal.reminders.processRule, {
        reminderRuleId: rule._id,
        scheduledFor: rule.nextFireAt,
      });
    }
    if (rules.length === 50) {
      await ctx.scheduler.runAfter(1_000, internal.reminders.processDue, {});
    }
    return { scheduled: rules.length };
  },
});
