export type ChannelKind =
  'public' | 'private' | 'announcement' | 'direct' | 'group_direct';

export type ChannelNotificationMode = 'all' | 'mentions' | 'muted';
export type AgentWakeMode = 'mentions' | 'every_message' | 'off';
export type AgentInteractionPolicy =
  'owner_only' | 'selected_users' | 'channel_members';
export type AgentLifecycleStatus = 'ready' | 'offline' | 'paused';
export type CollaborationRunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_for_permission'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'offline';
export type CollaborationRunEventKind =
  | 'status'
  | 'thought'
  | 'plan'
  | 'tool'
  | 'terminal'
  | 'file'
  | 'permission'
  | 'message'
  | 'error';

export interface CollaborationUser {
  id: string;
  name: string;
  email?: string | null;
  image?: string | null;
  presence?: 'online' | 'away' | 'busy' | 'offline';
  status?: string | null;
  isCurrentUser?: boolean;
}

export interface CollaborationAgent {
  id: string;
  name: string;
  handle: string;
  description?: string | null;
  avatar?: string | null;
  provider: string;
  owner: CollaborationUser;
  lifecycleStatus: AgentLifecycleStatus;
  interactionPolicy: AgentInteractionPolicy;
  wakeMode?: AgentWakeMode;
  deviceName?: string | null;
  workspaceName?: string | null;
  defaultFolder?: string | null;
  model?: string | null;
  permissionMode?: 'ask' | 'plan';
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high' | 'max' | 'xhigh';
  canControl?: boolean;
}

export interface CollaborationChannel {
  id: string;
  name: string;
  slug: string;
  kind: ChannelKind;
  topic?: string | null;
  description?: string | null;
  memberCount: number;
  unreadCount?: number;
  mentionCount?: number;
  notificationMode: ChannelNotificationMode;
  isMember?: boolean;
  isDefault?: boolean;
  isArchived?: boolean;
  members: CollaborationUser[];
  agents: CollaborationAgent[];
}

export interface CollaborationAttachment {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  name: string;
  contentType: string;
  size: number;
  url: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}

export interface CollaborationReaction {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
  userNames?: string[];
}

export type CollaborationEntityType =
  'request' | 'issue' | 'task' | 'project' | 'document';

export interface CollaborationEntityLink {
  id: string;
  type: CollaborationEntityType;
  entityId: string;
  label: string;
  title?: string | null;
  href?: string | null;
}

export interface CollaborationMessageAuthor {
  kind: 'user' | 'agent' | 'system';
  user?: CollaborationUser | null;
  agent?: CollaborationAgent | null;
  label?: string | null;
}

export interface CollaborationRunEvent {
  id: string;
  kind: CollaborationRunEventKind;
  title: string;
  body?: string | null;
  metadata?: {
    requestId?: string;
    options?: Array<{
      id: string;
      label: string;
      description?: string;
      kind?: 'allow' | 'deny' | 'cancel';
    }>;
  } | null;
  createdAt: number;
}

export interface CollaborationAgentRun {
  id: string;
  status: CollaborationRunStatus;
  currentActivity?: string | null;
  latestSummary?: string | null;
  error?: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  createdAt: number;
  agent: CollaborationAgent;
  events: CollaborationRunEvent[];
}

export interface CollaborationMessage {
  id: string;
  clientMessageId?: string | null;
  channelId: string;
  body: string;
  createdAt: number;
  editedAt?: number | null;
  deletedAt?: number | null;
  threadRootId?: string | null;
  replyToMessageId?: string | null;
  replyCount: number;
  lastReplyAt?: number | null;
  author: CollaborationMessageAuthor;
  attachments: CollaborationAttachment[];
  reactions: CollaborationReaction[];
  isPinned: boolean;
  isSaved: boolean;
  canEdit: boolean;
  canDelete: boolean;
  run?: CollaborationAgentRun | null;
  threadResolved?: boolean;
  followingThread?: boolean;
  linkedEntities?: CollaborationEntityLink[];
}

export interface CollaborationMention {
  type: 'user' | 'agent';
  id: string;
  label: string;
}

export interface CollaborationDraftAttachment {
  id: string;
  file: File;
  kind: CollaborationAttachment['kind'];
  previewUrl?: string;
}

export interface SendCollaborationMessageInput {
  clientMessageId: string;
  body: string;
  mentions: CollaborationMention[];
  attachments: File[];
  threadRootId?: string;
  replyToMessageId?: string;
}

export interface CollaborationCallbacks {
  onSendMessage: (input: SendCollaborationMessageInput) => Promise<void> | void;
  onEditMessage?: (messageId: string, body: string) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void> | void;
  onTogglePin?: (messageId: string, pinned: boolean) => Promise<void> | void;
  onToggleSave?: (messageId: string, saved: boolean) => Promise<void> | void;
  onMarkRead?: () => Promise<void> | void;
  onTyping?: (threadRootId?: string) => Promise<void> | void;
  onNotificationModeChange?: (
    mode: ChannelNotificationMode,
  ) => Promise<void> | void;
  onAgentWakeModeChange?: (
    agentId: string,
    mode: AgentWakeMode,
  ) => Promise<void> | void;
  onRemoveAgent?: (agentId: string) => Promise<void> | void;
  onSetThreadResolved?: (
    threadRootId: string,
    resolved: boolean,
  ) => Promise<void> | void;
  onFollowThread?: (
    threadRootId: string,
    following: boolean,
  ) => Promise<void> | void;
  onRespondToPermission?: (
    runId: string,
    optionId: string,
  ) => Promise<void> | void;
  onCancelRun?: (runId: string) => Promise<void> | void;
  onLinkEntity?: (
    messageId: string,
    entity: Pick<CollaborationEntityLink, 'type' | 'entityId'>,
  ) => Promise<void> | void;
  onCreateRequestFromMessage?: (
    message: CollaborationMessage,
  ) => Promise<void> | void;
  onCreateWorkFromMessage?: (
    message: CollaborationMessage,
  ) => Promise<void> | void;
}

export interface AgentDeviceOption {
  id: string;
  name: string;
  status: 'online' | 'offline';
  hostname?: string | null;
  platform?: string | null;
}

export interface AgentWorkspaceOption {
  id: string;
  deviceId: string;
  name: string;
  rootPath: string;
}

export interface RegisteredAgentFormValue {
  name: string;
  handle: string;
  description: string;
  provider: string;
  deviceId: string;
  workspaceId: string;
  defaultFolder: string;
  model: string;
  permissionMode: 'ask' | 'plan';
  thinkingLevel: 'off' | 'low' | 'medium' | 'high' | 'max' | 'xhigh';
  interactionPolicy: AgentInteractionPolicy;
  selectedUserIds: string[];
}
