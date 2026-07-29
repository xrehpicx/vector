import { v } from 'convex/values';
import {
  agentInteractionPolicyValidator,
  agentWakeModeValidator,
  attachmentKindValidator,
  channelKindValidator,
  channelMemberRoleValidator,
  channelNotificationModeValidator,
  collaborationEntityTypeValidator,
  collaborationRunEventKindValidator,
  collaborationRunStatusValidator,
  messageActorKindValidator,
  messageFormatValidator,
  registeredAgentStatusValidator,
} from '../_shared/collaboration';
import {
  agentCommandStatusValidator,
  agentPermissionModeValidator,
  agentProviderValidator,
  agentThinkingLevelValidator,
} from '../_shared/agentBridge';

export const userSummaryValidator = v.object({
  _id: v.id('users'),
  name: v.optional(v.string()),
  username: v.optional(v.string()),
  email: v.optional(v.string()),
  image: v.optional(v.string()),
});

export const channelValidator = v.object({
  _id: v.id('channels'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  kind: channelKindValidator,
  name: v.string(),
  slug: v.string(),
  topic: v.optional(v.string()),
  description: v.optional(v.string()),
  icon: v.optional(v.string()),
  color: v.optional(v.string()),
  createdByUserId: v.id('users'),
  isDefault: v.boolean(),
  archivedAt: v.optional(v.number()),
  lastMessageId: v.optional(v.id('channelMessages')),
  lastMessageAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const channelMemberValidator = v.object({
  _id: v.id('channelMembers'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  channelId: v.id('channels'),
  userId: v.id('users'),
  role: channelMemberRoleValidator,
  notificationMode: channelNotificationModeValidator,
  lastReadAt: v.optional(v.number()),
  lastReadMessageId: v.optional(v.id('channelMessages')),
  favoriteAt: v.optional(v.number()),
  sortOrder: v.optional(v.number()),
  joinedAt: v.number(),
  hiddenAt: v.optional(v.number()),
});

export const channelListItemValidator = v.object({
  channel: channelValidator,
  membership: v.union(channelMemberValidator, v.null()),
  unreadCount: v.number(),
});

export const channelMessageValidator = v.object({
  _id: v.id('channelMessages'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  channelId: v.id('channels'),
  actorKind: messageActorKindValidator,
  authorUserId: v.optional(v.id('users')),
  authorAgentId: v.optional(v.id('registeredAgents')),
  body: v.string(),
  format: messageFormatValidator,
  threadRootId: v.optional(v.id('channelMessages')),
  replyToMessageId: v.optional(v.id('channelMessages')),
  clientMessageId: v.optional(v.string()),
  mentionedUserIds: v.array(v.id('users')),
  mentionedAgentIds: v.array(v.id('registeredAgents')),
  replyCount: v.number(),
  lastReplyAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),
  resolvedByUserId: v.optional(v.id('users')),
  editedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
  createdAt: v.number(),
});

export const attachmentValidator = v.object({
  _id: v.id('messageAttachments'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  channelId: v.id('channels'),
  messageId: v.id('channelMessages'),
  storageId: v.id('_storage'),
  kind: attachmentKindValidator,
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  duration: v.optional(v.number()),
  createdAt: v.number(),
});

export const reactionValidator = v.object({
  _id: v.id('messageReactions'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  channelId: v.id('channels'),
  messageId: v.id('channelMessages'),
  userId: v.id('users'),
  emoji: v.string(),
  createdAt: v.number(),
});

export const pinValidator = v.object({
  _id: v.id('messagePins'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  channelId: v.id('channels'),
  messageId: v.id('channelMessages'),
  pinnedByUserId: v.id('users'),
  createdAt: v.number(),
});

export const savedMessageValidator = v.object({
  _id: v.id('savedMessages'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  messageId: v.id('channelMessages'),
  userId: v.id('users'),
  createdAt: v.number(),
});

export const threadFollowerValidator = v.object({
  _id: v.id('threadFollowers'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  channelId: v.id('channels'),
  threadRootId: v.id('channelMessages'),
  userId: v.id('users'),
  lastReadAt: v.optional(v.number()),
  createdAt: v.number(),
});

export const messageViewValidator = v.object({
  message: channelMessageValidator,
  authorUser: v.union(userSummaryValidator, v.null()),
  authorAgent: v.union(
    v.object({
      _id: v.id('registeredAgents'),
      name: v.string(),
      handle: v.string(),
      avatar: v.optional(v.string()),
      ownerUserId: v.id('users'),
      provider: agentProviderValidator,
      lifecycleStatus: registeredAgentStatusValidator,
    }),
    v.null(),
  ),
  attachments: v.array(attachmentValidator),
  reactions: v.array(reactionValidator),
  pin: v.union(pinValidator, v.null()),
  saved: v.boolean(),
  following: v.boolean(),
});

export const typingEntryValidator = v.object({
  _id: v.id('channelTyping'),
  _creationTime: v.number(),
  channelId: v.id('channels'),
  userId: v.optional(v.id('users')),
  agentId: v.optional(v.id('registeredAgents')),
  threadRootId: v.optional(v.id('channelMessages')),
  expiresAt: v.number(),
  updatedAt: v.number(),
});

export const entityLinkValidator = v.object({
  _id: v.id('messageEntityLinks'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  messageId: v.id('channelMessages'),
  entityType: collaborationEntityTypeValidator,
  entityId: v.string(),
  linkedByUserId: v.id('users'),
  createdAt: v.number(),
});

export const entityLinkViewValidator = v.object({
  link: entityLinkValidator,
  entity: v.object({
    label: v.string(),
    key: v.optional(v.string()),
    title: v.optional(v.string()),
    href: v.string(),
  }),
});

export const registeredAgentValidator = v.object({
  _id: v.id('registeredAgents'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  ownerUserId: v.id('users'),
  name: v.string(),
  handle: v.string(),
  description: v.optional(v.string()),
  avatar: v.optional(v.string()),
  provider: agentProviderValidator,
  deviceId: v.id('agentDevices'),
  workspaceId: v.id('deviceWorkspaces'),
  defaultFolder: v.string(),
  model: v.optional(v.string()),
  permissionMode: agentPermissionModeValidator,
  thinkingLevel: v.optional(agentThinkingLevelValidator),
  interactionPolicy: agentInteractionPolicyValidator,
  lifecycleStatus: registeredAgentStatusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const agentChannelMembershipValidator = v.object({
  _id: v.id('agentChannelMemberships'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  channelId: v.id('channels'),
  agentId: v.id('registeredAgents'),
  addedByUserId: v.id('users'),
  wakeMode: agentWakeModeValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const agentAccessGrantValidator = v.object({
  _id: v.id('agentAccessGrants'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  agentId: v.id('registeredAgents'),
  userId: v.id('users'),
  canInteract: v.boolean(),
  canControl: v.boolean(),
  grantedByUserId: v.id('users'),
  createdAt: v.number(),
});

export const registeredAgentViewValidator = v.object({
  agent: registeredAgentValidator,
  owner: v.union(userSummaryValidator, v.null()),
  device: v.union(
    v.object({
      _id: v.id('agentDevices'),
      displayName: v.string(),
      status: v.union(
        v.literal('online'),
        v.literal('stale'),
        v.literal('offline'),
      ),
      lastSeenAt: v.number(),
    }),
    v.null(),
  ),
  workspace: v.union(
    v.object({
      _id: v.id('deviceWorkspaces'),
      label: v.string(),
      path: v.string(),
      launchPolicy: v.union(
        v.literal('allow_delegated'),
        v.literal('manual_only'),
      ),
    }),
    v.null(),
  ),
  connected: v.boolean(),
  canInteract: v.boolean(),
  canControl: v.boolean(),
});

export const collaborationRunValidator = v.object({
  _id: v.id('collaborationAgentRuns'),
  _creationTime: v.number(),
  organizationId: v.id('organizations'),
  agentId: v.id('registeredAgents'),
  channelId: v.id('channels'),
  triggerMessageId: v.id('channelMessages'),
  threadRootId: v.optional(v.id('channelMessages')),
  requestedByUserId: v.id('users'),
  deviceId: v.id('agentDevices'),
  workspaceId: v.id('deviceWorkspaces'),
  processId: v.optional(v.id('agentProcesses')),
  sessionId: v.optional(v.string()),
  status: collaborationRunStatusValidator,
  currentActivity: v.optional(v.string()),
  latestSummary: v.optional(v.string()),
  finalMessageId: v.optional(v.id('channelMessages')),
  error: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const collaborationRunEventValidator = v.object({
  _id: v.id('collaborationRunEvents'),
  _creationTime: v.number(),
  runId: v.id('collaborationAgentRuns'),
  sourceId: v.optional(v.string()),
  kind: collaborationRunEventKindValidator,
  title: v.string(),
  body: v.optional(v.string()),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
});

export const collaborationCommandPayloadValidator = v.object({
  channelId: v.id('channels'),
  threadRootId: v.optional(v.id('channelMessages')),
  triggerMessageId: v.id('channelMessages'),
  body: v.string(),
  workspacePath: v.string(),
  provider: agentProviderValidator,
  model: v.optional(v.string()),
  permissionMode: v.optional(agentPermissionModeValidator),
  thinkingLevel: v.optional(agentThinkingLevelValidator),
  contextMessages: v.array(
    v.object({
      messageId: v.id('channelMessages'),
      actorKind: messageActorKindValidator,
      actorLabel: v.string(),
      body: v.string(),
      attachmentNames: v.array(v.string()),
      attachments: v.optional(
        v.array(
          v.object({
            name: v.string(),
            contentType: v.string(),
            url: v.string(),
          }),
        ),
      ),
      createdAt: v.number(),
    }),
  ),
  linkedEntities: v.array(
    v.object({
      entityType: collaborationEntityTypeValidator,
      entityId: v.string(),
      label: v.string(),
    }),
  ),
});

const collaborationCommandBase = {
  _id: v.id('agentCommands'),
  _creationTime: v.number(),
  deviceId: v.id('agentDevices'),
  processId: v.optional(v.id('agentProcesses')),
  collaborationRunId: v.id('collaborationAgentRuns'),
  registeredAgentId: v.id('registeredAgents'),
  senderUserId: v.id('users'),
  status: agentCommandStatusValidator,
  createdAt: v.number(),
  claimedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
};

export const collaborationCommandValidator = v.union(
  v.object({
    ...collaborationCommandBase,
    kind: v.literal('collaboration_prompt'),
    payload: collaborationCommandPayloadValidator,
  }),
  v.object({
    ...collaborationCommandBase,
    kind: v.literal('collaboration_cancel'),
    payload: v.object({
      runId: v.id('collaborationAgentRuns'),
    }),
  }),
  v.object({
    ...collaborationCommandBase,
    kind: v.literal('approval_response'),
    payload: v.object({
      runId: v.id('collaborationAgentRuns'),
      optionId: v.optional(v.string()),
    }),
  }),
);

export const priorityInboxItemValidator = v.object({
  message: messageViewValidator,
  channel: channelValidator,
  reason: v.union(
    v.literal('direct_message'),
    v.literal('mention'),
    v.literal('thread_reply'),
    v.literal('followed_thread'),
  ),
  occurredAt: v.number(),
});
