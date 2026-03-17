'use client';

import { api, useCachedQuery } from '@/lib/convex';
import {
  Lock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Globe,
} from 'lucide-react';
import { DynamicIcon } from '@/lib/dynamic-icons';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { UserAvatar } from '@/components/user-avatar';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Markdown from 'react-markdown';
import { formatDateHuman } from '@/lib/date';

interface PublicViewPageProps {
  orgSlug: string;
  viewId: string;
}

const PAGE_SIZE = 50;

export function PublicViewPage({ orgSlug, viewId }: PublicViewPageProps) {
  const [page, setPage] = useState(1);

  const view = useCachedQuery(api.views.queries.getPublicView, {
    orgSlug,
    viewId,
  });

  const issuesData = useCachedQuery(
    api.views.queries.listPublicViewIssues,
    view ? { viewId, page, pageSize: PAGE_SIZE } : 'skip',
  );

  if (view === undefined) {
    return (
      <>
        {/* Skeleton navbar */}
        <div className='border-b px-4 py-2'>
          <div className='flex items-center gap-2'>
            <Skeleton className='size-5 rounded' />
            <Skeleton className='h-4 w-24' />
          </div>
        </div>
        <div className='mx-auto max-w-3xl space-y-4 px-4 py-10'>
          <Skeleton className='h-7 w-48' />
          <Skeleton className='h-4 w-72' />
          <div className='mt-6 space-y-2'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (view === null) {
    return (
      <div className='flex min-h-[60vh] flex-col items-center justify-center gap-2'>
        <Lock className='text-muted-foreground size-10 opacity-30' />
        <p className='text-muted-foreground text-sm'>
          This view is not available or is private.
        </p>
      </div>
    );
  }

  const { issues = [], total = 0 } = issuesData ?? {};
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const viewLayout = view.layout?.viewMode ?? 'table';
  const viewGroupBy = view.layout?.groupBy ?? 'none';

  return (
    <div className='flex min-h-screen flex-col'>
      {/* ── Top navbar ────────────────────────────────────────────── */}
      <header className='bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 border-b backdrop-blur'>
        <div className='flex flex-col gap-1 px-4 py-2'>
          {/* Row 1: org breadcrumb (left) + Public badge (right) */}
          <div className='flex items-center justify-between gap-2'>
            <div className='flex min-w-0 items-center gap-2'>
              {view.orgLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={view.orgLogo}
                  alt={view.orgName}
                  className='size-5 flex-shrink-0 rounded-full object-cover'
                />
              ) : (
                <div className='bg-muted flex size-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold'>
                  {view.orgName?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className='flex-shrink-0 text-sm font-medium'>
                {view.orgName}
              </span>
              <span className='text-muted-foreground flex-shrink-0 text-xs'>
                /
              </span>
              <span className='text-muted-foreground min-w-0 truncate text-xs'>
                {view.name}
              </span>
            </div>
            <div className='flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5'>
              <Globe className='size-3 text-emerald-500' />
              <span className='text-xs text-emerald-600 dark:text-emerald-400'>
                Public
              </span>
            </div>
          </div>

          {/* Row 2: creator (left) + updated (right) */}
          <div className='flex items-center justify-between gap-2'>
            {view.creator ? (
              <div className='flex items-center gap-1.5'>
                <span className='text-muted-foreground text-xs'>by</span>
                <UserAvatar
                  name={view.creator.name}
                  email={view.creator.email}
                  image={view.creator.image}
                  size='sm'
                />
                <span className='text-muted-foreground text-xs'>
                  {view.creator.name ?? view.creator.email}
                </span>
              </div>
            ) : (
              <span />
            )}
            {view.updatedAt && (
              <span className='text-muted-foreground flex-shrink-0 text-xs'>
                Updated {formatDateHuman(new Date(view.updatedAt))}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Header content ─────────────────────────────────────────── */}
      <div className='mx-auto w-full max-w-3xl px-4 py-8'>
        <h1 className='text-2xl font-semibold tracking-tight'>{view.name}</h1>
        {view.description && (
          <div className='prose prose-sm dark:prose-invert text-muted-foreground mt-2 max-w-none'>
            <Markdown>{view.description}</Markdown>
          </div>
        )}
      </div>

      {/* ── Issues ─────────────────────────────────────────────────── */}
      {!issuesData ? (
        <div className='mx-auto w-full max-w-3xl px-4'>
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        </div>
      ) : viewLayout === 'kanban' ? (
        <PublicKanbanView
          issues={issues}
          orgSlug={orgSlug}
          groupBy={viewGroupBy}
          allStatuses={view.allStatuses}
        />
      ) : (
        <div className='mx-auto w-full max-w-3xl px-4'>
          {issues.length === 0 ? (
            <div className='text-muted-foreground py-20 text-center text-sm'>
              No issues to show.
            </div>
          ) : (
            <PublicListView
              issues={issues}
              orgSlug={orgSlug}
              groupBy={viewGroupBy}
            />
          )}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className='mx-auto mt-6 w-full max-w-3xl px-4'>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-xs'>
              {total} issue{total !== 1 ? 's' : ''}
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='h-7'
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className='size-3.5' />
                Prev
              </Button>
              <span className='text-muted-foreground text-xs'>
                {page} / {totalPages}
              </span>
              <Button
                variant='outline'
                size='sm'
                className='h-7'
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
                <ChevronRight className='size-3.5' />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Issue type ─────────────────────────────────────────────────────────

interface PublicIssueData {
  _id: string;
  key: string;
  title: string;
  isPublic: boolean;
  description?: string | null;
  status: {
    name: string;
    color: string | null;
    type: string;
    icon: string | null;
  } | null;
  priority?: {
    name: string;
    color: string | null;
    icon: string | null;
  } | null;
  assignees?: Array<{ name?: string; image?: string }>;
  project?: { name: string; key: string } | null;
  team?: { name: string; key: string } | null;
  startDate?: string | null;
  dueDate?: string | null;
}

interface PublicStatusData {
  _id: string;
  name: string;
  color: string | null;
  icon: string | null;
  type: string;
}

// ─── Grouping helper ────────────────────────────────────────────────────

interface IssueGroup {
  key: string;
  label: string;
  color: string | null;
  icon: string | null;
  items: PublicIssueData[];
}

function groupIssues(
  issues: PublicIssueData[],
  groupBy: string,
  allStatuses?: PublicStatusData[],
): IssueGroup[] {
  if (groupBy === 'none' || !groupBy) {
    return [{ key: 'all', label: '', color: null, icon: null, items: issues }];
  }

  const groups = new Map<string, IssueGroup>();

  // Pre-seed status columns with all known statuses so empty ones show
  if (groupBy === 'status' && allStatuses?.length) {
    for (const s of allStatuses) {
      groups.set(s.name, {
        key: s.name,
        label: s.name,
        color: s.color,
        icon: s.icon,
        items: [],
      });
    }
  }

  for (const issue of issues) {
    let key: string;
    let label: string;
    let color: string | null = null;
    let icon: string | null = null;

    switch (groupBy) {
      case 'status':
        key = issue.status?.name ?? 'No Status';
        label = key;
        color = issue.status?.color ?? null;
        icon = issue.status?.icon ?? null;
        break;
      case 'priority':
        key = issue.priority?.name ?? 'No Priority';
        label = key;
        color = issue.priority?.color ?? null;
        icon = issue.priority?.icon ?? null;
        break;
      case 'project':
        key = issue.project?.name ?? 'No Project';
        label = key;
        break;
      case 'team':
        key = issue.team?.name ?? 'No Team';
        label = key;
        break;
      default:
        key = 'all';
        label = '';
    }

    if (!groups.has(key)) {
      groups.set(key, { key, label, color, icon, items: [] });
    }
    groups.get(key)!.items.push(issue);
  }

  return Array.from(groups.values());
}

// ─── List layout ────────────────────────────────────────────────────────

function PublicListView({
  issues,
  orgSlug,
  groupBy,
}: {
  issues: PublicIssueData[];
  orgSlug: string;
  groupBy: string;
}) {
  const groups = groupIssues(issues, groupBy);

  return (
    <div className='space-y-6'>
      {groups.map(group => (
        <div key={group.key}>
          {group.label && (
            <div className='mb-2 flex items-center gap-1.5'>
              {group.icon && (
                <DynamicIcon
                  name={group.icon}
                  className='size-3.5'
                  style={{ color: group.color ?? undefined }}
                />
              )}
              <span className='text-sm font-medium'>{group.label}</span>
              <span className='text-muted-foreground text-xs'>
                {group.items.length}
              </span>
            </div>
          )}
          <div className='space-y-1'>
            {group.items.map(issue => (
              <PublicIssueCard
                key={issue._id}
                issue={issue}
                orgSlug={orgSlug}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Kanban layout ──────────────────────────────────────────────────────

function PublicKanbanView({
  issues,
  orgSlug,
  groupBy,
  allStatuses,
}: {
  issues: PublicIssueData[];
  orgSlug: string;
  groupBy: string;
  allStatuses?: PublicStatusData[];
}) {
  const effectiveGroupBy = groupBy === 'none' ? 'status' : groupBy;
  const groups = groupIssues(
    issues,
    effectiveGroupBy,
    effectiveGroupBy === 'status' ? allStatuses : undefined,
  );

  return (
    <ScrollArea className='w-full' type='scroll'>
      <div className='flex min-h-[50vh] gap-3 px-4 pb-16'>
        {groups.map(group => (
          <div key={group.key} className='min-w-[260px] flex-shrink-0'>
            <div className='mb-2 flex items-center gap-1.5'>
              {group.icon && (
                <DynamicIcon
                  name={group.icon}
                  className='size-3.5'
                  style={{ color: group.color ?? undefined }}
                />
              )}
              <span className='text-sm font-medium'>{group.label}</span>
              <span className='text-muted-foreground text-xs'>
                {group.items.length}
              </span>
            </div>
            <div className='space-y-1.5'>
              {group.items.length === 0 ? (
                <div className='border-border text-muted-foreground rounded-md border border-dashed py-6 text-center text-xs'>
                  No issues
                </div>
              ) : (
                group.items.map(issue => (
                  <PublicIssueCard
                    key={issue._id}
                    issue={issue}
                    orgSlug={orgSlug}
                    compact
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      <ScrollBar orientation='horizontal' />
    </ScrollArea>
  );
}

// ─── Issue card ─────────────────────────────────────────────────────────

function PublicIssueCard({
  issue,
  orgSlug: _orgSlug,
  compact,
}: {
  issue: PublicIssueData;
  orgSlug: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border-border hover:bg-muted/50 group cursor-pointer rounded-md border transition-colors ${
        compact ? 'p-2' : 'px-3 py-2.5'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main row */}
      <div className='flex items-center gap-2'>
        {/* Status icon */}
        {issue.status && (
          <div
            className='flex size-4 flex-shrink-0 items-center justify-center'
            style={{ color: issue.status.color ?? undefined }}
          >
            {issue.status.icon ? (
              <DynamicIcon name={issue.status.icon} className='size-4' />
            ) : (
              <div
                className='size-2.5 rounded-full border-2'
                style={{ borderColor: issue.status.color ?? '#888' }}
              />
            )}
          </div>
        )}

        {/* Key */}
        <span className='text-muted-foreground flex-shrink-0 text-xs'>
          {issue.key}
        </span>

        {/* Title */}
        <span
          className={`min-w-0 flex-1 truncate ${compact ? 'text-xs' : 'text-sm'}`}
        >
          {issue.title}
        </span>

        {/* Expand indicator */}
        <ChevronDown
          className={`text-muted-foreground size-3 flex-shrink-0 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className='overflow-hidden'
          >
            <div className='mt-2 max-w-sm space-y-2 border-t pt-2'>
              {/* Status */}
              {issue.status && (
                <div className='flex items-center gap-2'>
                  <span className='text-muted-foreground text-xs'>Status</span>
                  <span
                    className='rounded px-1.5 py-0.5 text-xs font-medium'
                    style={{
                      color: issue.status.color ?? undefined,
                      backgroundColor: issue.status.color
                        ? `${issue.status.color}15`
                        : undefined,
                    }}
                  >
                    {issue.status.name}
                  </span>
                </div>
              )}

              {/* Description — rendered as markdown */}
              {issue.description && (
                <div className='prose prose-sm dark:prose-invert text-muted-foreground max-w-none text-xs leading-relaxed break-words'>
                  <Markdown>{issue.description}</Markdown>
                </div>
              )}

              {/* Priority (public issues only) */}
              {issue.isPublic && issue.priority && (
                <div className='flex items-center gap-2'>
                  <span className='text-muted-foreground text-xs'>
                    Priority
                  </span>
                  <span
                    className='flex items-center gap-1 text-xs'
                    style={{ color: issue.priority.color ?? undefined }}
                  >
                    {issue.priority.icon && (
                      <DynamicIcon
                        name={issue.priority.icon}
                        className='size-3'
                      />
                    )}
                    {issue.priority.name}
                  </span>
                </div>
              )}

              {/* Non-public notice */}
              {!issue.isPublic && (
                <p className='text-muted-foreground flex items-center gap-1 text-xs italic'>
                  <Lock className='size-3 opacity-50' />
                  Limited details — this issue is not public
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
