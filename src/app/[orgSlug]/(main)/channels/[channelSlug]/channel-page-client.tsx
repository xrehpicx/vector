'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import usePresence from '@convex-dev/presence/react';
import { useConvex, useQueries } from 'convex/react';
import type { Id } from '@/convex/_generated/dataModel';
import { useRouter } from 'nextjs-toploader/app';
import { AlertCircle, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  useCachedPaginatedQuery,
  useCachedQuery,
  useMutation,
} from '@/lib/convex';
import { Button } from '@/components/ui/button';
import { useScopedPermission } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/convex/_shared/permissions';
import { CollaborationWorkspace } from '@/components/collaboration/collaboration-workspace';
import { CollaborationWorkspaceSkeleton } from '@/components/collaboration/collaboration-skeletons';
import { CreateRequestDialog } from '@/components/requests/create-request-dialog';
import { CreateWorkDialog } from '@/components/work/create-work-dialog';
import {
  toAgentRun,
  toChannelAgent,
  toCollaborationAgent,
  toCollaborationChannel,
  toCollaborationMessage,
  toCollaborationUser,
  type AgentListItem,
  type ChannelListItem,
  type EntityLinkView,
  type MessageView,
  type RunEventDocument,
} from '@/components/collaboration/adapters';
import type {
  AgentWakeMode,
  ChannelNotificationMode,
  CollaborationAgent,
  CollaborationMessage,
  CollaborationUser,
  SendCollaborationMessageInput,
} from '@/components/collaboration/types';
import type { CreateConversationValue } from '@/components/collaboration/channel-dialogs';
import { resolveMemberPresence } from '@/components/collaboration/member-presence';

function attachmentKind(file: File): 'image' | 'video' | 'audio' | 'file' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

interface LocalAttachmentPreview {
  kind: 'image' | 'video' | 'audio' | 'file';
  name: string;
  size: number;
  url: string;
}

function applyLocalAttachmentPreviews(
  message: CollaborationMessage,
  previews: LocalAttachmentPreview[] | undefined,
): CollaborationMessage {
  if (!previews?.length || !message.attachments.length) return message;
  const used = new Set<number>();

  return {
    ...message,
    attachments: message.attachments.map(attachment => {
      const previewIndex = previews.findIndex(
        (preview, index) =>
          !used.has(index) &&
          preview.kind === attachment.kind &&
          preview.name === attachment.name &&
          preview.size === attachment.size,
      );
      if (previewIndex < 0) return attachment;
      used.add(previewIndex);
      return { ...attachment, url: previews[previewIndex].url };
    }),
  };
}

function useStableNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

function creationTitle(message: CollaborationMessage) {
  const normalized = message.body.replace(/\s+/g, ' ').trim();
  if (normalized) return normalized.slice(0, 160);
  return message.attachments[0]?.name ?? 'Conversation follow-up';
}

function creationContext(message: CollaborationMessage, channelName: string) {
  const author =
    message.author.user?.name ??
    message.author.agent?.name ??
    message.author.label ??
    'Vector';
  return [
    `Created from #${channelName}, from ${author}.`,
    message.body,
    message.attachments.length > 0
      ? `Attachments: ${message.attachments.map(item => item.name).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function ChannelPageClient({
  orgSlug,
  channelSlug,
}: {
  orgSlug: string;
  channelSlug: string;
}) {
  const currentUser = useCachedQuery(api.users.currentUser);
  const channels = useCachedQuery(api.collaboration.channels.list, {
    orgSlug,
    limit: 100,
  });
  const workspaceMemberRows = useCachedQuery(
    api.organizations.queries.searchMembers,
    { orgSlug, limit: 100 },
  );
  const now = useStableNow();
  const agentViews = useCachedQuery(api.collaboration.agents.list, {
    orgSlug,
    now,
    limit: 100,
  });
  const [retainedAgentViews, setRetainedAgentViews] = useState<AgentListItem[]>(
    [],
  );

  useEffect(() => {
    if (agentViews !== undefined) {
      setRetainedAgentViews(agentViews);
    }
  }, [agentViews]);

  const effectiveAgentViews = agentViews ?? retainedAgentViews;

  if (
    currentUser === undefined ||
    currentUser === null ||
    channels === undefined ||
    workspaceMemberRows === undefined
  ) {
    return <CollaborationWorkspaceSkeleton />;
  }

  const channelItem = channels.find(item => item.channel.slug === channelSlug);
  if (!channelItem) {
    return (
      <div className='flex h-[calc(100dvh-5rem)] min-h-[32rem] items-center justify-center px-6 lg:h-[calc(100dvh-1rem)]'>
        <div className='flex max-w-sm flex-col items-center gap-3 text-center'>
          <div className='bg-muted flex size-9 items-center justify-center rounded-lg'>
            <AlertCircle
              className='text-muted-foreground size-4'
              aria-hidden='true'
            />
          </div>
          <div>
            <h1 className='text-sm font-semibold'>Channel unavailable</h1>
            <p className='text-muted-foreground mt-1 text-xs leading-5 text-pretty'>
              It may have been archived, renamed, or restricted to invited
              members.
            </p>
          </div>
          <Button
            render={<Link href={`/${orgSlug}/channels`} />}
            nativeButton={false}
            size='sm'
            variant='outline'
            className='h-8 text-xs'
          >
            Open conversations
          </Button>
        </div>
      </div>
    );
  }

  const currentUserId = String(currentUser._id);
  const members = workspaceMemberRows
    .flatMap(row => (row.user ? [row.user] : []))
    .map(user => toCollaborationUser(user, currentUserId));
  const availableAgents = effectiveAgentViews.map(view =>
    toCollaborationAgent(view, currentUserId),
  );

  return (
    <ActiveChannel
      orgSlug={orgSlug}
      channelItem={channelItem}
      channelItems={channels}
      workspaceMembers={members}
      currentUser={toCollaborationUser(currentUser, currentUserId)}
      agentViews={effectiveAgentViews}
      availableAgents={availableAgents}
    />
  );
}

function ActiveChannel({
  orgSlug,
  channelItem,
  channelItems,
  workspaceMembers,
  currentUser,
  agentViews,
  availableAgents,
}: {
  orgSlug: string;
  channelItem: ChannelListItem;
  channelItems: ChannelListItem[];
  workspaceMembers: CollaborationUser[];
  currentUser: CollaborationUser;
  agentViews: AgentListItem[];
  availableAgents: CollaborationAgent[];
}) {
  const router = useRouter();
  const convex = useConvex();
  const channelId = channelItem.channel._id;
  const { hasPermission: hasMessageModerationPermission } = useScopedPermission(
    { orgSlug },
    PERMISSIONS.CHANNEL_MESSAGE_MODERATE,
  );
  const roomId = `channel/${String(channelId)}`;
  const channelMemberRows = useCachedQuery(
    api.collaboration.channels.listMembers,
    { channelId, limit: 100 },
  );
  const channelAgentRows = useCachedQuery(
    api.collaboration.agents.listChannelMemberships,
    { channelId, limit: 50 },
  );
  const messagePage = useCachedPaginatedQuery(
    api.collaboration.messages.listChannel,
    { channelId },
    { initialNumItems: 50 },
  );
  const runPage = useCachedPaginatedQuery(
    api.collaboration.runs.listChannel,
    { channelId },
    { initialNumItems: 50 },
  );
  const presenceStates = usePresence(api.presence, roomId, currentUser.id);
  const channelUserIds = useMemo(
    () =>
      (channelMemberRows ?? []).flatMap(row =>
        row.user ? [row.user._id] : [],
      ),
    [channelMemberRows],
  );
  const memberStatuses = useCachedQuery(api.status.getStatuses, {
    userIds: channelUserIds,
  });
  const liveUserIds = useMemo(() => {
    const userIds = new Set(
      (presenceStates ?? [])
        .filter(state => state.online)
        .map(state => state.userId),
    );
    userIds.add(currentUser.id);
    return userIds;
  }, [currentUser.id, presenceStates]);

  const createChannel = useMutation(api.collaboration.channels.create);
  const joinChannel = useMutation(api.collaboration.channels.join);
  const addChannelMember = useMutation(api.collaboration.channels.addMember);
  const setPreferences = useMutation(api.collaboration.channels.setPreferences);
  const addAgentToChannel = useMutation(api.collaboration.agents.addToChannel);
  const updateAgentMembership = useMutation(
    api.collaboration.agents.updateChannelMembership,
  );
  const removeAgentFromChannel = useMutation(
    api.collaboration.agents.removeFromChannel,
  );
  const generateUploadUrl = useMutation(
    api.collaboration.messages.generateUploadUrl,
  );
  const sendMessage = useMutation(api.collaboration.messages.send);
  const editMessage = useMutation(api.collaboration.messages.edit);
  const removeMessage = useMutation(api.collaboration.messages.remove);
  const toggleReaction = useMutation(api.collaboration.messages.toggleReaction);
  const togglePin = useMutation(api.collaboration.messages.togglePin);
  const toggleSaved = useMutation(api.collaboration.messages.toggleSaved);
  const markRead = useMutation(api.collaboration.messages.markRead);
  const setThreadResolved = useMutation(
    api.collaboration.messages.setThreadResolved,
  );
  const followThread = useMutation(api.collaboration.messages.followThread);
  const unfollowThread = useMutation(api.collaboration.messages.unfollowThread);
  const respondToPermission = useMutation(
    api.collaboration.runs.respondToPermission,
  );
  const cancelRun = useMutation(api.collaboration.runs.cancel);
  const updatePresence = useMutation(api.presence.updateData);
  const linkEntity = useMutation(api.collaboration.messages.linkEntity);
  const [creationDraft, setCreationDraft] = useState<{
    kind: 'request' | 'work';
    message: CollaborationMessage;
  } | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<
    CollaborationMessage[]
  >([]);
  const [localAttachmentPreviews, setLocalAttachmentPreviews] = useState<
    Record<string, LocalAttachmentPreview[]>
  >({});
  const localAttachmentPreviewsRef = useRef(localAttachmentPreviews);

  useEffect(() => {
    localAttachmentPreviewsRef.current = localAttachmentPreviews;
  }, [localAttachmentPreviews]);

  useEffect(() => {
    return () => {
      for (const previews of Object.values(
        localAttachmentPreviewsRef.current,
      )) {
        for (const preview of previews) URL.revokeObjectURL(preview.url);
      }
    };
  }, []);

  const entityRequests = useMemo(
    () =>
      Object.fromEntries(
        messagePage.results.map(view => [
          `message:${String(view.message._id)}`,
          {
            query: api.collaboration.messages.listEntityLinks,
            args: { messageId: view.message._id },
          },
        ]),
      ),
    [messagePage.results],
  );
  const eventRequests = useMemo(
    () =>
      Object.fromEntries(
        runPage.results.map(run => [
          `run:${String(run._id)}`,
          {
            query: api.collaboration.runs.listEvents,
            args: {
              runId: run._id,
              paginationOpts: { numItems: 200, cursor: null },
            },
          },
        ]),
      ),
    [runPage.results],
  );
  const entityResponses = useQueries(entityRequests);
  const eventResponses = useQueries(eventRequests);
  const threadRequests = useMemo(
    () =>
      Object.fromEntries(
        messagePage.results
          .filter(view => view.message.replyCount > 0)
          .map(view => [
            `thread:${String(view.message._id)}`,
            {
              query: api.collaboration.messages.listThread,
              args: {
                threadRootId: view.message._id,
                paginationOpts: { numItems: 100, cursor: null },
              },
            },
          ]),
      ),
    [messagePage.results],
  );
  const threadResponses = useQueries(threadRequests);
  const confirmedClientMessageIds = useMemo(() => {
    const confirmed = new Set<string>();
    for (const view of messagePage.results) {
      if (view.message.clientMessageId) {
        confirmed.add(view.message.clientMessageId);
      }
    }
    for (const response of Object.values(threadResponses)) {
      if (
        !response ||
        response instanceof Error ||
        typeof response !== 'object' ||
        !('page' in response)
      ) {
        continue;
      }
      for (const view of response.page as MessageView[]) {
        if (view.message.clientMessageId) {
          confirmed.add(view.message.clientMessageId);
        }
      }
    }
    return confirmed;
  }, [messagePage.results, threadResponses]);
  const confirmedClientMessageKey = useMemo(
    () => [...confirmedClientMessageIds].sort().join('|'),
    [confirmedClientMessageIds],
  );

  useEffect(() => {
    if (!confirmedClientMessageKey) return;
    setOptimisticMessages(current => {
      const next = current.filter(
        message =>
          !message.clientMessageId ||
          !confirmedClientMessageIds.has(message.clientMessageId),
      );
      return next.length === current.length ? current : next;
    });
  }, [confirmedClientMessageIds, confirmedClientMessageKey]);

  const channelMembers = useMemo(
    () =>
      (channelMemberRows ?? [])
        .flatMap(row => (row.user ? [row.user] : []))
        .map(user => {
          const member = toCollaborationUser(user, currentUser.id);
          const savedStatus = memberStatuses?.[String(user._id)];

          return {
            ...member,
            presence: resolveMemberPresence({
              savedPresence: savedStatus?.presence,
              isLive: liveUserIds.has(String(user._id)),
            }),
            status:
              [savedStatus?.customEmoji, savedStatus?.customText]
                .filter(Boolean)
                .join(' ') || undefined,
          };
        }),
    [channelMemberRows, currentUser.id, liveUserIds, memberStatuses],
  );
  const canModerateMessages =
    hasMessageModerationPermission ||
    (channelMemberRows ?? []).some(
      row =>
        String(row.membership.userId) === currentUser.id &&
        (row.membership.role === 'owner' ||
          row.membership.role === 'moderator'),
    );
  const channelAgents = useMemo(
    () =>
      (channelAgentRows ?? []).map(row =>
        toChannelAgent(row, agentViews, currentUser.id),
      ),
    [agentViews, channelAgentRows, currentUser.id],
  );
  const channel = useMemo(
    () => toCollaborationChannel(channelItem, channelMembers, channelAgents),
    [channelItem, channelMembers, channelAgents],
  );
  const channels = useMemo(
    () =>
      channelItems.map(item =>
        item.channel._id === channelItem.channel._id
          ? channel
          : toCollaborationChannel(item),
      ),
    [channel, channelItem.channel._id, channelItems],
  );
  const mappedRuns = useMemo(() => {
    return runPage.results.flatMap(run => {
      const agent = availableAgents.find(
        item => item.id === String(run.agentId),
      );
      if (!agent) return [];
      const response = eventResponses[`run:${String(run._id)}`];
      const events =
        response &&
        !(response instanceof Error) &&
        typeof response === 'object' &&
        'page' in response
          ? (response.page as RunEventDocument[])
          : [];
      return [
        {
          run: toAgentRun(run, agent, events),
          triggerMessageId: String(run.triggerMessageId),
        },
      ];
    });
  }, [availableAgents, eventResponses, runPage.results]);
  const messages = useMemo(() => {
    const confirmedMessages = [...messagePage.results].reverse().map(view => {
      const response = entityResponses[`message:${String(view.message._id)}`];
      const entities =
        Array.isArray(response) && !(response instanceof Error)
          ? (response as EntityLinkView[])
          : [];
      const message = toCollaborationMessage({
        view,
        currentUserId: currentUser.id,
        canModerateMessages,
        agents: availableAgents,
        runs: mappedRuns,
        entities,
        reactionUsers: channelMembers,
      });
      return applyLocalAttachmentPreviews(
        message,
        localAttachmentPreviews[message.id],
      );
    });
    const pendingChannelMessages = optimisticMessages.filter(
      message =>
        !message.threadRootId &&
        (!message.clientMessageId ||
          !confirmedClientMessageIds.has(message.clientMessageId)),
    );
    return [...confirmedMessages, ...pendingChannelMessages].sort(
      (first, second) => first.createdAt - second.createdAt,
    );
  }, [
    availableAgents,
    canModerateMessages,
    channelMembers,
    confirmedClientMessageIds,
    currentUser.id,
    entityResponses,
    localAttachmentPreviews,
    mappedRuns,
    messagePage.results,
    optimisticMessages,
  ]);
  const threadMessages = useMemo(() => {
    const confirmedThreads = Object.fromEntries(
      messagePage.results
        .filter(view => view.message.replyCount > 0)
        .map(root => {
          const response =
            threadResponses[`thread:${String(root.message._id)}`];
          const page =
            response &&
            !(response instanceof Error) &&
            typeof response === 'object' &&
            'page' in response
              ? (response.page as MessageView[])
              : [];
          return [
            String(root.message._id),
            page.map(view => {
              const message = toCollaborationMessage({
                view,
                currentUserId: currentUser.id,
                canModerateMessages,
                agents: availableAgents,
                runs: mappedRuns,
                reactionUsers: channelMembers,
              });
              return applyLocalAttachmentPreviews(
                message,
                localAttachmentPreviews[message.id],
              );
            }),
          ];
        }),
    ) as Record<string, CollaborationMessage[]>;

    for (const message of optimisticMessages) {
      if (
        !message.threadRootId ||
        (message.clientMessageId &&
          confirmedClientMessageIds.has(message.clientMessageId))
      ) {
        continue;
      }
      confirmedThreads[message.threadRootId] = [
        ...(confirmedThreads[message.threadRootId] ?? []),
        message,
      ].sort((first, second) => first.createdAt - second.createdAt);
    }

    return confirmedThreads;
  }, [
    availableAgents,
    channelMembers,
    confirmedClientMessageIds,
    currentUser.id,
    canModerateMessages,
    localAttachmentPreviews,
    mappedRuns,
    messagePage.results,
    optimisticMessages,
    threadResponses,
  ]);

  const typingUsers = useMemo(() => {
    return (presenceStates ?? []).flatMap(state => {
      if (
        !state.online ||
        state.userId === currentUser.id ||
        !state.data ||
        typeof state.data !== 'object' ||
        !('typing' in state.data) ||
        state.data.typing !== true
      ) {
        return [];
      }
      const user = workspaceMembers.find(member => member.id === state.userId);
      return user ? [{ ...user, presence: 'online' as const }] : [];
    });
  }, [currentUser.id, presenceStates, workspaceMembers]);

  useEffect(() => {
    const latestMessage = messagePage.results[0];
    if (!latestMessage) return;
    void markRead({
      channelId,
      messageId: latestMessage.message._id,
    });
  }, [channelId, markRead, messagePage.results]);

  const uploadFiles = async (files: File[]) => {
    return await Promise.all(
      files.map(async file => {
        const uploadUrl = await generateUploadUrl({ channelId });
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });
        if (!response.ok) throw new Error('Attachment upload failed');
        const payload = (await response.json()) as { storageId: string };
        return {
          storageId: payload.storageId as Id<'_storage'>,
          kind: attachmentKind(file),
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        };
      }),
    );
  };

  const handleSend = async (input: SendCollaborationMessageInput) => {
    const clientMessageId = input.clientMessageId || crypto.randomUUID();
    const pendingPreviews = input.attachments.map(file => ({
      kind: attachmentKind(file),
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
    }));
    const optimisticMessage: CollaborationMessage = {
      id: `optimistic:${clientMessageId}`,
      clientMessageId,
      channelId: String(channelId),
      body: input.body,
      createdAt: Date.now(),
      threadRootId: input.threadRootId,
      replyToMessageId: input.replyToMessageId,
      replyCount: 0,
      author: { kind: 'user', user: currentUser },
      attachments: pendingPreviews.map((preview, index) => ({
        id: `optimistic:${clientMessageId}:${index}`,
        kind: preview.kind,
        name: preview.name,
        contentType:
          input.attachments[index]?.type || 'application/octet-stream',
        size: preview.size,
        url: preview.url,
      })),
      reactions: [],
      isPinned: false,
      isSaved: false,
      canEdit: false,
      canDelete: false,
      linkedEntities: [],
    };
    setOptimisticMessages(current => [...current, optimisticMessage]);

    try {
      const attachments = await uploadFiles(input.attachments);
      const result = await sendMessage({
        channelId,
        body: input.body,
        format: 'markdown',
        threadRootId: input.threadRootId
          ? (input.threadRootId as Id<'channelMessages'>)
          : undefined,
        replyToMessageId: input.replyToMessageId
          ? (input.replyToMessageId as Id<'channelMessages'>)
          : undefined,
        clientMessageId,
        mentionedUserIds: input.mentions
          .filter(mention => mention.type === 'user')
          .map(mention => mention.id as Id<'users'>),
        mentionedAgentIds: input.mentions
          .filter(mention => mention.type === 'agent')
          .map(mention => mention.id as Id<'registeredAgents'>),
        attachments,
      });
      if (pendingPreviews.length > 0) {
        const nextPreviews = {
          ...localAttachmentPreviewsRef.current,
          [String(result.messageId)]: pendingPreviews,
        };
        const messageIds = Object.keys(nextPreviews);
        for (const messageId of messageIds.slice(0, -3)) {
          for (const preview of nextPreviews[messageId]) {
            URL.revokeObjectURL(preview.url);
          }
          delete nextPreviews[messageId];
        }
        localAttachmentPreviewsRef.current = nextPreviews;
        setLocalAttachmentPreviews(nextPreviews);
      }
      await updatePresence({ roomId, data: { typing: false } });
    } catch (error) {
      setOptimisticMessages(current =>
        current.filter(message => message.clientMessageId !== clientMessageId),
      );
      for (const preview of pendingPreviews) {
        URL.revokeObjectURL(preview.url);
      }
      toast.error(
        error instanceof Error ? error.message : 'Unable to send message.',
      );
      throw error;
    }
  };

  const handleCreateConversation = async (value: CreateConversationValue) => {
    const selectedMembers = workspaceMembers.filter(member =>
      value.memberUserIds.includes(member.id),
    );
    const directName =
      selectedMembers.map(member => member.name).join(', ') || 'Direct message';
    const createdId = await createChannel({
      orgSlug,
      kind: value.kind,
      name:
        value.kind === 'direct' || value.kind === 'group_direct'
          ? directName
          : value.name,
      topic: value.topic || undefined,
      memberUserIds: value.memberUserIds.map(id => id as Id<'users'>),
    });
    const created = await convex.query(api.collaboration.channels.get, {
      channelId: createdId,
    });
    router.push(`/${orgSlug}/channels/${created.channel.slug}`);
    return String(createdId);
  };

  const handleJoin = async (targetChannelId: string) => {
    const id = targetChannelId as Id<'channels'>;
    await joinChannel({ channelId: id });
    const joined = await convex.query(api.collaboration.channels.get, {
      channelId: id,
    });
    router.push(`/${orgSlug}/channels/${joined.channel.slug}`);
  };

  if (channelMemberRows === undefined || channelAgentRows === undefined) {
    return <CollaborationWorkspaceSkeleton />;
  }

  const activeRuns = mappedRuns
    .map(item => item.run)
    .filter(run =>
      ['queued', 'starting', 'running', 'waiting_for_permission'].includes(
        run.status,
      ),
    );

  return (
    <>
      <CollaborationWorkspace
        orgSlug={orgSlug}
        channel={channel}
        channels={channels}
        messages={messages}
        threadMessages={threadMessages}
        workspaceMembers={workspaceMembers}
        currentUser={currentUser}
        availableAgents={availableAgents}
        typingUsers={typingUsers}
        activeRuns={activeRuns}
        callbacks={{
          onSendMessage: handleSend,
          onEditMessage: async (messageId, body) => {
            await editMessage({
              messageId: messageId as Id<'channelMessages'>,
              body,
            });
          },
          onDeleteMessage: async messageId => {
            await removeMessage({
              messageId: messageId as Id<'channelMessages'>,
            });
          },
          onToggleReaction: async (messageId, emoji) => {
            await toggleReaction({
              messageId: messageId as Id<'channelMessages'>,
              emoji,
            });
          },
          onTogglePin: async messageId => {
            await togglePin({
              messageId: messageId as Id<'channelMessages'>,
            });
          },
          onToggleSave: async messageId => {
            await toggleSaved({
              messageId: messageId as Id<'channelMessages'>,
            });
          },
          onNotificationModeChange: async (mode: ChannelNotificationMode) => {
            await setPreferences({ channelId, notificationMode: mode });
          },
          onAgentWakeModeChange: async (
            agentId: string,
            mode: AgentWakeMode,
          ) => {
            await updateAgentMembership({
              channelId,
              agentId: agentId as Id<'registeredAgents'>,
              wakeMode: mode,
            });
          },
          onRemoveAgent: async agentId => {
            await removeAgentFromChannel({
              channelId,
              agentId: agentId as Id<'registeredAgents'>,
            });
          },
          onSetThreadResolved: async (threadRootId, resolved) => {
            await setThreadResolved({
              threadRootId: threadRootId as Id<'channelMessages'>,
              resolved,
            });
          },
          onFollowThread: async (threadRootId, following) => {
            const args = {
              threadRootId: threadRootId as Id<'channelMessages'>,
            };
            if (following) await followThread(args);
            else await unfollowThread(args);
          },
          onRespondToPermission: async (runId, optionId) => {
            await respondToPermission({
              runId: runId as Id<'collaborationAgentRuns'>,
              optionId,
            });
          },
          onCancelRun: async runId => {
            await cancelRun({
              runId: runId as Id<'collaborationAgentRuns'>,
            });
          },
          onCreateRequestFromMessage: message => {
            setCreationDraft({ kind: 'request', message });
          },
          onCreateWorkFromMessage: message => {
            setCreationDraft({ kind: 'work', message });
          },
        }}
        onCreateConversation={handleCreateConversation}
        onJoinChannel={handleJoin}
        onAddMembers={async userIds => {
          await Promise.all(
            userIds.map(userId =>
              addChannelMember({
                channelId,
                userId: userId as Id<'users'>,
              }),
            ),
          );
        }}
        onAddAgent={async agentId => {
          await addAgentToChannel({
            channelId,
            agentId: agentId as Id<'registeredAgents'>,
            wakeMode: 'mentions',
          });
        }}
        onTypingChange={typing => {
          void updatePresence({ roomId, data: { typing } });
        }}
        isReadOnly={!channelItem.membership}
        readOnlyReason='Join this channel before posting.'
        hasEarlierMessages={messagePage.status === 'CanLoadMore'}
        onLoadEarlier={() => messagePage.loadMore(50)}
      />
      {creationDraft?.kind === 'request' ? (
        <CreateRequestDialog
          key={`request:${creationDraft.message.id}`}
          orgSlug={orgSlug}
          open
          onOpenChange={open => {
            if (!open) setCreationDraft(null);
          }}
          trigger={<span className='hidden' />}
          defaultTitle={creationTitle(creationDraft.message)}
          defaultDescription={creationContext(
            creationDraft.message,
            channel.name,
          )}
          defaultExpectedOutput='Resolve the request with a clear, reviewable outcome and report the result back to this conversation.'
          onCreated={async result => {
            await linkEntity({
              messageId: creationDraft.message.id as Id<'channelMessages'>,
              entityType: 'request',
              entityId: String(result.requestId),
            });
          }}
        />
      ) : null}
      {creationDraft?.kind === 'work' ? (
        <CreateWorkDialog
          key={`work:${creationDraft.message.id}`}
          orgSlug={orgSlug}
          open
          onOpenChange={open => {
            if (!open) setCreationDraft(null);
          }}
          trigger={<span className='hidden' />}
          defaultTitle={creationTitle(creationDraft.message)}
          defaultWorkpad={creationContext(creationDraft.message, channel.name)}
          onCreated={async result => {
            await linkEntity({
              messageId: creationDraft.message.id as Id<'channelMessages'>,
              entityType: 'issue',
              entityId: String(result.workId),
            });
          }}
        />
      ) : null}
    </>
  );
}

export function EmptyCollaborationState() {
  return (
    <div className='text-muted-foreground flex min-h-72 flex-col items-center justify-center gap-2 px-6 text-center'>
      <MessageSquareText className='size-7 opacity-40' aria-hidden='true' />
      <p className='text-sm font-medium'>Start the conversation</p>
      <p className='max-w-sm text-xs leading-5 text-pretty'>
        Share an update, attach a file, or tag a teammate or agent.
      </p>
    </div>
  );
}
