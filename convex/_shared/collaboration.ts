import { v } from 'convex/values';

export const CHANNEL_KINDS = [
  'public',
  'private',
  'announcement',
  'direct',
  'group_direct',
] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export const channelKindValidator = v.union(
  ...CHANNEL_KINDS.map(kind => v.literal(kind)),
);

export const CHANNEL_MEMBER_ROLES = ['owner', 'moderator', 'member'] as const;
export type ChannelMemberRole = (typeof CHANNEL_MEMBER_ROLES)[number];
export const channelMemberRoleValidator = v.union(
  ...CHANNEL_MEMBER_ROLES.map(role => v.literal(role)),
);

export const CHANNEL_NOTIFICATION_MODES = ['all', 'mentions', 'muted'] as const;
export type ChannelNotificationMode =
  (typeof CHANNEL_NOTIFICATION_MODES)[number];
export const channelNotificationModeValidator = v.union(
  ...CHANNEL_NOTIFICATION_MODES.map(mode => v.literal(mode)),
);

export const MESSAGE_ACTOR_KINDS = ['user', 'agent', 'system'] as const;
export type MessageActorKind = (typeof MESSAGE_ACTOR_KINDS)[number];
export const messageActorKindValidator = v.union(
  ...MESSAGE_ACTOR_KINDS.map(kind => v.literal(kind)),
);

export const MESSAGE_FORMATS = ['plain', 'markdown'] as const;
export type MessageFormat = (typeof MESSAGE_FORMATS)[number];
export const messageFormatValidator = v.union(
  ...MESSAGE_FORMATS.map(format => v.literal(format)),
);

export const ATTACHMENT_KINDS = ['image', 'video', 'audio', 'file'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
export const attachmentKindValidator = v.union(
  ...ATTACHMENT_KINDS.map(kind => v.literal(kind)),
);

export const AGENT_WAKE_MODES = ['mentions', 'every_message', 'off'] as const;
export type AgentWakeMode = (typeof AGENT_WAKE_MODES)[number];
export const agentWakeModeValidator = v.union(
  ...AGENT_WAKE_MODES.map(mode => v.literal(mode)),
);

export const AGENT_INTERACTION_POLICIES = [
  'owner_only',
  'selected_users',
  'channel_members',
] as const;
export type AgentInteractionPolicy =
  (typeof AGENT_INTERACTION_POLICIES)[number];
export const agentInteractionPolicyValidator = v.union(
  ...AGENT_INTERACTION_POLICIES.map(policy => v.literal(policy)),
);

export const REGISTERED_AGENT_STATUSES = [
  'ready',
  'offline',
  'paused',
] as const;
export type RegisteredAgentStatus = (typeof REGISTERED_AGENT_STATUSES)[number];
export const registeredAgentStatusValidator = v.union(
  ...REGISTERED_AGENT_STATUSES.map(status => v.literal(status)),
);

export const COLLABORATION_RUN_STATUSES = [
  'queued',
  'starting',
  'running',
  'waiting_for_permission',
  'completed',
  'failed',
  'canceled',
  'offline',
] as const;
export type CollaborationRunStatus =
  (typeof COLLABORATION_RUN_STATUSES)[number];
export const collaborationRunStatusValidator = v.union(
  ...COLLABORATION_RUN_STATUSES.map(status => v.literal(status)),
);

export const COLLABORATION_RUN_EVENT_KINDS = [
  'status',
  'thought',
  'plan',
  'tool',
  'terminal',
  'file',
  'permission',
  'message',
  'error',
] as const;
export type CollaborationRunEventKind =
  (typeof COLLABORATION_RUN_EVENT_KINDS)[number];
export const collaborationRunEventKindValidator = v.union(
  ...COLLABORATION_RUN_EVENT_KINDS.map(kind => v.literal(kind)),
);

export const COLLABORATION_ENTITY_TYPES = [
  'request',
  'issue',
  'task',
  'project',
  'document',
] as const;
export type CollaborationEntityType =
  (typeof COLLABORATION_ENTITY_TYPES)[number];
export const collaborationEntityTypeValidator = v.union(
  ...COLLABORATION_ENTITY_TYPES.map(type => v.literal(type)),
);

export const structuredMentionValidator = v.object({
  type: v.union(v.literal('user'), v.literal('agent')),
  userId: v.optional(v.id('users')),
  agentId: v.optional(v.id('registeredAgents')),
  label: v.string(),
});

export const messageAttachmentInputValidator = v.object({
  storageId: v.id('_storage'),
  kind: attachmentKindValidator,
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  duration: v.optional(v.number()),
});
