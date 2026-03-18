'use client';

import { useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import { useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { ArrowUp, ChevronDown, ChevronUp, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { formatDateHuman } from '@/lib/date';
import { toast } from 'sonner';
import { ProviderIcon } from './live-activity-section';
import type { LiveActivityStatus } from '@/convex/_shared/agentBridge';

type LiveActivity = FunctionReturnType<
  typeof api.agentBridge.queries.listIssueLiveActivities
>[number];

// ── Status Badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> =
  {
    active: {
      bg: 'bg-green-500/10',
      text: 'text-green-700 dark:text-green-400',
      dot: 'bg-green-500',
    },
    waiting_for_input: {
      bg: 'bg-yellow-500/10',
      text: 'text-yellow-700 dark:text-yellow-400',
      dot: 'bg-yellow-500',
    },
    paused: {
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      dot: 'bg-muted-foreground',
    },
    completed: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-700 dark:text-blue-400',
      dot: 'bg-blue-500',
    },
    failed: {
      bg: 'bg-red-500/10',
      text: 'text-red-700 dark:text-red-400',
      dot: 'bg-red-500',
    },
    canceled: {
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      dot: 'bg-muted-foreground',
    },
    disconnected: {
      bg: 'bg-orange-500/10',
      text: 'text-orange-700 dark:text-orange-400',
      dot: 'bg-orange-500',
    },
  };

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.paused;
  const label = status.replace(/_/g, ' ');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium capitalize',
        style.bg,
        style.text,
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          style.dot,
          status === 'active' && 'animate-pulse',
        )}
      />
      {label}
    </span>
  );
}

// ── Unified Live Activity Card ──────────────────────────────────────────────

export function LiveActivityCard({
  activity,
  currentUser,
}: {
  activity: LiveActivity;
  currentUser?: {
    _id: string;
    name: string;
    email: string | null;
    image: string | null;
  } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const timeAgo = formatDistanceToNow(activity.lastEventAt, {
    addSuffix: true,
  });

  const isTerminal = [
    'completed',
    'failed',
    'canceled',
    'disconnected',
  ].includes(activity.status);

  return (
    <div className='rounded-lg border'>
      {/* Card header — click to expand/collapse */}
      <button
        type='button'
        onClick={() => setExpanded(!expanded)}
        className='hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors'
      >
        <ProviderIcon
          provider={activity.provider}
          className='text-muted-foreground shrink-0'
        />
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <span className='truncate text-sm font-medium'>
              {activity.title ?? activity.providerLabel}
            </span>
            <StatusBadge status={activity.status} />
          </div>
          <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <span className='shrink-0'>{activity.providerLabel}</span>
            <span>&middot;</span>
            <Monitor className='size-3 shrink-0' />
            <span className='truncate'>{activity.deviceName}</span>
            <span>&middot;</span>
            <span className='shrink-0'>{timeAgo}</span>
          </div>
          {!expanded && activity.latestSummary && (
            <div className='text-muted-foreground mt-0.5 truncate text-xs'>
              {activity.latestSummary}
            </div>
          )}
        </div>
        <div className='text-muted-foreground shrink-0'>
          {expanded ? (
            <ChevronUp className='size-4' />
          ) : (
            <ChevronDown className='size-4' />
          )}
        </div>
      </button>

      {/* Expanded: conversation */}
      {expanded && (
        <TranscriptBody
          liveActivityId={activity._id}
          status={activity.status as LiveActivityStatus}
          isTerminal={isTerminal}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

// ── Transcript Body (inside the card) ───────────────────────────────────────

function TranscriptBody({
  liveActivityId,
  status,
  isTerminal,
  currentUser,
}: {
  liveActivityId: Id<'issueLiveActivities'>;
  status: LiveActivityStatus;
  isTerminal: boolean;
  currentUser?: {
    _id: string;
    name: string;
    email: string | null;
    image: string | null;
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

  const canSendMessage = !isTerminal;

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

  // Filter out status messages — they're shown in the card header summary
  const conversationMessages = results.filter(m => m.role !== 'status');

  return (
    <>
      {/* Messages */}
      <div className='max-h-80 overflow-y-auto border-t'>
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

        {conversationMessages.length === 0 &&
          loadStatus !== 'LoadingFirstPage' && (
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

        {conversationMessages.map((msg, i) => {
          const isUser = msg.direction === 'vector_to_agent';

          if (isUser) {
            return (
              <div
                key={msg._id}
                className={cn('px-3 py-2.5', i > 0 && 'border-t')}
              >
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
                    {formatDateHuman(new Date(msg.createdAt))}
                  </span>
                </div>
                <p className='pl-7 text-sm leading-relaxed break-words whitespace-pre-wrap'>
                  {msg.body}
                </p>
              </div>
            );
          }

          // Agent message — just body, no avatar
          return (
            <div
              key={msg._id}
              className={cn('px-3 py-2.5', i > 0 && 'border-t')}
            >
              <p className='text-sm leading-relaxed break-words whitespace-pre-wrap'>
                {msg.body}
              </p>
              <span className='text-muted-foreground mt-1 block text-xs'>
                {formatDateHuman(new Date(msg.createdAt))}
              </span>
            </div>
          );
        })}
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
    </>
  );
}
