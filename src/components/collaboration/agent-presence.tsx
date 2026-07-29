'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  AlertCircle,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  CircleDashed,
  FileCode2,
  Hand,
  MessageSquareText,
  Pause,
  Play,
  ShieldAlert,
  SquareTerminal,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarsSpinner } from '@/components/bars-spinner';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PermissionAwareSelector } from '@/components/ui/permission-aware';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOptimisticValue } from '@/hooks/use-optimistic';
import { cn } from '@/lib/utils';
import type {
  AgentWakeMode,
  CollaborationAgent,
  CollaborationAgentRun,
  CollaborationRunEventKind,
  CollaborationRunStatus,
} from './types';

const wakeModes: ReadonlyArray<{
  value: AgentWakeMode;
  label: string;
  description: string;
}> = [
  {
    value: 'mentions',
    label: 'On mentions',
    description: 'Wake when someone tags this agent.',
  },
  {
    value: 'every_message',
    label: 'On every message',
    description: 'Wake for each new message in this channel.',
  },
  {
    value: 'off',
    label: 'Paused in channel',
    description: 'Keep the agent visible without waking it.',
  },
];

const runStatusMeta: Record<
  CollaborationRunStatus,
  {
    label: string;
    icon: typeof Bot;
    className: string;
    active: boolean;
  }
> = {
  queued: {
    label: 'Queued',
    icon: CircleDashed,
    className: 'text-muted-foreground',
    active: true,
  },
  starting: {
    label: 'Starting',
    icon: Play,
    className: 'text-blue-600 dark:text-blue-400',
    active: true,
  },
  running: {
    label: 'Working',
    icon: BrainCircuit,
    className: 'text-blue-600 dark:text-blue-400',
    active: true,
  },
  waiting_for_permission: {
    label: 'Needs approval',
    icon: Hand,
    className: 'text-amber-700 dark:text-amber-400',
    active: true,
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'text-emerald-700 dark:text-emerald-400',
    active: false,
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'text-destructive',
    active: false,
  },
  canceled: {
    label: 'Canceled',
    icon: X,
    className: 'text-muted-foreground',
    active: false,
  },
  offline: {
    label: 'Offline',
    icon: AlertCircle,
    className: 'text-muted-foreground',
    active: false,
  },
};

const eventIcons: Record<CollaborationRunEventKind, typeof Bot> = {
  status: CircleDashed,
  thought: BrainCircuit,
  plan: Play,
  tool: Wrench,
  terminal: SquareTerminal,
  file: FileCode2,
  permission: ShieldAlert,
  message: MessageSquareText,
  error: AlertCircle,
};

const hiddenTechnicalEventTitles = new Set([
  'Available Commands Update',
  'Session Info Update',
  'Usage Update',
]);

function buildRunTimeline(events: CollaborationAgentRun['events']) {
  const timeline: CollaborationAgentRun['events'] = [];

  for (const event of events) {
    if (
      event.kind === 'status' &&
      hiddenTechnicalEventTitles.has(event.title)
    ) {
      continue;
    }
    if (event.kind === 'thought' && !event.body?.trim()) {
      continue;
    }
    const previous = timeline[timeline.length - 1];
    if (previous && event.kind === 'message' && previous.kind === 'message') {
      continue;
    }
    timeline.push(
      event.kind === 'message'
        ? { ...event, title: 'Agent response', body: undefined }
        : { ...event },
    );
  }

  return timeline;
}

export function AgentAvatar({
  agent,
  size = 'sm',
  className,
}: {
  agent: CollaborationAgent;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}) {
  return (
    <Avatar
      size={size}
      className={cn('rounded-md', className)}
      aria-label={`${agent.name}, agent owned by ${agent.owner.name}`}
    >
      {agent.avatar ? <AvatarImage src={agent.avatar} alt='' /> : null}
      <AvatarFallback className='bg-primary/10 text-primary rounded-md'>
        <Bot className='size-1/2' aria-hidden='true' />
      </AvatarFallback>
    </Avatar>
  );
}

export function AgentOwnerLabel({
  agent,
  className,
}: {
  agent: CollaborationAgent;
  className?: string;
}) {
  return (
    <span className={cn('text-muted-foreground text-xs', className)}>
      Owned by {agent.owner.name}
    </span>
  );
}

export function AgentLifecycleBadge({
  status,
}: {
  status: CollaborationAgent['lifecycleStatus'];
}) {
  const meta = {
    ready: {
      label: 'Ready',
      icon: CheckCircle2,
      className: 'text-emerald-700 dark:text-emerald-400',
    },
    offline: {
      label: 'Offline',
      icon: XCircle,
      className: 'text-muted-foreground',
    },
    paused: {
      label: 'Paused',
      icon: Pause,
      className: 'text-amber-700 dark:text-amber-400',
    },
  }[status];
  const Icon = meta.icon;

  return (
    <Badge variant='outline' className={cn('h-5 gap-1 px-1.5', meta.className)}>
      <Icon className='size-3' aria-hidden='true' />
      {meta.label}
    </Badge>
  );
}

export function AgentWakeModeSelector({
  orgSlug,
  value,
  onChange,
  disabled,
}: {
  orgSlug: string;
  value: AgentWakeMode;
  onChange: (value: AgentWakeMode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [displayValue, setOptimisticValue] = useOptimisticValue(value);
  const current = wakeModes.find(mode => mode.value === displayValue)!;

  return (
    <PermissionAwareSelector
      orgSlug={orgSlug}
      permission='channel:manage:members'
      disabled={disabled}
      fallbackMessage='You need channel management access to change when this agent wakes.'
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='bg-muted/30 hover:bg-muted/50 h-8 max-w-full min-w-0 gap-2'
            disabled={disabled}
            aria-label={`Agent wake mode: ${current.label}`}
          >
            {displayValue === 'every_message' ? (
              <Play className='size-3.5 shrink-0' aria-hidden='true' />
            ) : displayValue === 'mentions' ? (
              <MessageSquareText
                className='size-3.5 shrink-0'
                aria-hidden='true'
              />
            ) : (
              <Pause className='size-3.5 shrink-0' aria-hidden='true' />
            )}
            <span className='truncate'>{current.label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align='end' className='w-72 p-0'>
          <Command>
            <CommandInput placeholder='Search wake modes…' className='h-9' />
            <CommandList>
              <CommandGroup heading='Wake mode'>
                {wakeModes.map(mode => (
                  <CommandItem
                    key={mode.value}
                    value={`${mode.label} ${mode.description}`}
                    onSelect={() => {
                      setOptimisticValue(mode.value);
                      onChange(mode.value);
                      setOpen(false);
                    }}
                  >
                    <div className='min-w-0 flex-1'>
                      <p className='text-sm font-medium'>{mode.label}</p>
                      <p className='text-muted-foreground text-xs leading-4 text-pretty'>
                        {mode.description}
                      </p>
                    </div>
                    <Check
                      className={cn(
                        'size-4',
                        displayValue === mode.value
                          ? 'opacity-100'
                          : 'opacity-0',
                      )}
                      aria-hidden='true'
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </PermissionAwareSelector>
  );
}

export function AgentRunStatusPill({
  run,
  compact = false,
  onRespondToPermission,
  onCancelRun,
}: {
  run: CollaborationAgentRun;
  compact?: boolean;
  onRespondToPermission?: (
    runId: string,
    optionId: string,
  ) => Promise<void> | void;
  onCancelRun?: (runId: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const meta = runStatusMeta[run.status];
  const Icon = meta.icon;
  const timeLabel = useMemo(() => {
    const timestamp = run.completedAt ?? run.startedAt ?? run.createdAt;
    return formatDistanceToNowStrict(timestamp, { addSuffix: true });
  }, [run.completedAt, run.createdAt, run.startedAt]);

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className={cn(
          'hover:bg-muted focus-visible:ring-ring inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.96]',
          meta.className,
        )}
        aria-label={`${run.agent.name} run status: ${meta.label}. Open run details.`}
      >
        <Icon
          className={cn('size-3.5 shrink-0', meta.active && 'animate-pulse')}
          aria-hidden='true'
        />
        <span className='truncate'>
          {compact
            ? meta.label
            : (run.currentActivity ?? run.latestSummary ?? meta.label)}
        </span>
        {!compact ? (
          <span className='text-muted-foreground hidden shrink-0 tabular-nums sm:inline'>
            {timeLabel}
          </span>
        ) : null}
      </button>
      <AgentRunInspector
        run={run}
        open={open}
        onOpenChange={setOpen}
        onRespondToPermission={onRespondToPermission}
        onCancelRun={onCancelRun}
      />
    </>
  );
}

export function AgentRunInspector({
  run,
  open,
  onOpenChange,
  onRespondToPermission,
  onCancelRun,
}: {
  run: CollaborationAgentRun;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRespondToPermission?: (
    runId: string,
    optionId: string,
  ) => Promise<void> | void;
  onCancelRun?: (runId: string) => Promise<void> | void;
}) {
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const meta = runStatusMeta[run.status];
  const StatusIcon = meta.icon;
  const timelineEvents = useMemo(
    () => buildRunTimeline(run.events),
    [run.events],
  );
  const activity =
    run.status === 'completed'
      ? 'Completed successfully. The final response was posted to the channel.'
      : run.status === 'canceled'
        ? 'This run was canceled.'
        : meta.active
          ? run.currentActivity
          : (run.latestSummary ?? run.currentActivity);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='w-full gap-0 p-0 sm:max-w-md'
        aria-describedby='agent-run-description'
      >
        <SheetHeader className='border-b p-3 pr-12'>
          <div className='flex items-center gap-2'>
            <AgentAvatar agent={run.agent} size='default' />
            <div className='min-w-0 flex-1'>
              <SheetTitle className='truncate text-sm'>
                {run.agent.name} activity
              </SheetTitle>
              <SheetDescription
                id='agent-run-description'
                className='truncate text-xs'
              >
                @{run.agent.handle} · owned by {run.agent.owner.name}
              </SheetDescription>
            </div>
            <Badge
              variant='outline'
              className={cn('h-6 gap-1.5', meta.className)}
            >
              <StatusIcon className='size-3.5' aria-hidden='true' />
              {meta.label}
            </Badge>
          </div>
          {meta.active && onCancelRun ? (
            <div className='mt-2 flex justify-end'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='text-muted-foreground h-7 gap-1.5 px-2 text-xs'
                disabled={isCanceling}
                onClick={() => {
                  setIsCanceling(true);
                  void Promise.resolve(onCancelRun(run.id)).finally(() =>
                    setIsCanceling(false),
                  );
                }}
              >
                {isCanceling ? (
                  <BarsSpinner size={11} />
                ) : (
                  <X className='size-3.5' aria-hidden='true' />
                )}
                Cancel run
              </Button>
            </div>
          ) : null}
        </SheetHeader>

        <div className='space-y-2 border-b p-3'>
          <div>
            <p className='text-muted-foreground text-xs'>Current activity</p>
            <p className='text-sm leading-5 text-pretty'>
              {activity ?? 'No activity summary is available.'}
            </p>
          </div>
          {run.error ? (
            <div
              role='alert'
              className='border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-2 text-xs leading-5'
            >
              {run.error}
            </div>
          ) : null}
        </div>

        <div className='flex min-h-0 flex-1 flex-col'>
          <div className='flex h-9 shrink-0 items-center border-b px-3'>
            <h3 className='text-xs font-semibold'>Run timeline</h3>
            <span className='text-muted-foreground ml-auto text-xs tabular-nums'>
              {timelineEvents.length} update
              {timelineEvents.length === 1 ? '' : 's'}
            </span>
          </div>
          <ScrollArea className='min-h-0 flex-1'>
            {timelineEvents.length === 0 ? (
              <div className='text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-2 px-6 text-center'>
                <CircleDashed
                  className='size-6 opacity-50'
                  aria-hidden='true'
                />
                <p className='text-sm font-medium'>No run events yet</p>
                <p className='max-w-xs text-xs leading-5 text-pretty'>
                  Tool calls, file changes, approvals, and progress updates will
                  appear here.
                </p>
              </div>
            ) : (
              <ol className='space-y-0.5 p-2'>
                {timelineEvents.map(event => {
                  const EventIcon = eventIcons[event.kind];
                  return (
                    <li
                      key={event.id}
                      className='hover:bg-muted/40 flex gap-2 rounded-md px-2 py-2'
                    >
                      <EventIcon
                        className={cn(
                          'text-muted-foreground mt-0.5 size-3.5 shrink-0',
                          event.kind === 'error' && 'text-destructive',
                          event.kind === 'permission' &&
                            'text-amber-700 dark:text-amber-400',
                        )}
                        aria-hidden='true'
                      />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-baseline gap-2'>
                          <p className='min-w-0 flex-1 truncate text-xs font-medium'>
                            {event.title}
                          </p>
                          <time className='text-muted-foreground shrink-0 text-[10px] tabular-nums'>
                            {new Date(event.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                        {event.body ? (
                          <p className='text-muted-foreground overflow-wrap-anywhere mt-0.5 text-xs leading-5 whitespace-pre-wrap'>
                            {event.body}
                          </p>
                        ) : null}
                        {event.kind === 'permission' &&
                        event.metadata?.options?.length &&
                        onRespondToPermission ? (
                          <div className='mt-2 flex flex-wrap items-center gap-1'>
                            {event.metadata.options.map(option => {
                              const pending = pendingOptionId === option.id;
                              const isDeny =
                                option.kind === 'deny' ||
                                option.kind === 'cancel';
                              return (
                                <Button
                                  key={option.id}
                                  type='button'
                                  variant={isDeny ? 'outline' : 'default'}
                                  size='sm'
                                  className={cn(
                                    'h-7 gap-1.5 px-2 text-xs',
                                    isDeny &&
                                      'text-destructive hover:text-destructive',
                                  )}
                                  disabled={pendingOptionId !== null}
                                  title={option.description}
                                  onClick={() => {
                                    setPendingOptionId(option.id);
                                    void Promise.resolve(
                                      onRespondToPermission(run.id, option.id),
                                    ).finally(() => setPendingOptionId(null));
                                  }}
                                >
                                  {pending ? (
                                    <BarsSpinner size={11} />
                                  ) : isDeny ? (
                                    <X
                                      className='size-3.5'
                                      aria-hidden='true'
                                    />
                                  ) : (
                                    <Check
                                      className='size-3.5'
                                      aria-hidden='true'
                                    />
                                  )}
                                  {option.label}
                                </Button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
