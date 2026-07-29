'use client';

import { useEffect, useState } from 'react';
import { Hash } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ChannelHeader, type CollaborationContextView } from './channel-header';
import { ChannelList } from './channel-list';
import type { CreateConversationValue } from './channel-dialogs';
import { CollaborationContextPanel } from './context-panel';
import { MessageComposer } from './message-composer';
import { MessageTimeline } from './message-timeline';
import type {
  AgentWakeMode,
  ChannelNotificationMode,
  CollaborationAgent,
  CollaborationAgentRun,
  CollaborationCallbacks,
  CollaborationChannel,
  CollaborationEntityLink,
  CollaborationMessage,
  CollaborationUser,
  SendCollaborationMessageInput,
} from './types';

function useWideContextPanel() {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return wide;
}

export interface CollaborationWorkspaceProps {
  orgSlug: string;
  channel: CollaborationChannel;
  channels: CollaborationChannel[];
  messages: CollaborationMessage[];
  threadMessages?: Record<string, CollaborationMessage[]>;
  workspaceMembers: CollaborationUser[];
  currentUser?: CollaborationUser | null;
  availableAgents: CollaborationAgent[];
  typingUsers?: CollaborationUser[];
  typingAgents?: CollaborationAgent[];
  activeRuns?: CollaborationAgentRun[];
  linkableEntities?: CollaborationEntityLink[];
  callbacks: CollaborationCallbacks;
  onCreateConversation: (
    value: CreateConversationValue,
  ) => Promise<void | string> | void | string;
  onJoinChannel: (channelId: string) => Promise<void> | void;
  onAddMembers?: (userIds: string[]) => Promise<void> | void;
  onAddAgent?: (agentId: string) => Promise<void> | void;
  onTypingChange?: (typing: boolean, threadRootId?: string) => void;
  isReadOnly?: boolean;
  readOnlyReason?: string;
  hasEarlierMessages?: boolean;
  onLoadEarlier?: () => void;
}

export function CollaborationWorkspace({
  orgSlug,
  channel,
  channels,
  messages,
  threadMessages = {},
  workspaceMembers,
  currentUser,
  availableAgents,
  typingUsers,
  typingAgents,
  activeRuns,
  linkableEntities,
  callbacks,
  onCreateConversation,
  onJoinChannel,
  onAddMembers,
  onAddAgent,
  onTypingChange,
  isReadOnly,
  readOnlyReason,
  hasEarlierMessages,
  onLoadEarlier,
}: CollaborationWorkspaceProps) {
  const wideContextPanel = useWideContextPanel();
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [contextView, setContextView] =
    useState<CollaborationContextView | null>(null);
  const [threadRoot, setThreadRoot] = useState<CollaborationMessage | null>(
    null,
  );

  const openContext = (view: CollaborationContextView) => {
    if (view !== 'thread') setThreadRoot(null);
    setContextView(current => (current === view ? null : view));
  };

  const openThread = (message: CollaborationMessage) => {
    setThreadRoot(message);
    setContextView('thread');
  };

  const closeContext = () => {
    setContextView(null);
    setThreadRoot(null);
  };

  const contextPanel =
    contextView === null ? null : (
      <CollaborationContextPanel
        orgSlug={orgSlug}
        view={contextView}
        channel={channel}
        messages={messages}
        threadRoot={threadRoot}
        threadReplies={threadRoot ? (threadMessages[threadRoot.id] ?? []) : []}
        currentUser={currentUser}
        workspaceMembers={workspaceMembers}
        availableAgents={availableAgents}
        onClose={closeContext}
        onSendReply={callbacks.onSendMessage}
        onToggleReaction={callbacks.onToggleReaction}
        onTogglePin={callbacks.onTogglePin}
        onToggleSave={callbacks.onToggleSave}
        onSetThreadResolved={callbacks.onSetThreadResolved}
        onFollowThread={callbacks.onFollowThread}
        onAddMembers={onAddMembers}
        onAddAgent={onAddAgent}
        onAgentWakeModeChange={callbacks.onAgentWakeModeChange}
        onRemoveAgent={callbacks.onRemoveAgent}
      />
    );

  return (
    <div className='flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] min-h-0 min-w-0 overflow-hidden lg:h-[calc(100dvh-1rem)] lg:min-h-[32rem]'>
      <div className='hidden h-full w-56 shrink-0 border-r md:block'>
        <ChannelList
          orgSlug={orgSlug}
          channels={channels}
          workspaceMembers={workspaceMembers}
          activeChannelId={channel.id}
          onCreate={onCreateConversation}
          onJoin={onJoinChannel}
        />
      </div>

      <section className='flex min-w-0 flex-1 flex-col' aria-label='Channel'>
        <ChannelHeader
          orgSlug={orgSlug}
          channel={channel}
          activeView={contextView}
          onOpenContext={openContext}
          onOpenChannels={() => setChannelsOpen(true)}
          onNotificationModeChange={(mode: ChannelNotificationMode) =>
            callbacks.onNotificationModeChange?.(mode)
          }
        />

        {channel.description ? (
          <div className='bg-muted/20 flex min-h-7 shrink-0 items-center gap-1.5 border-b px-3 text-xs'>
            <Hash
              className='text-muted-foreground size-3 shrink-0'
              aria-hidden='true'
            />
            <span className='text-muted-foreground min-w-0 truncate'>
              {channel.description}
            </span>
          </div>
        ) : null}

        <MessageTimeline
          messages={messages}
          typingUsers={typingUsers}
          typingAgents={typingAgents}
          activeRuns={activeRuns}
          onOpenThread={openThread}
          onEditMessage={callbacks.onEditMessage}
          onDeleteMessage={callbacks.onDeleteMessage}
          onToggleReaction={callbacks.onToggleReaction}
          onTogglePin={callbacks.onTogglePin}
          onToggleSave={callbacks.onToggleSave}
          onRespondToPermission={callbacks.onRespondToPermission}
          onCancelRun={callbacks.onCancelRun}
          linkableEntities={linkableEntities}
          onLinkEntity={callbacks.onLinkEntity}
          onCreateRequestFromMessage={callbacks.onCreateRequestFromMessage}
          onCreateWorkFromMessage={callbacks.onCreateWorkFromMessage}
          hasEarlier={hasEarlierMessages}
          onLoadEarlier={onLoadEarlier}
        />

        <MessageComposer
          channelName={channel.name}
          currentUser={currentUser}
          users={channel.members}
          agents={channel.agents}
          disabled={isReadOnly || channel.isArchived}
          disabledReason={
            channel.isArchived ? 'This channel is archived.' : readOnlyReason
          }
          onSend={callbacks.onSendMessage}
          onTyping={callbacks.onTyping}
          onTypingChange={onTypingChange}
        />
      </section>

      {wideContextPanel && contextPanel ? (
        <aside className='hidden h-full w-[22rem] shrink-0 border-l xl:block'>
          {contextPanel}
        </aside>
      ) : null}

      <Sheet open={channelsOpen} onOpenChange={setChannelsOpen}>
        <SheetContent
          side='left'
          showCloseButton={false}
          className='w-[86vw] max-w-80 gap-0 p-0'
        >
          <SheetHeader className='sr-only'>
            <SheetTitle>Workspace conversations</SheetTitle>
            <SheetDescription>
              Channels, direct messages, and agents.
            </SheetDescription>
          </SheetHeader>
          <ChannelList
            orgSlug={orgSlug}
            channels={channels}
            workspaceMembers={workspaceMembers}
            activeChannelId={channel.id}
            onCreate={onCreateConversation}
            onJoin={onJoinChannel}
            onNavigate={() => setChannelsOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {!wideContextPanel ? (
        <Sheet
          open={contextView !== null}
          onOpenChange={open => !open && closeContext()}
        >
          <SheetContent
            side='right'
            showCloseButton={false}
            className='w-full gap-0 p-0 sm:max-w-md'
          >
            <SheetHeader className='sr-only'>
              <SheetTitle>Channel context</SheetTitle>
              <SheetDescription>
                Thread, search, members, agents, pins, or files.
              </SheetDescription>
            </SheetHeader>
            {contextPanel}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

export type { AgentWakeMode, SendCollaborationMessageInput };
