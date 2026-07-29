'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AtSign,
  Bookmark,
  BookmarkX,
  MessageSquareReply,
  Search,
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { Id } from '@/convex/_generated/dataModel';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  toCollaborationAgent,
  toCollaborationMessage,
  toCollaborationUser,
} from './adapters';
import { MessageItem } from './message-item';

export type CollaborationSmartViewMode =
  'priority' | 'threads' | 'search' | 'saved';

const viewCopy = {
  priority: {
    title: 'Priority',
    description: 'Direct messages, mentions, replies, and followed threads',
    icon: AtSign,
  },
  threads: {
    title: 'Threads',
    description: 'Unread replies in conversations you started or follow',
    icon: MessageSquareReply,
  },
  search: {
    title: 'Search',
    description: 'Find messages across every conversation you can access',
    icon: Search,
  },
  saved: {
    title: 'Saved',
    description: 'Messages you kept for later',
    icon: Bookmark,
  },
} as const;

function useConnectionClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

function SmartViewSkeleton() {
  return (
    <div className='space-y-1 p-2' aria-hidden='true'>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className='space-y-2 rounded-lg border p-3'>
          <div className='flex items-center gap-2'>
            <Skeleton className='size-7 rounded-full' />
            <Skeleton className='h-3 w-28' />
            <Skeleton className='ml-auto h-3 w-16' />
          </div>
          <Skeleton className='h-3 w-4/5' />
          <Skeleton className='h-3 w-3/5' />
        </div>
      ))}
    </div>
  );
}

function reasonLabel(reason?: string) {
  switch (reason) {
    case 'direct_message':
      return 'Direct message';
    case 'mention':
      return 'Mention';
    case 'thread_reply':
      return 'Reply to your thread';
    case 'followed_thread':
      return 'Followed thread';
    default:
      return undefined;
  }
}

export function CollaborationSmartView({
  orgSlug,
  mode,
}: {
  orgSlug: string;
  mode: CollaborationSmartViewMode;
}) {
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebouncedValue(searchText.trim(), 180);
  const now = useConnectionClock();
  const currentUser = useCachedQuery(api.users.currentUser);
  const agents = useCachedQuery(api.collaboration.agents.list, {
    orgSlug,
    now,
    limit: 100,
  });
  const channelRows = useCachedQuery(api.collaboration.channels.list, {
    orgSlug,
    includeArchived: true,
    limit: 200,
  });
  const memberRows = useCachedQuery(api.organizations.queries.searchMembers, {
    orgSlug,
    limit: 100,
  });
  const priorityItems = useCachedQuery(
    api.collaboration.messages.listPriorityInbox,
    mode === 'priority' || mode === 'threads'
      ? { orgSlug, limit: 100 }
      : 'skip',
  );
  const savedItems = useCachedQuery(
    api.collaboration.messages.listSaved,
    mode === 'saved' ? { orgSlug, limit: 100 } : 'skip',
  );
  const searchItems = useCachedQuery(
    api.collaboration.messages.search,
    mode === 'search' && debouncedSearch
      ? { orgSlug, query: debouncedSearch, limit: 100 }
      : 'skip',
  );
  const toggleSaved = useMutation(api.collaboration.messages.toggleSaved);

  const copy = viewCopy[mode];
  const Icon = copy.icon;
  const ready =
    currentUser !== undefined &&
    currentUser !== null &&
    agents !== undefined &&
    channelRows !== undefined &&
    memberRows !== undefined &&
    (mode === 'priority' || mode === 'threads'
      ? priorityItems !== undefined
      : true) &&
    (mode === 'saved' ? savedItems !== undefined : true) &&
    (mode === 'search' && debouncedSearch ? searchItems !== undefined : true);

  const rows = useMemo(() => {
    if (!ready || !currentUser || !agents || !channelRows || !memberRows) {
      return [];
    }
    const currentUserId = String(currentUser._id);
    const mappedAgents = agents.map(agent =>
      toCollaborationAgent(agent, currentUserId),
    );
    const reactionUsers = memberRows
      .flatMap(row => (row.user ? [row.user] : []))
      .map(user => toCollaborationUser(user, currentUserId));

    const source =
      mode === 'priority' || mode === 'threads'
        ? (priorityItems ?? []).map(item => ({
            view: item.message,
            channel: item.channel,
            reason: item.reason,
          }))
        : mode === 'search'
          ? (searchItems ?? []).map(item => ({
              view: item.message,
              channel: item.channel,
              reason: undefined,
            }))
          : (savedItems ?? []).flatMap(view => {
              const item = channelRows.find(
                channel => channel.channel._id === view.message.channelId,
              );
              return item
                ? [{ view, channel: item.channel, reason: undefined }]
                : [];
            });

    return source
      .filter(item =>
        mode === 'threads'
          ? Boolean(item.view.message.threadRootId) ||
            item.reason === 'thread_reply' ||
            item.reason === 'followed_thread'
          : true,
      )
      .map(item => ({
        channel: item.channel,
        reason: item.reason,
        message: toCollaborationMessage({
          view: item.view,
          currentUserId,
          agents: mappedAgents,
          runs: [],
          reactionUsers,
        }),
      }));
  }, [
    agents,
    channelRows,
    currentUser,
    memberRows,
    mode,
    priorityItems,
    ready,
    savedItems,
    searchItems,
  ]);

  const showSearchPrompt = mode === 'search' && !debouncedSearch;
  const emptyTitle =
    mode === 'priority'
      ? 'You’re caught up'
      : mode === 'threads'
        ? 'No unread thread replies'
        : mode === 'saved'
          ? 'Nothing saved yet'
          : 'No matching messages';
  const emptyDescription =
    mode === 'priority'
      ? 'New direct messages, mentions, and followed replies will appear here.'
      : mode === 'threads'
        ? 'Follow a thread to keep its new replies in this view.'
        : mode === 'saved'
          ? 'Use Save for later from any message menu to keep it here.'
          : 'Try a person, agent, phrase, or file name from the message.';

  return (
    <div className='flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] min-h-0 flex-col lg:h-[calc(100dvh-1rem)] lg:min-h-[32rem]'>
      <header className='flex min-h-11 shrink-0 items-center gap-2 border-b px-3'>
        <Icon className='text-muted-foreground size-3.5' aria-hidden='true' />
        <div className='min-w-0 flex-1'>
          <h1 className='truncate text-sm font-semibold'>{copy.title}</h1>
          <p className='text-muted-foreground truncate text-[10px]'>
            {copy.description}
          </p>
        </div>
        {ready && !showSearchPrompt ? (
          <span className='text-muted-foreground text-xs tabular-nums'>
            {rows.length}
          </span>
        ) : null}
      </header>

      {mode === 'search' ? (
        <div className='border-b p-2'>
          <label htmlFor='workspace-message-search' className='sr-only'>
            Search workspace messages
          </label>
          <div className='relative'>
            <Search
              className='text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
              aria-hidden='true'
            />
            <Input
              id='workspace-message-search'
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              placeholder='Search message text and file names…'
              className='h-9 pl-8 text-base sm:text-sm'
              autoFocus
            />
          </div>
        </div>
      ) : null}

      <ScrollArea className='min-h-0 flex-1'>
        {!ready ? (
          <SmartViewSkeleton />
        ) : showSearchPrompt ? (
          <div className='text-muted-foreground flex min-h-72 flex-col items-center justify-center gap-2 px-6 text-center'>
            <Search className='size-7 opacity-40' aria-hidden='true' />
            <p className='text-foreground text-sm font-medium'>
              Search the workspace
            </p>
            <p className='max-w-sm text-xs leading-5 text-pretty'>
              Results are limited to channels and direct messages you can
              access.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className='text-muted-foreground flex min-h-72 flex-col items-center justify-center gap-2 px-6 text-center'>
            <Icon className='size-7 opacity-40' aria-hidden='true' />
            <p className='text-foreground text-sm font-medium'>{emptyTitle}</p>
            <p className='max-w-sm text-xs leading-5 text-pretty'>
              {emptyDescription}
            </p>
          </div>
        ) : (
          <div className='space-y-1 p-2'>
            {rows.map(({ channel, message, reason }) => (
              <article
                key={message.id}
                className='overflow-hidden rounded-lg border'
              >
                <div className='bg-muted/20 flex min-h-8 items-center gap-2 border-b px-2'>
                  <Link
                    href={`/${orgSlug}/channels/${channel.slug}`}
                    className='hover:text-foreground focus-visible:ring-ring text-muted-foreground min-w-0 truncate rounded text-xs font-medium focus-visible:ring-2 focus-visible:outline-none'
                  >
                    #{channel.name}
                  </Link>
                  {reasonLabel(reason) ? (
                    <span className='text-muted-foreground truncate text-[10px]'>
                      {reasonLabel(reason)}
                    </span>
                  ) : null}
                  <time className='text-muted-foreground ml-auto shrink-0 text-[10px] tabular-nums'>
                    {formatDistanceToNowStrict(message.createdAt, {
                      addSuffix: true,
                    })}
                  </time>
                  {mode === 'saved' ? (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-xs'
                      aria-label='Remove from saved'
                      onClick={() =>
                        void toggleSaved({
                          messageId: message.id as Id<'channelMessages'>,
                        })
                      }
                    >
                      <BookmarkX className='size-3' aria-hidden='true' />
                    </Button>
                  ) : (
                    <Link
                      href={`/${orgSlug}/channels/${channel.slug}`}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'xs' }),
                        'h-6 px-1.5',
                      )}
                    >
                      Open
                    </Link>
                  )}
                </div>
                <MessageItem message={message} />
              </article>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
