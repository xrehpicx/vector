'use client';

import { useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import { useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { ArrowUp, ChevronUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateHuman } from '@/lib/date';
import { toast } from 'sonner';
import type { LiveActivityStatus } from '@/convex/_shared/agentBridge';

export function LiveActivityTranscript({
  liveActivityId,
  isOwner,
  status,
  currentUser,
}: {
  liveActivityId: Id<'issueLiveActivities'>;
  isOwner: boolean;
  status: LiveActivityStatus;
  currentUser?: {
    name: string;
    email: string | null;
    image: string | null;
    _id: string;
  } | null;
}) {
  const {
    results,
    loadMore,
    status: loadStatus,
  } = usePaginatedQuery(
    api.agentBridge.queries.listLiveMessages,
    { liveActivityId },
    { initialNumItems: 20 },
  );
  const appendMessage = useMutation(
    api.agentBridge.mutations.appendLiveMessage,
  );
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);

  const isTerminal = [
    'completed',
    'failed',
    'canceled',
    'disconnected',
  ].includes(status);
  const canSendMessage = isOwner && !isTerminal;

  const handleSend = async () => {
    const body = messageInput.trim();
    if (!body) return;
    setSending(true);
    try {
      await appendMessage({
        liveActivityId,
        direction: 'vector_to_agent',
        role: 'user',
        body,
      });
      setMessageInput('');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className='rounded-lg border'>
      {/* Messages */}
      <div className='max-h-80 overflow-y-auto'>
        {/* Loading */}
        {loadStatus === 'LoadingFirstPage' && (
          <div className='space-y-0'>
            {[0, 1].map(i => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 px-3 py-2',
                  i > 0 && 'border-t',
                )}
              >
                <Skeleton className='size-6 rounded-full' />
                <div className='min-w-0 flex-1 space-y-2 py-0.5'>
                  <Skeleton className='h-3.5 w-3/5' />
                  <Skeleton className='h-3.5 w-full' />
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && loadStatus !== 'LoadingFirstPage' && (
          <div className='text-muted-foreground px-3 py-4 text-center text-sm'>
            No messages yet
          </div>
        )}

        {loadStatus === 'CanLoadMore' && (
          <div className='border-b px-3 py-1'>
            <button
              type='button'
              onClick={() => loadMore(20)}
              className='text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 text-xs transition-colors'
            >
              <ChevronUp className='size-3' />
              Load older
            </button>
          </div>
        )}

        {results.map((msg, i) => (
          <MessageRow
            key={msg._id}
            message={msg}
            currentUser={currentUser}
            isFirst={i === 0 && loadStatus !== 'CanLoadMore'}
          />
        ))}
      </div>

      {/* Terminal status */}
      {isTerminal && (
        <div className='text-muted-foreground flex items-center gap-3 border-t px-3 py-1.5 text-xs'>
          <div className='bg-border h-px flex-1' />
          <span>Session {status}</span>
          <div className='bg-border h-px flex-1' />
        </div>
      )}

      {/* Composer */}
      {canSendMessage && (
        <div className='border-t'>
          <textarea
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => {
              if (!messageInput.trim()) setComposerFocused(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder='Message the agent...'
            rows={composerFocused ? 2 : 1}
            className='placeholder:text-muted-foreground w-full resize-none bg-transparent px-3 py-2 text-sm outline-none'
            disabled={sending}
          />
          {(composerFocused || messageInput.trim()) && (
            <div className='flex items-center justify-end px-2 pb-2'>
              <Button
                size='sm'
                className='size-7 cursor-pointer rounded-md p-0'
                disabled={sending || !messageInput.trim()}
                onClick={() => void handleSend()}
              >
                <ArrowUp className='size-4' />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message Row ─────────────────────────────────────────────────────────────

function MessageRow({
  message,
  currentUser,
  isFirst,
}: {
  message: {
    _id: string;
    direction: string;
    role: string;
    body: string;
    createdAt: number;
  };
  currentUser?: {
    name: string;
    email: string | null;
    image: string | null;
    _id: string;
  } | null;
  isFirst: boolean;
}) {
  const isUser = message.direction === 'vector_to_agent';
  const isStatus = message.role === 'status';

  // Status messages: compact activity-feed style row
  if (isStatus) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-1.5',
          !isFirst && 'border-t',
        )}
      >
        <div className='bg-muted flex size-5 shrink-0 items-center justify-center rounded-full'>
          <Sparkles className='text-muted-foreground size-3' />
        </div>
        <span className='text-muted-foreground min-w-0 flex-1 text-xs italic'>
          {message.body}
        </span>
        <span className='text-muted-foreground shrink-0 text-xs'>
          {formatDateHuman(new Date(message.createdAt))}
        </span>
      </div>
    );
  }

  // User messages: called out with avatar
  if (isUser) {
    return (
      <div className={cn('px-3 py-2.5', !isFirst && 'border-t')}>
        <div className='flex items-center gap-2 pb-1'>
          <UserAvatar
            name={currentUser?.name}
            email={currentUser?.email}
            image={currentUser?.image}
            userId={currentUser?._id}
            size='sm'
            className='size-5 shrink-0'
          />
          <span className='text-sm font-medium'>
            {currentUser?.name ?? 'You'}
          </span>
          <span className='text-muted-foreground text-xs'>
            {formatDateHuman(new Date(message.createdAt))}
          </span>
        </div>
        <p className='pl-7 text-sm leading-relaxed break-words whitespace-pre-wrap'>
          {message.body}
        </p>
      </div>
    );
  }

  // Agent messages: just body text (the card context implies it's the agent)
  return (
    <div className={cn('px-3 py-2.5', !isFirst && 'border-t')}>
      <div className='flex items-center justify-between pb-1'>
        <span className='text-muted-foreground text-xs'>
          {formatDateHuman(new Date(message.createdAt))}
        </span>
      </div>
      <p className='text-sm leading-relaxed break-words whitespace-pre-wrap'>
        {message.body}
      </p>
    </div>
  );
}
