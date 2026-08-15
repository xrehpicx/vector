'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FunctionReturnType } from 'convex/server';
import {
  ArrowUpRight,
  CircleDot,
  Columns3,
  Inbox,
  LayoutList,
  Network,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import {
  api,
  useCachedPaginatedQuery,
  useCachedQuery,
  useMutation,
} from '@/lib/convex';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AutoLoadMore } from '@/components/ui/auto-load-more';
import { CreateRequestDialog } from '@/components/requests/create-request-dialog';
import { GroupBySelector } from '@/components/ui/group-by-selector';
import { GroupSection } from '@/components/ui/group-section';
import { RequestActionsMenu } from '@/components/requests/request-actions-menu';
import { RequestsKanban } from '@/components/requests/requests-kanban';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useConfirm } from '@/hooks/use-confirm';
import {
  usePersistedViewMode,
  type ViewMode,
} from '@/hooks/use-persisted-view-mode';
import { KanbanSkeleton } from '@/components/ui/table-skeleton';
import { toast } from 'sonner';

const scopes = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'mine', label: 'Routed to me' },
  { value: 'requested', label: 'Requested by me' },
  { value: 'all', label: 'All' },
] as const;

const statusLabel: Record<string, string> = {
  new: 'Needs routing',
  routed: 'Routed',
  planned: 'Planned',
  in_delivery: 'In delivery',
  ready_for_review: 'Ready for review',
  changes_requested: 'Changes requested',
  completed: 'Completed',
  declined: 'Declined',
  duplicate: 'Duplicate',
};

const statusOrder = Object.keys(statusLabel);
const statusColors: Record<string, string> = {
  new: '#94a3b8',
  routed: '#3b82f6',
  planned: '#64748b',
  in_delivery: '#06b6d4',
  ready_for_review: '#8b5cf6',
  changes_requested: '#f59e0b',
  completed: '#10b981',
  declined: '#ef4444',
  duplicate: '#6b7280',
};

type RequestListItem = FunctionReturnType<
  typeof api.requests.queries.list
>['page'][number];
type RequestGroupBy = 'none' | 'priority' | 'status';
const requestGroupByValues: RequestGroupBy[] = ['none', 'priority', 'status'];
const requestGroupByStorageKey = 'vector:requests:group-by';
const requestViewModeStorageKey = 'vector:requests-list-layout';

function RequestRow({
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
  return (
    <div className='group hover:bg-muted/35 flex min-h-10 items-center border-b pr-2 transition-colors'>
      <Link
        href={`/${orgSlug}/requests/${request.key}`}
        className='flex min-w-0 flex-1 items-center gap-2 self-stretch px-3 py-1'
      >
        <CircleDot
          className={cn(
            'size-3 shrink-0',
            request.status === 'ready_for_review'
              ? 'text-violet-500'
              : request.status === 'changes_requested'
                ? 'text-amber-500'
                : request.status === 'completed'
                  ? 'text-emerald-500'
                  : 'text-muted-foreground',
          )}
        />
        <span className='text-muted-foreground w-14 shrink-0 font-mono text-[10px]'>
          {request.key}
        </span>
        <div className='min-w-0 flex-1'>
          <div className='truncate text-xs font-medium'>{request.title}</div>
          <div className='text-muted-foreground truncate text-[11px]'>
            {request.expectedOutput}
          </div>
        </div>
        <Badge
          variant='outline'
          className='hidden h-5 px-1.5 text-[10px] sm:inline-flex'
        >
          {statusLabel[request.status] ?? request.status}
        </Badge>
        {ageDays >= 3 && ['new', 'routed'].includes(request.status) && (
          <Badge variant='secondary' className='h-5 px-1.5 text-[10px]'>
            {ageDays}d waiting
          </Badge>
        )}
        {request.linkedWorkCount > 0 && (
          <span className='text-muted-foreground hidden items-center gap-1 text-[11px] md:flex'>
            <Network className='size-3.5' />
            {request.linkedWorkCount}
          </span>
        )}
        <span className='text-muted-foreground flex w-24 shrink-0 items-center justify-end gap-1 text-[11px]'>
          {request.owner ? (
            <>
              <UserRound className='size-3.5' />
              <span className='truncate'>
                {request.owner.name ?? request.owner.username ?? 'Owner'}
              </span>
            </>
          ) : (
            <>
              <ArrowUpRight className='size-3.5' />
              Route
            </>
          )}
        </span>
      </Link>
      {request.canDelete && (
        <RequestActionsMenu
          deleting={deleting}
          onDelete={onDelete}
          className='text-muted-foreground opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100'
        />
      )}
    </div>
  );
}

export default function RequestsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const [scope, setScope] = useState<(typeof scopes)[number]['value']>('inbox');
  const [groupBy, setGroupByState] = useState<RequestGroupBy>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 200);
  const [currentTime] = useState(Date.now);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(
    null,
  );
  const [confirmDelete, ConfirmDeleteDialog] = useConfirm();
  const removeRequest = useMutation(api.requests.mutations.remove);
  const viewParam = searchParams.get('view');
  const queryMode: ViewMode | null =
    viewParam === 'kanban' || viewParam === 'table' ? viewParam : null;
  const syncViewModeUrl = useCallback((mode: ViewMode) => {
    const params = new URLSearchParams(window.location.search);
    if (mode === 'table') params.delete('view');
    else params.set('view', mode);
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      query ? `?${query}` : window.location.pathname,
    );
  }, []);
  const { viewMode, setViewMode } = usePersistedViewMode({
    storageKey: requestViewModeStorageKey,
    defaultMode: 'table',
    queryMode,
    syncUrl: syncViewModeUrl,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlGroupBy = params.get('groupBy');
    const storedGroupBy = localStorage.getItem(requestGroupByStorageKey);
    const initialGroupBy = requestGroupByValues.includes(
      urlGroupBy as RequestGroupBy,
    )
      ? (urlGroupBy as RequestGroupBy)
      : requestGroupByValues.includes(storedGroupBy as RequestGroupBy)
        ? (storedGroupBy as RequestGroupBy)
        : 'none';
    setGroupByState(initialGroupBy);
    setSearchQuery(params.get('q') ?? '');
  }, []);

  const setGroupBy = useCallback((nextGroupBy: RequestGroupBy) => {
    setGroupByState(nextGroupBy);
    localStorage.setItem(requestGroupByStorageKey, nextGroupBy);
    const params = new URLSearchParams(window.location.search);
    if (nextGroupBy === 'none') params.delete('groupBy');
    else params.set('groupBy', nextGroupBy);
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      query ? `?${query}` : window.location.pathname,
    );
  }, []);

  const setSearch = (nextSearch: string) => {
    setSearchQuery(nextSearch);
    const params = new URLSearchParams(window.location.search);
    if (nextSearch.trim()) params.set('q', nextSearch);
    else params.delete('q');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      query ? `?${query}` : window.location.pathname,
    );
  };

  const handleDelete = async (request: RequestListItem) => {
    const confirmed = await confirmDelete({
      title: 'Delete request',
      description:
        request.linkedWorkCount > 0
          ? `“${request.title}” will be permanently deleted and detached from ${request.linkedWorkCount} linked Work item${request.linkedWorkCount === 1 ? '' : 's'}. The Work itself will not be deleted.`
          : `“${request.title}” will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete request',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setDeletingRequestId(request._id);
    try {
      await removeRequest({ requestId: request._id });
      toast.success('Request deleted');
    } catch {
      toast.error('Could not delete request');
    } finally {
      setDeletingRequestId(null);
    }
  };

  const result = useCachedPaginatedQuery(
    api.requests.queries.list,
    { orgSlug, scope, search: debouncedSearch || undefined },
    { initialNumItems: 40 },
  );
  const priorityResults = useCachedQuery(
    api.organizations.queries.listIssuePriorities,
    { orgSlug },
  );
  const groups = useMemo(() => {
    if (groupBy === 'none') return [];
    const priorities = priorityResults ?? [];
    const priorityById = new Map<string, (typeof priorities)[number]>(
      priorities.map(item => [item._id, item]),
    );
    const noPriority = priorities.find(
      item => item.weight === 0 || item.name.toLowerCase() === 'no priority',
    );
    const grouped = new Map<
      string,
      {
        key: string;
        label: string;
        icon?: string;
        color?: string;
        weight: number;
        requests: RequestListItem[];
      }
    >();
    for (const request of result.results) {
      const key =
        groupBy === 'status'
          ? request.status
          : (request.priorityId ?? noPriority?._id ?? '__none__');
      let group = grouped.get(key);
      if (!group) {
        const priority = groupBy === 'priority' ? priorityById.get(key) : null;
        group = {
          key,
          label:
            groupBy === 'status'
              ? (statusLabel[key] ?? key)
              : (priority?.name ?? 'No priority'),
          icon: groupBy === 'status' ? 'CircleDot' : priority?.icon,
          color: groupBy === 'status' ? statusColors[key] : priority?.color,
          weight:
            groupBy === 'status'
              ? statusOrder.indexOf(key)
              : -(priority?.weight ?? 0),
          requests: [],
        };
        grouped.set(key, group);
      }
      group.requests.push(request);
    }
    return Array.from(grouped.values()).sort((a, b) => a.weight - b.weight);
  }, [groupBy, priorityResults, result.results]);
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <header className='flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b px-1 py-1 sm:flex-nowrap sm:gap-3 sm:py-0 sm:pr-1 sm:pl-3'>
        <div className='flex shrink-0 items-baseline gap-2'>
          <h1 className='text-sm font-semibold'>Requests</h1>
          <span className='text-muted-foreground text-xs'>
            intake and review
          </span>
        </div>
        <nav
          aria-label='Request scope'
          className='order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1'
        >
          {scopes.map(item => (
            <Button
              key={item.value}
              variant='ghost'
              size='sm'
              className={cn(
                'h-7 shrink-0 px-2 text-xs',
                scope === item.value && 'bg-muted',
              )}
              onClick={() => setScope(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </nav>
        <div className='relative min-w-24 flex-1 sm:w-40 sm:flex-none md:w-52'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2' />
          <Input
            value={searchQuery}
            onChange={event => setSearch(event.target.value)}
            placeholder='Search requests…'
            aria-label='Search requests'
            maxLength={200}
            className='h-7 pr-7 pl-7 text-xs'
          />
          {searchQuery && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='text-muted-foreground absolute top-1/2 right-0.5 size-6 -translate-y-1/2 p-0'
              aria-label='Clear request search'
              onClick={() => setSearch('')}
            >
              <X className='size-3' />
            </Button>
          )}
        </div>
        <div
          className='border-border flex shrink-0 items-center rounded-md border'
          role='group'
          aria-label='Request view'
        >
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size='sm'
            className='h-7 rounded-r-none px-2'
            onClick={() => setViewMode('table')}
            aria-label='Table view'
            title='Table view'
          >
            <LayoutList className='size-3.5' />
          </Button>
          <Button
            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
            size='sm'
            className='h-7 rounded-l-none px-2'
            onClick={() => setViewMode('kanban')}
            aria-label='Kanban view'
            title='Kanban view'
          >
            <Columns3 className='size-3.5' />
          </Button>
        </div>
        {viewMode === 'table' && (
          <GroupBySelector
            options={[
              { value: 'none', label: 'No grouping' },
              { value: 'priority', label: 'Priority' },
              { value: 'status', label: 'Status' },
            ]}
            value={groupBy}
            onChange={setGroupBy}
            className='h-7 px-2 text-xs'
          />
        )}
        <div className='shrink-0'>
          <CreateRequestDialog orgSlug={orgSlug} />
        </div>
      </header>
      {result.status === 'LoadingFirstPage' ? (
        viewMode === 'kanban' ? (
          <KanbanSkeleton />
        ) : (
          <div>
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className='flex h-10 items-center gap-2 border-b px-3'
              >
                <Skeleton className='size-3 rounded-full' />
                <Skeleton className='h-3 w-16' />
                <Skeleton className='h-3 max-w-96 flex-1' />
                <Skeleton className='h-5 w-24 rounded-full' />
              </div>
            ))}
          </div>
        )
      ) : result.results.length === 0 && result.status === 'Exhausted' ? (
        <div className='text-muted-foreground flex min-h-64 flex-col items-center justify-center gap-2 text-center'>
          <Inbox className='size-7 opacity-40' />
          <p className='text-sm'>
            {debouncedSearch
              ? `No requests match “${debouncedSearch}”`
              : scope === 'inbox'
                ? 'The request inbox is clear'
                : scope === 'mine'
                  ? 'Nothing is routed to you'
                  : scope === 'requested'
                    ? 'You have not made any requests'
                    : 'No requests yet'}
          </p>
          <p className='max-w-sm text-xs'>
            {debouncedSearch
              ? 'Search checks the title, description, and expected output in this scope.'
              : scope === 'inbox'
                ? 'New requests stay visible here until they are routed, planned, or reviewed.'
                : scope === 'mine'
                  ? 'Requests assigned directly to you will appear here.'
                  : scope === 'requested'
                    ? 'Requests you create will stay visible here through delivery and review.'
                    : 'Create a request to define an expected output and route it into Work.'}
          </p>
        </div>
      ) : viewMode === 'kanban' ? (
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
          <div className='min-h-0 flex-1'>
            <RequestsKanban
              requests={result.results}
              orgSlug={orgSlug}
              currentTime={currentTime}
              deletingRequestId={deletingRequestId}
              onDelete={request => void handleDelete(request)}
            />
          </div>
          <AutoLoadMore
            status={result.status}
            loadMore={() => result.loadMore(40)}
            className='shrink-0'
          />
        </div>
      ) : (
        <div>
          {groupBy === 'none'
            ? result.results.map(request => (
                <RequestRow
                  key={request._id}
                  request={request}
                  orgSlug={orgSlug}
                  currentTime={currentTime}
                  deleting={deletingRequestId === request._id}
                  onDelete={() => void handleDelete(request)}
                />
              ))
            : groups.map(group => (
                <GroupSection
                  key={group.key}
                  label={group.label}
                  count={group.requests.length}
                  icon={group.icon}
                  color={group.color}
                >
                  {group.requests.map(request => (
                    <RequestRow
                      key={request._id}
                      request={request}
                      orgSlug={orgSlug}
                      currentTime={currentTime}
                      deleting={deletingRequestId === request._id}
                      onDelete={() => void handleDelete(request)}
                    />
                  ))}
                </GroupSection>
              ))}
          <AutoLoadMore
            status={result.status}
            loadMore={() => result.loadMore(40)}
          />
        </div>
      )}
      <ConfirmDeleteDialog />
    </div>
  );
}
