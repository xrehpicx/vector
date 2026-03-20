'use client';

import { formatDistanceToNow } from 'date-fns';
import { api, useCachedQuery } from '@/lib/convex';
import type { Id } from '@/convex/_generated/dataModel';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Activity, Cpu, Monitor, Terminal } from 'lucide-react';
import { WorkSessionTerminal } from '@/components/live-activity/work-session-terminal';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type LiveActivitySummary = {
  _id: string;
  provider: string;
  status: string;
};

function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  switch (provider) {
    case 'codex':
      return <Cpu className={className} />;
    case 'claude_code':
      return <Terminal className={className} />;
    default:
      return <Activity className={className} />;
  }
}

function providerLabel(provider: string) {
  switch (provider) {
    case 'codex':
      return 'Codex';
    case 'claude_code':
      return 'Claude';
    default:
      return 'Shell';
  }
}

function isSessionActive(status: string) {
  return status === 'active' || status === 'waiting_for_input';
}

/**
 * Compact inline indicator for issue rows (list/timeline).
 * Shows a pulsing dot + provider icon. Click to see details in a popover.
 */
export function LiveActivityBadge({
  activities,
  className,
}: {
  activities: LiveActivitySummary[];
  className?: string;
}) {
  if (activities.length === 0) return null;

  const primary = activities[0];
  const isActive = isSessionActive(primary.status);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          onClick={e => e.stopPropagation()}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium transition-opacity hover:opacity-80',
            isActive
              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-muted text-muted-foreground',
            className,
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              isActive ? 'animate-pulse bg-green-500' : 'bg-muted-foreground',
            )}
          />
          <ProviderIcon provider={primary.provider} className='size-3' />
          {activities.length > 1 && (
            <span className='text-[9px]'>+{activities.length - 1}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-64 p-0'
        onClick={e => e.stopPropagation()}
      >
        <div className='px-3 py-2'>
          <div className='text-xs font-medium'>
            {activities.length === 1
              ? 'Active work session'
              : `${activities.length} active sessions`}
          </div>
        </div>
        <div className='border-t px-2 py-1.5'>
          {activities.map(activity => {
            const active = isSessionActive(activity.status);
            const label = providerLabel(activity.provider);
            const statusLabel = activity.status.replace(/_/g, ' ');

            return (
              <div
                key={activity._id}
                className='flex items-center gap-2 rounded-md px-1.5 py-1.5'
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    active
                      ? 'animate-pulse bg-green-500'
                      : 'bg-muted-foreground',
                  )}
                />
                <ProviderIcon
                  provider={activity.provider}
                  className='text-muted-foreground size-3.5 shrink-0'
                />
                <span className='text-sm font-medium'>{label}</span>
                <span className='text-muted-foreground text-xs capitalize'>
                  {statusLabel}
                </span>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LiveActivityPreviewSkeleton({ extraCount }: { extraCount: number }) {
  return (
    <div className='border-border/70 bg-muted/20 mt-2 overflow-hidden rounded-md border'>
      <div className='flex items-center gap-2 px-2.5 py-2'>
        <Skeleton className='h-2.5 w-2.5 rounded-full' />
        <Skeleton className='h-3.5 w-3.5 rounded-sm' />
        <Skeleton className='h-3.5 w-16' />
        <Skeleton className='h-3.5 w-14' />
        {extraCount > 0 ? <Skeleton className='ml-auto h-4 w-12' /> : null}
      </div>
      <div className='border-border/60 border-t bg-[#0b0b0d] px-2.5 py-2'>
        <Skeleton className='mb-2 h-3 w-40 bg-white/10' />
        <Skeleton className='mb-1.5 h-3 w-full bg-white/10' />
        <Skeleton className='mb-1.5 h-3 w-[88%] bg-white/10' />
        <Skeleton className='h-3 w-[68%] bg-white/10' />
      </div>
    </div>
  );
}

function LiveActivityPreviewFallback({
  activity,
  extraCount,
}: {
  activity: LiveActivitySummary;
  extraCount: number;
}) {
  const isActive = isSessionActive(activity.status);
  const label = providerLabel(activity.provider);
  const statusLabel = activity.status.replace(/_/g, ' ');

  return (
    <div className='border-border/70 bg-muted/20 mt-2 overflow-hidden rounded-md border'>
      <div className='flex items-center gap-2 px-2.5 py-2'>
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            isActive ? 'animate-pulse bg-green-500' : 'bg-muted-foreground',
          )}
        />
        <ProviderIcon
          provider={activity.provider}
          className='text-muted-foreground size-3.5 shrink-0'
        />
        <span className='truncate text-[11px] font-medium'>{label}</span>
        <span className='text-muted-foreground text-[10px] capitalize'>
          {statusLabel}
        </span>
        {extraCount > 0 && (
          <span className='bg-background text-muted-foreground ml-auto rounded-full border px-1.5 py-0.5 text-[9px] font-medium'>
            +{extraCount} more
          </span>
        )}
      </div>
      <div className='border-border/60 border-t bg-[#0b0b0d] px-2.5 py-3'>
        <div className='text-[10px] text-zinc-500'>
          Terminal preview unavailable for this session.
        </div>
      </div>
    </div>
  );
}

/**
 * Kanban card live activity preview.
 * Shows a taller live terminal preview for the primary active session.
 */
export function LiveActivityPreview({
  activities,
}: {
  activities: LiveActivitySummary[];
}) {
  const primaryId = activities[0]?._id;
  const activity = useCachedQuery(
    api.agentBridge.queries.getLiveActivity,
    primaryId
      ? { liveActivityId: primaryId as Id<'issueLiveActivities'> }
      : 'skip',
  );

  if (activities.length === 0) return null;

  const extraCount = Math.max(0, activities.length - 1);

  if (activity === undefined) {
    return <LiveActivityPreviewSkeleton extraCount={extraCount} />;
  }

  if (activity === null) {
    return (
      <LiveActivityPreviewFallback
        activity={activities[0]}
        extraCount={extraCount}
      />
    );
  }

  const isActive = isSessionActive(activity.status);
  const label = providerLabel(activity.provider);
  const statusLabel = activity.status.replace(/_/g, ' ');
  const workspaceLabel =
    activity.workSession?.repoRoot ??
    activity.workSession?.workspacePath ??
    activity.workSession?.cwd ??
    activity.title;
  const workspaceName = workspaceLabel
    ? workspaceLabel.split('/').filter(Boolean).at(-1)
    : null;
  const timeAgo = formatDistanceToNow(activity.lastEventAt, {
    addSuffix: true,
  });
  const workSession = activity.workSession;
  const terminalSnapshot = workSession?.terminalSnapshot?.trim() ?? '';
  const showTerminal = terminalSnapshot.length > 0;

  return (
    <div className='border-border/70 bg-muted/20 mt-2 overflow-hidden rounded-md border'>
      <div className='flex items-center gap-2 px-2.5 py-2'>
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            isActive ? 'animate-pulse bg-green-500' : 'bg-muted-foreground',
          )}
        />
        <ProviderIcon
          provider={activity.provider}
          className='text-muted-foreground size-3.5 shrink-0'
        />
        <span className='truncate text-[11px] font-medium'>{label}</span>
        <span className='text-muted-foreground text-[10px] capitalize'>
          {statusLabel}
        </span>
        {extraCount > 0 && (
          <span className='bg-background text-muted-foreground ml-auto rounded-full border px-1.5 py-0.5 text-[9px] font-medium'>
            +{extraCount} more
          </span>
        )}
      </div>

      <div className='border-border/60 border-t bg-[#0b0b0d]'>
        <div className='flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-zinc-400'>
          {workspaceName ? (
            <>
              <span className='min-w-0 truncate font-medium text-zinc-300'>
                {workspaceName}
              </span>
              <span className='text-zinc-600'>&middot;</span>
            </>
          ) : null}
          <Monitor className='size-3 shrink-0' />
          <span className='min-w-0 truncate'>{activity.deviceName}</span>
          <span className='text-zinc-600'>&middot;</span>
          <span className='shrink-0'>{timeAgo}</span>
        </div>

        <div className='px-2.5 pb-2'>
          {showTerminal ? (
            <WorkSessionTerminal
              snapshot={terminalSnapshot}
              autoFocus={false}
              heightClassName='h-36'
            />
          ) : (
            <div className='flex min-h-24 items-center font-mono text-[10px] text-zinc-500'>
              Terminal preview will appear here once the session writes output.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
