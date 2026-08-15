'use client';

import Link from 'next/link';
import { ArrowUpRight, CircleDot, Network } from 'lucide-react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@/lib/convex';
import { formatDateHuman } from '@/lib/date';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserAvatar } from '@/components/user-avatar';
import { RequestActionsMenu } from './request-actions-menu';

type RequestListItem = FunctionReturnType<
  typeof api.requests.queries.list
>['page'][number];

const requestStatuses = [
  { value: 'new', label: 'Needs routing', color: '#94a3b8' },
  { value: 'routed', label: 'Routed', color: '#3b82f6' },
  { value: 'planned', label: 'Planned', color: '#64748b' },
  { value: 'in_delivery', label: 'In delivery', color: '#06b6d4' },
  {
    value: 'ready_for_review',
    label: 'Ready for review',
    color: '#8b5cf6',
  },
  {
    value: 'changes_requested',
    label: 'Changes requested',
    color: '#f59e0b',
  },
  { value: 'completed', label: 'Completed', color: '#10b981' },
  { value: 'declined', label: 'Declined', color: '#ef4444' },
  { value: 'duplicate', label: 'Duplicate', color: '#6b7280' },
] as const;

export function RequestsKanban({
  requests,
  orgSlug,
  currentTime,
  deletingRequestId,
  onDelete,
}: {
  requests: ReadonlyArray<RequestListItem>;
  orgSlug: string;
  currentTime: number;
  deletingRequestId: string | null;
  onDelete: (request: RequestListItem) => void;
}) {
  const columns = requestStatuses.map(status => ({
    status,
    requests: requests.filter(request => request.status === status.value),
  }));

  return (
    <ScrollArea
      className='h-full w-full min-w-0'
      viewportClassName='h-full min-w-0'
      scrollbars='both'
    >
      <div className='flex min-h-dvh w-max min-w-full gap-3 p-3 pb-16'>
        {columns.map(({ status, requests: columnRequests }) => (
          <section
            key={status.value}
            aria-labelledby={`request-column-${status.value}`}
            className='flex w-72 shrink-0 flex-col rounded-lg'
          >
            <div className='mb-2 flex min-w-0 items-center gap-2 px-1'>
              <CircleDot
                className='size-3.5 shrink-0'
                style={{ color: status.color }}
              />
              <h2
                id={`request-column-${status.value}`}
                className='min-w-0 truncate text-sm font-medium'
              >
                {status.label}
              </h2>
              <span className='text-muted-foreground text-xs'>
                {columnRequests.length}
              </span>
            </div>

            <div className='w-full max-w-full min-w-0 space-y-2 overflow-x-hidden'>
              {columnRequests.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs'>
                  No requests
                </div>
              ) : (
                columnRequests.map(request => (
                  <RequestKanbanCard
                    key={request._id}
                    request={request}
                    orgSlug={orgSlug}
                    currentTime={currentTime}
                    deleting={deletingRequestId === request._id}
                    onDelete={() => onDelete(request)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </ScrollArea>
  );
}

function RequestKanbanCard({
  request,
  orgSlug,
  currentTime,
  deleting,
  onDelete,
}: {
  request: RequestListItem;
  orgSlug: string;
  currentTime: number;
  deleting: boolean;
  onDelete: () => void;
}) {
  const ageDays = Math.floor(
    (currentTime - request.createdAt) / (24 * 60 * 60 * 1000),
  );
  const href = `/${orgSlug}/requests/${request.key}`;

  return (
    <article className='group bg-card border-border/70 hover:border-border/80 relative w-full max-w-full min-w-0 overflow-hidden rounded-lg border p-3 shadow-xs transition-[border-color,box-shadow] hover:shadow-sm'>
      <div className='mb-1.5 flex min-w-0 items-center gap-2'>
        <Link
          href={href}
          className='text-muted-foreground hover:text-foreground min-w-0 flex-1 font-mono text-[10px]'
        >
          {request.key}
        </Link>
        {request.canDelete && (
          <RequestActionsMenu
            deleting={deleting}
            onDelete={onDelete}
            className='text-muted-foreground -my-1 -mr-1 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100'
          />
        )}
      </div>

      <Link href={href} className='block min-w-0'>
        <h3 className='line-clamp-2 text-sm leading-snug font-medium'>
          {request.title}
        </h3>
        <p className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
          {request.expectedOutput}
        </p>

        <div className='mt-2 flex min-w-0 items-center gap-2'>
          {request.owner ? (
            <div className='flex min-w-0 flex-1 items-center gap-1.5'>
              <UserAvatar
                name={request.owner.name}
                email={request.owner.email}
                image={request.owner.image}
                userId={request.owner._id}
                size='sm'
                className='size-5 shrink-0'
              />
              <span className='text-muted-foreground truncate text-[11px]'>
                {request.owner.name ?? request.owner.username ?? 'Owner'}
              </span>
            </div>
          ) : (
            <span className='text-muted-foreground flex min-w-0 flex-1 items-center gap-1 text-[11px]'>
              <ArrowUpRight className='size-3.5 shrink-0' />
              Route
            </span>
          )}

          {request.linkedWorkCount > 0 && (
            <span className='text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]'>
              <Network className='size-3.5' />
              {request.linkedWorkCount}
            </span>
          )}
          <span className='text-muted-foreground shrink-0 text-[11px]'>
            {formatDateHuman(new Date(request.updatedAt))}
          </span>
        </div>

        {ageDays >= 3 && ['new', 'routed'].includes(request.status) && (
          <Badge variant='secondary' className='mt-2 h-5 px-1.5 text-[10px]'>
            {ageDays}d waiting
          </Badge>
        )}
      </Link>
    </article>
  );
}
