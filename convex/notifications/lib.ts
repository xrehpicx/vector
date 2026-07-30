import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import {
  NOTIFICATION_CATEGORIES,
  categoryForEvent,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategory,
  type NotificationEventType,
} from './shared';

type NotificationPayload = {
  organizationName?: string;
  issueKey?: string;
  issueTitle?: string;
  requestKey?: string;
  requestTitle?: string;
  workKey?: string;
  workTitle?: string;
  taskTitle?: string;
  channelName?: string;
  messagePreview?: string;
  commentPreview?: string;
  inviterName?: string;
  roleLabel?: string;
  href?: string;
  subjectUserName?: string;
  statusLabel?: string;
  statusText?: string;
  statusEmoji?: string;
};

type NotificationRecipientInput = {
  userId?: Id<'users'>;
  email?: string;
};

export type NotificationEventWrite = {
  type: NotificationEventType;
  actorId?: Id<'users'>;
  organizationId?: Id<'organizations'>;
  issueId?: Id<'issues'>;
  requestId?: Id<'requests'>;
  taskId?: Id<'tasks'>;
  projectId?: Id<'projects'>;
  teamId?: Id<'teams'>;
  invitationId?: Id<'invitations'>;
  payload: NotificationPayload;
  recipients: NotificationRecipientInput[];
  dedupeKey?: string;
  // Agent executions are authenticated as their supervising human. Explicit
  // attention must still page that same human instead of looking like a
  // redundant human self-notification.
  allowActorRecipient?: boolean;
};

export type NotificationPreferenceValue = {
  category: NotificationCategory;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
};

export function buildNotificationCopy(
  type: NotificationEventType,
  payload: NotificationPayload,
) {
  switch (type) {
    case 'organization_invite':
      return {
        title: `${payload.inviterName ?? 'Someone'} invited you to ${payload.organizationName ?? 'an organization'}`,
        body: `Role: ${payload.roleLabel ?? 'Member'}`,
        href: payload.href,
      };
    case 'issue_assigned':
      return {
        title: `Assigned to ${payload.issueKey ?? 'an issue'}`,
        body: payload.issueTitle ?? 'A new issue needs your attention.',
        href: payload.href,
      };
    case 'issue_reassigned':
      return {
        title: `Reassigned to ${payload.issueKey ?? 'an issue'}`,
        body: payload.issueTitle ?? 'You were reassigned to an issue.',
        href: payload.href,
      };
    case 'issue_mentioned':
      return {
        title: `Mentioned on ${payload.issueKey ?? 'an issue'}`,
        body:
          payload.commentPreview ??
          payload.issueTitle ??
          'You were mentioned in a comment.',
        href: payload.href,
      };
    case 'issue_comment_on_assigned_issue':
      return {
        title: `New comment on ${payload.issueKey ?? 'an assigned issue'}`,
        body:
          payload.commentPreview ??
          payload.issueTitle ??
          'There is a new comment on an issue assigned to you.',
        href: payload.href,
      };
    case 'work_session_completed':
      return {
        title: `Work session completed on ${payload.issueKey ?? 'an issue'}`,
        body: payload.issueTitle ?? 'A work session has finished.',
        href: payload.href,
      };
    case 'work_session_failed':
      return {
        title: `Work session failed on ${payload.issueKey ?? 'an issue'}`,
        body: payload.issueTitle ?? 'A work session has failed.',
        href: payload.href,
      };
    case 'issue_reminder':
      return {
        title: `Reminder: ${payload.issueKey ?? 'an issue'} needs attention`,
        body:
          payload.issueTitle ??
          'You have a pending issue that needs attention.',
        href: payload.href,
      };
    case 'user_status_changed': {
      const subject = payload.subjectUserName ?? 'A teammate';
      const customStatus = [payload.statusEmoji, payload.statusText]
        .filter(Boolean)
        .join(' ')
        .trim();

      return {
        title: customStatus
          ? `${subject} set a status`
          : `${subject} is ${payload.statusLabel ?? 'available'}`,
        body:
          customStatus ||
          `Shared team status changed in ${payload.organizationName ?? 'Vector'}.`,
        href: payload.href,
      };
    }
    case 'request_routed':
      return {
        title: payload.requestKey
          ? `Request ${payload.requestKey} routed to you`
          : 'A request was routed to you',
        body: payload.requestTitle ?? 'A request is waiting for your decision.',
        href: payload.href,
      };
    case 'request_routing_needed':
      return {
        title: payload.requestKey
          ? `Request ${payload.requestKey} needs routing`
          : 'A request needs routing',
        body: payload.requestTitle ?? 'Choose who should receive this request.',
        href: payload.href,
      };
    case 'request_ready_for_review':
    case 'work_ready_for_review':
      return {
        title: `${payload.requestKey ?? payload.workKey ?? 'Work'} is ready for review`,
        body:
          payload.requestTitle ??
          payload.workTitle ??
          'Review the delivered result.',
        href: payload.href,
      };
    case 'request_changes_requested':
      return {
        title: `Changes requested on ${payload.requestKey ?? 'a request'}`,
        body: payload.requestTitle ?? 'The requester left review feedback.',
        href: payload.href,
      };
    case 'request_completed':
      return {
        title: `${payload.requestKey ?? 'Request'} completed`,
        body: payload.requestTitle ?? 'The requested outcome was accepted.',
        href: payload.href,
      };
    case 'work_completed':
      return {
        title: `${payload.workKey ?? 'Work'} completed`,
        body: payload.workTitle ?? 'The outcome was marked complete.',
        href: payload.href,
      };
    case 'work_handoff_proposed':
      return {
        title: `Handoff proposed for ${payload.workKey ?? 'work'}`,
        body:
          payload.workTitle ??
          'Review the context and accept ownership when ready.',
        href: payload.href,
      };
    case 'work_handoff_accepted':
      return {
        title: `Handoff accepted for ${payload.workKey ?? 'work'}`,
        body: payload.workTitle ?? 'Ownership has changed.',
        href: payload.href,
      };
    case 'work_handoff_declined':
      return {
        title: `Handoff declined for ${payload.workKey ?? 'work'}`,
        body: payload.workTitle ?? 'The current owner remains accountable.',
        href: payload.href,
      };
    case 'task_assigned':
    case 'task_transferred':
      return {
        title: `Task assigned in ${payload.workKey ?? 'work'}`,
        body: payload.taskTitle ?? 'A task needs your attention.',
        href: payload.href,
      };
    case 'agent_attention_requested':
      return {
        title: `Agent needs attention on ${payload.workKey ?? 'work'}`,
        body:
          payload.taskTitle ??
          payload.workTitle ??
          'Open the active execution to respond.',
        href: payload.href,
      };
    case 'agent_attention_resolved':
      return {
        title: `Attention resolved on ${payload.workKey ?? 'work'}`,
        body: payload.workTitle ?? 'The execution can continue.',
        href: payload.href,
      };
    case 'work_blocked':
      return {
        title: `${payload.workKey ?? 'Work'} is blocked`,
        body: payload.workTitle ?? 'A blocker needs attention.',
        href: payload.href,
      };
    case 'github_action_required':
      return {
        title: `GitHub action needed on ${payload.workKey ?? 'work'}`,
        body:
          payload.workTitle ?? 'A linked development artifact needs attention.',
        href: payload.href,
      };
    case 'reminder_due':
      return {
        title: payload.channelName
          ? `Reminder: #${payload.channelName}`
          : `Reminder: ${payload.requestKey ?? payload.workKey ?? payload.taskTitle ?? 'work needs attention'}`,
        body:
          payload.messagePreview ??
          payload.requestTitle ??
          payload.workTitle ??
          payload.taskTitle ??
          'This responsibility is still open.',
        href: payload.href,
      };
  }
}

export function getDefaultPreference(
  category: NotificationCategory,
): NotificationPreferenceValue {
  return {
    category,
    ...DEFAULT_NOTIFICATION_PREFERENCES[category],
  };
}

export async function getMergedPreferences(
  ctx: Pick<MutationCtx, 'db'>,
  userId: Id<'users'>,
) {
  const rows = await ctx.db
    .query('notificationPreferences')
    .withIndex('by_user', q => q.eq('userId', userId))
    .collect();

  const map = new Map(rows.map(row => [row.category, row]));

  return NOTIFICATION_CATEGORIES.map(category => {
    const row = map.get(category);
    return row
      ? {
          category,
          inAppEnabled: row.inAppEnabled,
          emailEnabled: row.emailEnabled,
          pushEnabled: row.pushEnabled,
        }
      : getDefaultPreference(category);
  });
}

export async function createNotificationEvent(
  ctx: MutationCtx,
  input: NotificationEventWrite,
) {
  if (input.dedupeKey) {
    const existing = await ctx.db
      .query('notificationEvents')
      .withIndex('by_dedupe_key', q => q.eq('dedupeKey', input.dedupeKey))
      .first();
    if (existing) return existing._id;
  }
  const category = categoryForEvent(input.type);
  const eventId = await ctx.db.insert('notificationEvents', {
    type: input.type,
    category,
    organizationId: input.organizationId,
    actorId: input.actorId,
    issueId: input.issueId,
    requestId: input.requestId,
    taskId: input.taskId,
    projectId: input.projectId,
    teamId: input.teamId,
    invitationId: input.invitationId,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
    createdAt: Date.now(),
  });

  const actor = input.actorId ? await ctx.db.get('users', input.actorId) : null;
  const copy = buildNotificationCopy(input.type, input.payload);
  const uniqueRecipients = new Map<string, NotificationRecipientInput>();

  for (const recipient of input.recipients) {
    if (
      recipient.userId &&
      input.actorId &&
      recipient.userId === input.actorId &&
      !input.allowActorRecipient
    ) {
      continue;
    }

    const key =
      recipient.userId !== undefined
        ? `user:${recipient.userId}`
        : recipient.email
          ? `email:${recipient.email.toLowerCase()}`
          : null;

    if (!key) {
      continue;
    }

    uniqueRecipients.set(key, {
      userId: recipient.userId,
      email: recipient.email?.toLowerCase(),
    });
  }

  for (const recipient of uniqueRecipients.values()) {
    const preference = recipient.userId
      ? await ctx.db
          .query('notificationPreferences')
          .withIndex('by_user_category', q =>
            q.eq('userId', recipient.userId!).eq('category', category),
          )
          .first()
      : null;
    const inAppEnabled = recipient.userId
      ? (preference?.inAppEnabled ??
        getDefaultPreference(category).inAppEnabled)
      : false;
    const recipientId = await ctx.db.insert('notificationRecipients', {
      eventId,
      userId: recipient.userId,
      email: recipient.email,
      category,
      eventType: input.type,
      organizationId: input.organizationId,
      title: copy.title,
      body: copy.body,
      href: copy.href,
      actorId: input.actorId,
      actorName:
        actor?.name ??
        actor?.username ??
        actor?.email ??
        input.payload.inviterName,
      actorImage: actor?.image,
      isRead: false,
      isArchived: !inAppEnabled,
      archivedAt: inAppEnabled ? undefined : Date.now(),
      actionState: actionStateForEvent(input.type),
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.actions.deliverRecipient,
      { recipientId },
    );
  }

  return eventId;
}

export function getIssueHref(orgSlug: string, issueKey: string) {
  return `/${orgSlug}/work/${issueKey}`;
}

export function getRequestHref(orgSlug: string, requestKey: string) {
  return `/${orgSlug}/requests/${requestKey}`;
}

function actionStateForEvent(
  type: NotificationEventType,
): 'needs_action' | 'update' {
  switch (type) {
    case 'request_routed':
    case 'request_routing_needed':
    case 'request_ready_for_review':
    case 'work_ready_for_review':
    case 'request_changes_requested':
    case 'work_handoff_proposed':
    case 'task_assigned':
    case 'task_transferred':
    case 'agent_attention_requested':
    case 'work_blocked':
    case 'github_action_required':
    case 'reminder_due':
      return 'needs_action';
    default:
      return 'update';
  }
}

function normalizeMentionToken(value: string) {
  return value.trim().toLowerCase().replace(/^@/, '');
}

export function extractMentionTokens(body: string) {
  const matches = body.match(/@([a-zA-Z0-9._-]+)/g) ?? [];
  return Array.from(
    new Set(matches.map(token => normalizeMentionToken(token))),
  );
}

export async function resolveMentionedUsers(
  ctx: Pick<MutationCtx, 'db'>,
  organizationId: Id<'organizations'>,
  body: string,
) {
  const tokens = extractMentionTokens(body);
  if (tokens.length === 0) {
    return [];
  }

  const members = await ctx.db
    .query('members')
    .withIndex('by_organization', q => q.eq('organizationId', organizationId))
    .collect();

  const users = await Promise.all(
    members.map(member => ctx.db.get('users', member.userId)),
  );
  const matches = new Map<Id<'users'>, Doc<'users'>>();

  for (const user of users) {
    if (!user) {
      continue;
    }

    const candidates = [user.username, user.name, user.email?.split('@')[0]]
      .filter((value): value is string => Boolean(value))
      .map(value => normalizeMentionToken(String(value).replace(/\s+/g, '-')));

    if (tokens.some(token => candidates.includes(token))) {
      matches.set(user._id, user);
    }
  }

  return Array.from(matches.values());
}
