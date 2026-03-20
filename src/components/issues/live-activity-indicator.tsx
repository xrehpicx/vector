'use client';

import { cn } from '@/lib/utils';
import { Activity, Cpu, Terminal } from 'lucide-react';

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

/**
 * Compact inline indicator for issue rows (list/timeline).
 * Shows a pulsing dot + provider icon when an agent/shell is active.
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
  const isActive =
    primary.status === 'active' || primary.status === 'waiting_for_input';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium',
        isActive
          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
          : 'bg-muted text-muted-foreground',
        className,
      )}
      title={`${providerLabel(primary.provider)} ${primary.status.replace(/_/g, ' ')}${activities.length > 1 ? ` (+${activities.length - 1} more)` : ''}`}
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
    </span>
  );
}

/**
 * Kanban card live activity preview.
 * Shows provider label + status for each active session.
 */
export function LiveActivityPreview({
  activities,
}: {
  activities: LiveActivitySummary[];
}) {
  if (activities.length === 0) return null;

  return (
    <div className='mt-2 space-y-1'>
      {activities.map(activity => {
        const isActive =
          activity.status === 'active' ||
          activity.status === 'waiting_for_input';
        const label = providerLabel(activity.provider);
        const statusLabel = activity.status.replace(/_/g, ' ');

        return (
          <div
            key={activity._id}
            className='bg-muted/30 flex items-center gap-2 rounded-md px-2 py-1.5'
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                isActive ? 'animate-pulse bg-green-500' : 'bg-muted-foreground',
              )}
            />
            <ProviderIcon
              provider={activity.provider}
              className='text-muted-foreground size-3 shrink-0'
            />
            <span className='truncate text-[11px] font-medium'>{label}</span>
            <span className='text-muted-foreground text-[10px] capitalize'>
              {statusLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
