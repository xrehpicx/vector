'use client';

import { useEffect, useRef } from 'react';
import { Bot, MessageSquareText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageItem } from './message-item';
import type {
  CollaborationAgent,
  CollaborationAgentRun,
  CollaborationEntityLink,
  CollaborationMessage,
  CollaborationUser,
} from './types';

interface MessageTimelineProps {
  messages: CollaborationMessage[];
  typingUsers?: CollaborationUser[];
  typingAgents?: CollaborationAgent[];
  activeRuns?: CollaborationAgentRun[];
  onOpenThread: (message: CollaborationMessage) => void;
  onEditMessage?: (messageId: string, body: string) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void> | void;
  onTogglePin?: (messageId: string, pinned: boolean) => Promise<void> | void;
  onToggleSave?: (messageId: string, saved: boolean) => Promise<void> | void;
  onRespondToPermission?: (
    runId: string,
    optionId: string,
  ) => Promise<void> | void;
  onCancelRun?: (runId: string) => Promise<void> | void;
  linkableEntities?: CollaborationEntityLink[];
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
  onLoadEarlier?: () => void;
  hasEarlier?: boolean;
}

export function MessageTimeline({
  messages,
  typingUsers = [],
  typingAgents = [],
  activeRuns = [],
  onOpenThread,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onTogglePin,
  onToggleSave,
  onRespondToPermission,
  onCancelRun,
  linkableEntities,
  onLinkEntity,
  onCreateRequestFromMessage,
  onCreateWorkFromMessage,
  onLoadEarlier,
  hasEarlier,
}: MessageTimelineProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const previousLastId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const lastId = messages.at(-1)?.id;
    if (lastId && lastId !== previousLastId.current) {
      endRef.current?.scrollIntoView({
        block: 'end',
        behavior: previousLastId.current ? 'smooth' : 'auto',
      });
      previousLastId.current = lastId;
    }
  }, [messages]);

  return (
    <ScrollArea
      className='min-h-0 flex-1'
      viewportClassName='overscroll-contain'
    >
      <div role='log' aria-live='polite' aria-relevant='additions text'>
        {hasEarlier ? (
          <div className='flex justify-center py-2'>
            <button
              type='button'
              onClick={onLoadEarlier}
              className='text-muted-foreground hover:text-foreground focus-visible:ring-ring min-h-7 rounded-md px-2 text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
            >
              Show earlier messages
            </button>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className='text-muted-foreground flex min-h-72 flex-col items-center justify-center gap-2 px-6 text-center'>
            <MessageSquareText
              className='size-7 opacity-40'
              aria-hidden='true'
            />
            <p className='text-sm font-medium'>Start the conversation</p>
            <p className='max-w-sm text-xs leading-5 text-pretty'>
              Share an update, attach a file, or tag a teammate or agent to
              begin work together.
            </p>
          </div>
        ) : (
          <div className='py-2'>
            {messages.map(message => (
              <MessageItem
                key={message.id}
                message={message}
                onOpenThread={onOpenThread}
                onEdit={onEditMessage}
                onDelete={onDeleteMessage}
                onToggleReaction={onToggleReaction}
                onTogglePin={onTogglePin}
                onToggleSave={onToggleSave}
                onRespondToPermission={onRespondToPermission}
                onCancelRun={onCancelRun}
                linkableEntities={linkableEntities}
                onLinkEntity={onLinkEntity}
                onCreateRequestFromMessage={onCreateRequestFromMessage}
                onCreateWorkFromMessage={onCreateWorkFromMessage}
              />
            ))}
          </div>
        )}

        {typingUsers.length > 0 || typingAgents.length > 0 ? (
          <div
            role='status'
            className='text-muted-foreground flex min-h-7 items-center gap-1.5 px-4 text-xs'
          >
            <Bot className='size-3.5 shrink-0' aria-hidden='true' />
            <span className='truncate'>
              {[
                ...typingUsers.map(user => user.name),
                ...typingAgents.map(agent => `@${agent.handle}`),
              ].join(', ')}{' '}
              {typingUsers.length + typingAgents.length === 1
                ? 'is typing'
                : 'are typing'}
              …
            </span>
          </div>
        ) : activeRuns.length > 0 ? (
          <div
            role='status'
            className='text-muted-foreground flex min-h-7 items-center gap-1.5 px-4 text-xs'
          >
            <Bot className='size-3.5 animate-pulse' aria-hidden='true' />
            <span className='truncate'>
              {activeRuns
                .map(
                  run =>
                    `@${run.agent.handle} ${run.currentActivity ?? 'is working'}`,
                )
                .join(' · ')}
            </span>
          </div>
        ) : (
          <div className='min-h-2' aria-hidden='true' />
        )}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
