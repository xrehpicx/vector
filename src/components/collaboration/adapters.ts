import type { FunctionReturnType } from 'convex/server';
import { api } from '@/lib/convex';
import type {
  CollaborationAgent,
  CollaborationAgentRun,
  CollaborationChannel,
  CollaborationEntityLink,
  CollaborationMessage,
  CollaborationUser,
} from './types';

export type ChannelListItem = FunctionReturnType<
  typeof api.collaboration.channels.list
>[number];
export type ChannelMemberItem = FunctionReturnType<
  typeof api.collaboration.channels.listMembers
>[number];
export type AgentListItem = FunctionReturnType<
  typeof api.collaboration.agents.list
>[number];
export type AgentChannelItem = FunctionReturnType<
  typeof api.collaboration.agents.listChannelMemberships
>[number];
export type MessageView = FunctionReturnType<
  typeof api.collaboration.messages.listChannel
>['page'][number];
export type RunDocument = FunctionReturnType<
  typeof api.collaboration.runs.listChannel
>['page'][number];
export type RunEventDocument = FunctionReturnType<
  typeof api.collaboration.runs.listEvents
>['page'][number];
export type EntityLinkView = FunctionReturnType<
  typeof api.collaboration.messages.listEntityLinks
>[number];

type UserLike = {
  _id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  image?: string | null;
};

function displayName(user: UserLike | null | undefined) {
  return user?.name ?? user?.username ?? user?.email ?? 'Workspace member';
}

export function toCollaborationUser(
  user: UserLike,
  currentUserId?: string | null,
): CollaborationUser {
  return {
    id: String(user._id),
    name: displayName(user),
    email: user.email,
    image: user.image,
    isCurrentUser: String(user._id) === currentUserId,
  };
}

export function toCollaborationAgent(
  view: AgentListItem,
  currentUserId?: string | null,
): CollaborationAgent {
  return {
    id: String(view.agent._id),
    name: view.agent.name,
    handle: view.agent.handle,
    description: view.agent.description,
    avatar: view.agent.avatar,
    provider: view.agent.provider,
    owner: view.owner
      ? toCollaborationUser(view.owner, currentUserId)
      : {
          id: String(view.agent.ownerUserId),
          name: 'Agent owner',
          isCurrentUser: String(view.agent.ownerUserId) === currentUserId,
        },
    lifecycleStatus:
      view.agent.lifecycleStatus === 'paused'
        ? 'paused'
        : view.connected
          ? 'ready'
          : 'offline',
    interactionPolicy: view.agent.interactionPolicy,
    deviceName: view.device?.displayName,
    workspaceName: view.workspace?.label,
    defaultFolder: view.agent.defaultFolder,
    model: view.agent.model,
    permissionMode: view.agent.permissionMode === 'plan' ? 'plan' : 'ask',
    thinkingLevel: view.agent.thinkingLevel,
    canControl: view.canControl,
  };
}

export function toChannelAgent(
  membership: AgentChannelItem,
  agentViews: AgentListItem[],
  currentUserId?: string | null,
): CollaborationAgent {
  const hydrated = agentViews.find(
    view => view.agent._id === membership.agent._id,
  );
  const fallback: AgentListItem = {
    agent: membership.agent,
    owner: membership.owner,
    device: null,
    workspace: null,
    connected: false,
    canInteract: false,
    canControl: false,
  };
  return {
    ...toCollaborationAgent(hydrated ?? fallback, currentUserId),
    wakeMode: membership.membership.wakeMode,
  };
}

export function toCollaborationChannel(
  item: ChannelListItem,
  members: CollaborationUser[] = [],
  agents: CollaborationAgent[] = [],
): CollaborationChannel {
  return {
    id: String(item.channel._id),
    name: item.channel.name,
    slug: item.channel.slug,
    kind: item.channel.kind,
    topic: item.channel.topic,
    description: item.channel.description,
    memberCount: members.length,
    unreadCount: item.unreadCount,
    notificationMode: item.membership?.notificationMode ?? 'mentions',
    isMember: Boolean(item.membership),
    isDefault: item.channel.isDefault,
    isArchived: Boolean(item.channel.archivedAt),
    members,
    agents,
  };
}

export function toEntityLink(view: EntityLinkView): CollaborationEntityLink {
  return {
    id: String(view.link._id),
    type: view.link.entityType,
    entityId: view.link.entityId,
    label: view.entity.label,
    title: view.entity.title ?? view.entity.key,
    href: view.entity.href,
  };
}

export function toAgentRun(
  run: RunDocument,
  agent: CollaborationAgent,
  events: RunEventDocument[] = [],
): CollaborationAgentRun {
  const normalizedEvents = events.map(event => {
    const metadata =
      event.metadata && typeof event.metadata === 'object'
        ? (event.metadata as {
            requestId?: unknown;
            permissionOptions?: unknown;
            options?: unknown;
          })
        : null;
    const rawOptions = Array.isArray(metadata?.permissionOptions)
      ? metadata.permissionOptions
      : Array.isArray(metadata?.options)
        ? metadata.options
        : [];
    const options = rawOptions
      .map(option => {
        if (!option || typeof option !== 'object') return null;
        const candidate = option as {
          id?: unknown;
          label?: unknown;
          description?: unknown;
        };
        if (
          typeof candidate.id !== 'string' ||
          typeof candidate.label !== 'string'
        ) {
          return null;
        }
        const semanticText = `${candidate.id} ${candidate.label}`.toLowerCase();
        return {
          id: candidate.id,
          label: candidate.label,
          description:
            typeof candidate.description === 'string'
              ? candidate.description
              : undefined,
          kind: semanticText.includes('deny')
            ? ('deny' as const)
            : semanticText.includes('cancel')
              ? ('cancel' as const)
              : ('allow' as const),
        };
      })
      .filter(option => option !== null);
    return {
      id: String(event._id),
      kind: event.kind,
      title: event.title,
      body: event.body,
      metadata:
        metadata &&
        (options.length > 0 || typeof metadata.requestId === 'string')
          ? {
              requestId:
                typeof metadata.requestId === 'string'
                  ? metadata.requestId
                  : undefined,
              options,
            }
          : null,
      createdAt: event.createdAt,
    };
  });

  return {
    id: String(run._id),
    status: run.status,
    currentActivity: run.currentActivity,
    latestSummary: run.latestSummary,
    error: run.error,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    agent,
    events: normalizedEvents,
  };
}

export function toCollaborationMessage({
  view,
  currentUserId,
  canModerateMessages = false,
  agents,
  runs,
  entities = [],
  reactionUsers = [],
}: {
  view: MessageView;
  currentUserId?: string | null;
  canModerateMessages?: boolean;
  agents: CollaborationAgent[];
  runs: Array<{
    run: CollaborationAgentRun;
    triggerMessageId: string;
  }>;
  entities?: EntityLinkView[];
  reactionUsers?: CollaborationUser[];
}): CollaborationMessage {
  const authorAgent = view.authorAgent
    ? (agents.find(agent => agent.id === String(view.authorAgent?._id)) ?? null)
    : null;
  const reactionUsersById = new Map(
    reactionUsers.map(user => [user.id, user.name]),
  );
  const groupedReactions = new Map<
    string,
    { userIds: string[]; current: boolean }
  >();
  for (const reaction of view.reactions) {
    const userId = String(reaction.userId);
    const current = groupedReactions.get(reaction.emoji) ?? {
      userIds: [],
      current: false,
    };
    current.userIds.push(userId);
    current.current ||= userId === currentUserId;
    groupedReactions.set(reaction.emoji, current);
  }
  const messageRun = runs.find(
    item => item.triggerMessageId === String(view.message._id),
  )?.run;

  return {
    id: String(view.message._id),
    clientMessageId: view.message.clientMessageId,
    channelId: String(view.message.channelId),
    body: view.message.body,
    createdAt: view.message.createdAt,
    editedAt: view.message.editedAt,
    deletedAt: view.message.deletedAt,
    threadRootId: view.message.threadRootId
      ? String(view.message.threadRootId)
      : undefined,
    replyToMessageId: view.message.replyToMessageId
      ? String(view.message.replyToMessageId)
      : undefined,
    replyCount: view.message.replyCount,
    lastReplyAt: view.message.lastReplyAt,
    author:
      view.message.actorKind === 'user' && view.authorUser
        ? {
            kind: 'user',
            user: toCollaborationUser(view.authorUser, currentUserId),
          }
        : view.message.actorKind === 'agent' && view.authorAgent
          ? {
              kind: 'agent',
              agent:
                authorAgent ??
                ({
                  id: String(view.authorAgent._id),
                  name: view.authorAgent.name,
                  handle: view.authorAgent.handle,
                  avatar: view.authorAgent.avatar,
                  provider: view.authorAgent.provider,
                  owner: {
                    id: String(view.authorAgent.ownerUserId),
                    name: 'Agent owner',
                  },
                  lifecycleStatus: view.authorAgent.lifecycleStatus,
                  interactionPolicy: 'owner_only',
                } satisfies CollaborationAgent),
            }
          : { kind: 'system', label: 'Vector' },
    attachments: view.attachments.map(attachment => ({
      id: String(attachment._id),
      kind: attachment.kind,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      url: `/api/collaboration/attachments/${String(attachment._id)}`,
      width: attachment.width,
      height: attachment.height,
      duration: attachment.duration,
    })),
    reactions: [...groupedReactions.entries()].map(([emoji, reaction]) => ({
      emoji,
      count: reaction.userIds.length,
      reactedByCurrentUser: reaction.current,
      userNames: reaction.userIds
        .map(userId => reactionUsersById.get(userId))
        .filter((name): name is string => Boolean(name)),
    })),
    isPinned: Boolean(view.pin),
    isSaved: view.saved,
    canEdit:
      view.message.actorKind === 'user' &&
      String(view.message.authorUserId) === currentUserId,
    canDelete:
      !view.message.deletedAt &&
      (canModerateMessages ||
        (view.message.actorKind === 'user' &&
          String(view.message.authorUserId) === currentUserId)),
    run: messageRun,
    threadResolved: Boolean(view.message.resolvedAt),
    followingThread: view.following,
    linkedEntities: entities.map(toEntityLink),
  };
}
