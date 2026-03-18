'use client';

import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ProviderIcon } from './live-activity-section';

type LiveActivity = FunctionReturnType<
  typeof api.agentBridge.queries.listIssueLiveActivities
>[number];

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

export function LiveActivityRow({
  activity,
  isExpanded,
  onToggleExpand,
}: {
  activity: LiveActivity;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const timeAgo = formatDistanceToNow(activity.lastEventAt, {
    addSuffix: true,
  });

  return (
    <button
      type='button'
      onClick={onToggleExpand}
      className={cn(
        'hover:bg-muted/50 group/row flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
        isExpanded && 'bg-muted/50',
      )}
    >
      {/* Provider icon */}
      <ProviderIcon
        provider={activity.provider}
        className='text-muted-foreground shrink-0'
      />

      {/* Content */}
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
        {activity.latestSummary && (
          <div className='text-muted-foreground mt-0.5 truncate text-xs'>
            {activity.latestSummary}
          </div>
        )}
      </div>

      {/* Expand toggle */}
      <div className='text-muted-foreground shrink-0'>
        {isExpanded ? (
          <ChevronUp className='size-4' />
        ) : (
          <ChevronDown className='size-4' />
        )}
      </div>
    </button>
  );
}
