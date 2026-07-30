import { v } from 'convex/values';

export const WORK_KINDS = ['work', 'legacy_task_source'] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
export const workKindValidator = v.union(
  ...WORK_KINDS.map(kind => v.literal(kind)),
);

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'waiting',
  'blocked',
  'done',
  'canceled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusValidator = v.union(
  ...TASK_STATUSES.map(status => v.literal(status)),
);

export const WORK_EFFORTS = ['unknown', 'xs', 's', 'm', 'l'] as const;
export type WorkEffort = (typeof WORK_EFFORTS)[number];
export const workEffortValidator = v.union(
  ...WORK_EFFORTS.map(effort => v.literal(effort)),
);

export const WORK_STATUSES = [
  'planned',
  'active',
  'waiting',
  'blocked',
  'ready_for_review',
  'completed',
  'canceled',
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export const workStatusValidator = v.union(
  ...WORK_STATUSES.map(status => v.literal(status)),
);

export const WORK_COMPLETION_POLICIES = [
  'manual',
  'tracked_work',
  'github',
] as const;
export type WorkCompletionPolicy = (typeof WORK_COMPLETION_POLICIES)[number];
export const workCompletionPolicyValidator = v.union(
  ...WORK_COMPLETION_POLICIES.map(policy => v.literal(policy)),
);

export const AGENT_TASK_CREATION_POLICIES = [
  'allow',
  'approval_required',
  'deny',
] as const;
export type AgentTaskCreationPolicy =
  (typeof AGENT_TASK_CREATION_POLICIES)[number];
export const agentTaskCreationPolicyValidator = v.union(
  ...AGENT_TASK_CREATION_POLICIES.map(policy => v.literal(policy)),
);

export const REQUEST_STATUSES = [
  'new',
  'routed',
  'planned',
  'in_delivery',
  'ready_for_review',
  'changes_requested',
  'completed',
  'declined',
  'duplicate',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const requestStatusValidator = v.union(
  ...REQUEST_STATUSES.map(status => v.literal(status)),
);

export const REQUEST_SOURCES = [
  'workspace',
  'public',
  'github',
  'api',
] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];
export const requestSourceValidator = v.union(
  ...REQUEST_SOURCES.map(source => v.literal(source)),
);

export const REQUEST_RECIPIENT_ROLES = ['recipient', 'watcher'] as const;
export type RequestRecipientRole = (typeof REQUEST_RECIPIENT_ROLES)[number];
export const requestRecipientRoleValidator = v.union(
  ...REQUEST_RECIPIENT_ROLES.map(role => v.literal(role)),
);

export const REQUEST_WORK_RELATIONS = ['fulfills', 'contributes'] as const;
export type RequestWorkRelation = (typeof REQUEST_WORK_RELATIONS)[number];
export const requestWorkRelationValidator = v.union(
  ...REQUEST_WORK_RELATIONS.map(relation => v.literal(relation)),
);

export const WORK_HANDOFF_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'canceled',
] as const;
export type WorkHandoffStatus = (typeof WORK_HANDOFF_STATUSES)[number];
export const workHandoffStatusValidator = v.union(
  ...WORK_HANDOFF_STATUSES.map(status => v.literal(status)),
);

export const WORK_ATTENTION_STATUSES = [
  'open',
  'resolved',
  'dismissed',
] as const;
export type WorkAttentionStatus = (typeof WORK_ATTENTION_STATUSES)[number];
export const workAttentionStatusValidator = v.union(
  ...WORK_ATTENTION_STATUSES.map(status => v.literal(status)),
);

export const WORK_CREATION_SOURCES = [
  'human',
  'agent',
  'github',
  'migration',
] as const;
export type WorkCreationSource = (typeof WORK_CREATION_SOURCES)[number];
export const workCreationSourceValidator = v.union(
  ...WORK_CREATION_SOURCES.map(source => v.literal(source)),
);

export const TASK_CREATION_SOURCES = ['human', 'agent', 'migration'] as const;
export type TaskCreationSource = (typeof TASK_CREATION_SOURCES)[number];
export const taskCreationSourceValidator = v.union(
  ...TASK_CREATION_SOURCES.map(source => v.literal(source)),
);

export const ACTOR_ORIGIN_KINDS = [
  'web',
  'cli_human',
  'cli_agent_claimed',
  'agent',
  'github',
  'scheduled_system',
  'migration',
] as const;
export type ActorOriginKind = (typeof ACTOR_ORIGIN_KINDS)[number];
export const actorOriginKindValidator = v.union(
  ...ACTOR_ORIGIN_KINDS.map(kind => v.literal(kind)),
);

export const REMINDER_TARGET_TYPES = [
  'request',
  'work',
  'task',
  'message',
] as const;
export type ReminderTargetType = (typeof REMINDER_TARGET_TYPES)[number];
export const reminderTargetTypeValidator = v.union(
  ...REMINDER_TARGET_TYPES.map(type => v.literal(type)),
);

export const REMINDER_RECIPIENT_POLICIES = [
  'requester',
  'request_owner',
  'work_owner',
  'work_creator',
  'task_assignee',
  'watchers',
  'reminder_creator',
] as const;
export type ReminderRecipientPolicy =
  (typeof REMINDER_RECIPIENT_POLICIES)[number];
export const reminderRecipientPolicyValidator = v.union(
  ...REMINDER_RECIPIENT_POLICIES.map(policy => v.literal(policy)),
);

export const REMINDER_CADENCES = [
  'once',
  'daily',
  'weekdays',
  'weekly',
  'custom_days',
] as const;
export type ReminderCadence = (typeof REMINDER_CADENCES)[number];
export const reminderCadenceValidator = v.union(
  ...REMINDER_CADENCES.map(cadence => v.literal(cadence)),
);

export const NOTIFICATION_ACTION_STATES = [
  'needs_action',
  'update',
  'saved',
  'snoozed',
  'done',
] as const;
export type NotificationActionState =
  (typeof NOTIFICATION_ACTION_STATES)[number];
export const notificationActionStateValidator = v.union(
  ...NOTIFICATION_ACTION_STATES.map(state => v.literal(state)),
);
