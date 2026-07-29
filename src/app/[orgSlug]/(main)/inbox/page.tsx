'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useRouter } from 'nextjs-toploader/app';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  AtSign,
  BellRing,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileInput,
  GitPullRequest,
  Handshake,
  MessageSquare,
  Settings2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  api,
  useCachedPaginatedQuery,
  useCachedQuery,
  useMutation,
} from '@/lib/convex';
import { cn } from '@/lib/utils';
import { AutoLoadMore } from '@/components/ui/auto-load-more';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { BarsSpinner } from '@/components/bars-spinner';

const filters = [
  { value: 'action', label: 'Needs action' },
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All updates' },
] as const;

type InboxFilter = (typeof filters)[number]['value'];

function formatCount(count: number, capped = false) {
  return capped || count >= 100 ? '99+' : String(count);
}

function getNotificationIcon(category: string) {
  switch (category) {
    case 'assignments':
      return UserPlus;
    case 'mentions':
      return AtSign;
    case 'comments':
      return MessageSquare;
    case 'requests':
      return FileInput;
    case 'handoffs':
      return Handshake;
    case 'reviews':
      return CheckCheck;
    case 'attention':
      return AlertCircle;
    case 'work_sessions':
      return Bot;
    case 'team_status_changes':
      return Users;
    case 'github':
      return GitPullRequest;
    case 'reminders':
      return Clock3;
    default:
      return BellRing;
  }
}

function InboxRowsSkeleton() {
  return (
    <div className='divide-y' aria-hidden='true'>
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className='flex items-start gap-3 px-3 py-2.5'>
          <Skeleton className='size-8 shrink-0 rounded-full' />
          <div className='min-w-0 flex-1 space-y-1.5'>
            <Skeleton className='h-3.5 w-48 max-w-full' />
            <Skeleton className='h-3 w-80 max-w-full' />
            <Skeleton className='h-3 w-20' />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InboxPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>('action');
  const [pendingAction, setPendingAction] = useState<{
    recipientId: string;
    type: 'done' | 'snoozed';
  } | null>(null);
  const [openingRecipientId, setOpeningRecipientId] = useState<string | null>(
    null,
  );
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const counts = useCachedQuery(api.notifications.queries.inboxCounts, {
    orgSlug,
  });
  const result = useCachedPaginatedQuery(
    api.notifications.queries.listInbox,
    { orgSlug, filter },
    { initialNumItems: 30 },
  );
  const markRead = useMutation(api.notifications.mutations.markRead);
  const markAllRead = useMutation(api.notifications.mutations.markAllRead);
  const setActionState = useMutation(
    api.notifications.mutations.setActionState,
  );

  const handleOpen = async (recipient: (typeof result.results)[number]) => {
    if (openingRecipientId) return;
    setOpeningRecipientId(String(recipient._id));
    try {
      if (!recipient.isRead) {
        await markRead({ recipientId: recipient._id });
      }
    } finally {
      router.push(recipient.href ?? `/${orgSlug}/work`);
    }
  };

  const updateActionState = async (
    recipientId: (typeof result.results)[number]['_id'],
    actionState: 'done' | 'snoozed',
    snoozedUntil?: number,
  ) => {
    if (pendingAction) return;
    setPendingAction({ recipientId: String(recipientId), type: actionState });
    try {
      await setActionState({ recipientId, actionState, snoozedUntil });
    } finally {
      setPendingAction(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAllRead) return;
    setMarkingAllRead(true);
    try {
      await markAllRead({ orgSlug });
    } finally {
      setMarkingAllRead(false);
    }
  };

  return (
    <div className='flex min-h-full flex-col'>
      <header className='grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b p-2 sm:flex sm:min-h-10 sm:flex-wrap sm:py-1 sm:pr-1 sm:pl-3'>
        <div className='flex min-w-0 items-baseline gap-2'>
          <h1 className='text-sm font-semibold'>Inbox</h1>
          <span className='text-muted-foreground truncate text-xs'>
            updates and action items
          </span>
        </div>
        <nav
          aria-label='Inbox filter'
          className='order-3 col-span-2 flex min-w-0 items-center gap-1 overflow-x-auto sm:order-none sm:col-span-1 sm:flex-1'
        >
          {filters.map(item => {
            const count = counts?.[item.value];
            const capped = counts
              ? item.value === 'action'
                ? counts.actionCapped
                : item.value === 'unread'
                  ? counts.unreadCapped
                  : counts.allCapped
              : false;
            const needsAction = item.value === 'action' && count !== 0;
            return (
              <Button
                key={item.value}
                variant='ghost'
                size='sm'
                className={cn(
                  'h-9 shrink-0 gap-1.5 px-2.5 text-xs sm:h-7 sm:px-2',
                  filter === item.value && 'bg-muted',
                )}
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
              >
                <span>{item.label}</span>
                {count === undefined ? (
                  <Skeleton className='size-3 rounded-full' />
                ) : needsAction ? (
                  <span className='flex min-w-4 items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] leading-4 font-medium text-white'>
                    {formatCount(count, capped)}
                  </span>
                ) : (
                  <span className='text-muted-foreground text-[10px] tabular-nums'>
                    {formatCount(count, capped)}
                  </span>
                )}
              </Button>
            );
          })}
        </nav>
        <div className='flex shrink-0 items-center justify-end gap-1'>
          <Button
            variant='ghost'
            size='sm'
            className='size-9 gap-1.5 px-0 text-xs sm:h-7 sm:w-auto sm:px-2'
            disabled={markingAllRead || !counts || counts.unread === 0}
            onClick={() => void handleMarkAllRead()}
          >
            {markingAllRead ? (
              <BarsSpinner size={12} />
            ) : (
              <CheckCheck className='size-3.5' />
            )}
            <span className='hidden sm:inline'>Mark all read</span>
          </Button>
          <Link
            href='/settings/notifications'
            aria-label='Inbox settings'
            className={cn(
              buttonVariants({ variant: 'outline', size: 'icon-sm' }),
              'size-9 sm:size-7',
            )}
          >
            <Settings2 className='size-3.5' />
          </Link>
        </div>
      </header>

      <div className='min-h-0 flex-1'>
        {result.status === 'LoadingFirstPage' ? (
          <InboxRowsSkeleton />
        ) : result.results.length === 0 && result.status === 'Exhausted' ? (
          <div className='text-muted-foreground flex min-h-64 flex-col items-center justify-center gap-2 px-6 text-center'>
            <CheckCheck className='size-7 opacity-40' />
            <p className='text-sm'>
              {filter === 'action'
                ? 'Nothing needs your attention'
                : filter === 'unread'
                  ? 'You are all caught up'
                  : 'No updates yet'}
            </p>
            <p className='max-w-sm text-xs'>
              Requests, reviews, assignments, handoffs, agent questions, and
              other updates related to you will appear here.
            </p>
          </div>
        ) : (
          <div className='divide-y'>
            {result.results.map(recipient => {
              const Icon = getNotificationIcon(recipient.category);
              const isPending =
                pendingAction?.recipientId === String(recipient._id) ||
                openingRecipientId === String(recipient._id);
              return (
                <div
                  key={recipient._id}
                  className={cn(
                    'hover:bg-muted/35 relative flex min-h-14 items-start gap-3 px-3 py-2.5 text-left transition-colors',
                    !recipient.isRead && 'bg-primary/3',
                  )}
                >
                  <Link
                    href={recipient.href ?? `/${orgSlug}/work`}
                    aria-label={`Open ${recipient.title}`}
                    className='focus-visible:ring-ring absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-inset'
                    onClick={event => {
                      event.preventDefault();
                      void handleOpen(recipient);
                    }}
                  />
                  <div className='pointer-events-none relative z-1 shrink-0'>
                    <UserAvatar
                      name={recipient.actorName}
                      image={recipient.actorImage}
                      size='default'
                    />
                    <span className='bg-background absolute -right-1 -bottom-1 rounded-full border p-0.5'>
                      <Icon className='text-muted-foreground size-3' />
                    </span>
                  </div>
                  <div className='pointer-events-none relative z-1 min-w-0 flex-1'>
                    <div className='flex min-w-0 items-start gap-2'>
                      <p
                        className={cn(
                          'min-w-0 flex-1 truncate text-xs',
                          !recipient.isRead && 'font-semibold',
                        )}
                      >
                        {recipient.title}
                      </p>
                      {!recipient.isRead ? (
                        <>
                          <span className='sr-only'>Unread</span>
                          <span
                            className='bg-primary mt-1 size-1.5 shrink-0 rounded-full'
                            aria-hidden='true'
                          />
                        </>
                      ) : null}
                    </div>
                    <p className='text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-4'>
                      {recipient.body}
                    </p>
                    <div className='mt-1 flex flex-wrap items-center gap-2'>
                      <span className='text-muted-foreground text-[10px]'>
                        {formatDistanceToNow(new Date(recipient.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {recipient.actionState === 'needs_action' ? (
                        <div className='pointer-events-auto relative z-10 flex items-center gap-1'>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-6 gap-1 px-1.5 text-[10px]'
                            disabled={isPending}
                            onClick={event => {
                              event.stopPropagation();
                              void updateActionState(recipient._id, 'done');
                            }}
                          >
                            {pendingAction?.recipientId ===
                              String(recipient._id) &&
                            pendingAction.type === 'done' ? (
                              <BarsSpinner size={10} />
                            ) : (
                              <Check className='size-3' />
                            )}
                            Done
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-6 gap-1 px-1.5 text-[10px]'
                            disabled={isPending}
                            onClick={event => {
                              event.stopPropagation();
                              void updateActionState(
                                recipient._id,
                                'snoozed',
                                Date.now() + 24 * 60 * 60 * 1000,
                              );
                            }}
                          >
                            {pendingAction?.recipientId ===
                              String(recipient._id) &&
                            pendingAction.type === 'snoozed' ? (
                              <BarsSpinner size={10} />
                            ) : (
                              <Clock3 className='size-3' />
                            )}
                            Tomorrow
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {openingRecipientId === String(recipient._id) ? (
                    <BarsSpinner
                      className='pointer-events-none relative z-1 mt-1 shrink-0'
                      size={12}
                    />
                  ) : (
                    <ChevronRight className='text-muted-foreground pointer-events-none relative z-1 mt-1 size-3.5 shrink-0' />
                  )}
                </div>
              );
            })}
            <AutoLoadMore
              status={result.status}
              loadMore={() => result.loadMore(30)}
              pageSize={30}
            />
          </div>
        )}
      </div>
    </div>
  );
}
