import { v } from 'convex/values';

export const NOTIFICATION_CATEGORIES = [
  'invites',
  'assignments',
  'mentions',
  'comments',
  'work_sessions',
  'team_status_changes',
  'requests',
  'handoffs',
  'reviews',
  'attention',
  'reminders',
  'github',
] as const;

export const NOTIFICATION_EVENT_TYPES = [
  'organization_invite',
  'issue_assigned',
  'issue_reassigned',
  'issue_mentioned',
  'issue_comment_on_assigned_issue',
  'work_session_completed',
  'work_session_failed',
  'issue_reminder',
  'user_status_changed',
  'request_routed',
  'request_routing_needed',
  'request_ready_for_review',
  'request_changes_requested',
  'request_completed',
  'work_handoff_proposed',
  'work_handoff_accepted',
  'work_handoff_declined',
  'task_assigned',
  'task_transferred',
  'agent_attention_requested',
  'agent_attention_resolved',
  'work_ready_for_review',
  'work_completed',
  'work_blocked',
  'github_action_required',
  'reminder_due',
] as const;

export const NOTIFICATION_CHANNELS = ['email', 'push'] as const;

export const NOTIFICATION_DELIVERY_STATUSES = [
  'sent',
  'failed',
  'skipped',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationDeliveryStatus =
  (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export const notificationCategoryValidator = v.union(
  ...NOTIFICATION_CATEGORIES.map(category => v.literal(category)),
);

export const notificationEventTypeValidator = v.union(
  ...NOTIFICATION_EVENT_TYPES.map(type => v.literal(type)),
);

export const notificationChannelValidator = v.union(
  ...NOTIFICATION_CHANNELS.map(channel => v.literal(channel)),
);

export const notificationDeliveryStatusValidator = v.union(
  ...NOTIFICATION_DELIVERY_STATUSES.map(status => v.literal(status)),
);

export const notificationPayloadValidator = v.object({
  organizationName: v.optional(v.string()),
  issueKey: v.optional(v.string()),
  issueTitle: v.optional(v.string()),
  requestKey: v.optional(v.string()),
  requestTitle: v.optional(v.string()),
  workKey: v.optional(v.string()),
  workTitle: v.optional(v.string()),
  taskTitle: v.optional(v.string()),
  channelName: v.optional(v.string()),
  messagePreview: v.optional(v.string()),
  commentPreview: v.optional(v.string()),
  inviterName: v.optional(v.string()),
  roleLabel: v.optional(v.string()),
  href: v.optional(v.string()),
  subjectUserName: v.optional(v.string()),
  statusLabel: v.optional(v.string()),
  statusText: v.optional(v.string()),
  statusEmoji: v.optional(v.string()),
});

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationCategory,
  {
    inAppEnabled: boolean;
    emailEnabled: boolean;
    pushEnabled: boolean;
  }
> = {
  invites: {
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: false,
  },
  assignments: {
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: true,
  },
  mentions: {
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: true,
  },
  comments: {
    inAppEnabled: true,
    emailEnabled: false,
    pushEnabled: true,
  },
  work_sessions: {
    inAppEnabled: true,
    emailEnabled: false,
    pushEnabled: true,
  },
  team_status_changes: {
    inAppEnabled: true,
    emailEnabled: false,
    pushEnabled: false,
  },
  requests: {
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: true,
  },
  handoffs: {
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: true,
  },
  reviews: {
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: true,
  },
  attention: {
    inAppEnabled: true,
    emailEnabled: false,
    pushEnabled: true,
  },
  reminders: {
    inAppEnabled: true,
    emailEnabled: false,
    pushEnabled: true,
  },
  github: {
    inAppEnabled: true,
    emailEnabled: false,
    pushEnabled: true,
  },
};

export function categoryForEvent(
  type: NotificationEventType,
): NotificationCategory {
  switch (type) {
    case 'organization_invite':
      return 'invites';
    case 'issue_assigned':
    case 'issue_reassigned':
      return 'assignments';
    case 'issue_mentioned':
      return 'mentions';
    case 'issue_comment_on_assigned_issue':
      return 'comments';
    case 'work_session_completed':
    case 'work_session_failed':
      return 'work_sessions';
    case 'issue_reminder':
      return 'assignments';
    case 'user_status_changed':
      return 'team_status_changes';
    case 'request_routed':
    case 'request_routing_needed':
    case 'request_completed':
      return 'requests';
    case 'work_handoff_proposed':
    case 'work_handoff_accepted':
    case 'work_handoff_declined':
    case 'task_assigned':
    case 'task_transferred':
      return 'handoffs';
    case 'request_ready_for_review':
    case 'request_changes_requested':
    case 'work_ready_for_review':
    case 'work_completed':
      return 'reviews';
    case 'agent_attention_requested':
    case 'agent_attention_resolved':
    case 'work_blocked':
      return 'attention';
    case 'github_action_required':
      return 'github';
    case 'reminder_due':
      return 'reminders';
  }
}
