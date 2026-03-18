'use client';

import { useState } from 'react';
import { useCachedQuery, useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Cpu,
  Monitor,
  Play,
  Plus,
  Send,
  Terminal,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { LiveActivityCard } from './live-activity-card';

type LiveActivity = FunctionReturnType<
  typeof api.agentBridge.queries.listIssueLiveActivities
>[number];

type DeviceWithProcesses = FunctionReturnType<
  typeof api.agentBridge.queries.listProcessesForAttach
>[number];

type DelegationTarget = FunctionReturnType<
  typeof api.agentBridge.queries.listDelegationTargets
>[number];

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  count,
  issueId,
}: {
  count: number;
  issueId: Id<'issues'>;
}) {
  return (
    <div className='flex items-center justify-between px-3 py-2'>
      <div className='flex items-center gap-2'>
        <Activity className='text-muted-foreground size-4' />
        <span className='text-muted-foreground text-sm font-medium'>
          Live Activity
        </span>
        {count > 0 && (
          <span className='bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium'>
            {count}
          </span>
        )}
      </div>
      <div className='flex items-center gap-1'>
        <AttachProcessButton issueId={issueId} />
        <DelegateRunButton issueId={issueId} />
      </div>
    </div>
  );
}

// ── Attach Process Button ───────────────────────────────────────────────────

function AttachProcessButton({ issueId }: { issueId: Id<'issues'> }) {
  const [open, setOpen] = useState(false);
  const devicesWithProcesses = useCachedQuery(
    api.agentBridge.queries.listProcessesForAttach,
    open ? {} : 'skip',
  );
  const attachMutation = useMutation(
    api.agentBridge.mutations.attachLiveActivity,
  );

  const handleAttach = async (
    deviceId: Id<'agentDevices'>,
    processId: Id<'agentProcesses'>,
    provider: 'codex' | 'claude_code' | 'vector_cli',
    title?: string,
  ) => {
    try {
      await attachMutation({
        issueId,
        deviceId,
        processId,
        provider,
        title,
      });
      setOpen(false);
      toast.success('Process attached to issue');
    } catch {
      toast.error('Failed to attach process');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='ghost' size='xs' className='h-6 gap-1 px-1.5'>
          <Plus className='size-3' />
          <span className='text-xs'>Attach</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-80 p-0' align='end'>
        <Command>
          <CommandInput placeholder='Search processes...' />
          <CommandList>
            <CommandEmpty>
              {devicesWithProcesses === undefined ? (
                <div className='space-y-2 p-2'>
                  <Skeleton className='h-8 w-full' />
                  <Skeleton className='h-8 w-full' />
                </div>
              ) : (
                <span className='text-muted-foreground text-sm'>
                  No running processes found
                </span>
              )}
            </CommandEmpty>
            {devicesWithProcesses?.map(({ device, processes }) => (
              <CommandGroup
                key={device._id}
                heading={
                  <div className='flex items-center gap-1.5'>
                    <Monitor className='size-3' />
                    <span>{device.displayName}</span>
                    <span className='text-muted-foreground/60 text-[10px]'>
                      {device.platform}
                    </span>
                  </div>
                }
              >
                {processes.map(process => (
                  <CommandItem
                    key={process._id}
                    onSelect={() =>
                      handleAttach(
                        device._id,
                        process._id,
                        process.provider,
                        process.title ?? process.cwd,
                      )
                    }
                    className='gap-2'
                  >
                    <ProviderIcon provider={process.provider} />
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-sm'>
                        {process.providerLabel}
                      </div>
                      <div className='text-muted-foreground truncate text-xs'>
                        {process.title ?? process.cwd ?? 'Unknown'}
                        {process.branch && (
                          <span className='ml-1 font-mono'>
                            ({process.branch})
                          </span>
                        )}
                      </div>
                    </div>
                    <ModeBadge mode={process.mode} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Delegate Run Button ─────────────────────────────────────────────────────

function DelegateRunButton({ issueId }: { issueId: Id<'issues'> }) {
  const [open, setOpen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] =
    useState<Id<'agentDevices'> | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<
    'codex' | 'claude_code' | null
  >(null);

  const targets = useCachedQuery(
    api.agentBridge.queries.listDelegationTargets,
    open ? {} : 'skip',
  );
  const delegateMutation = useMutation(api.agentBridge.mutations.delegateIssue);

  const selectedTarget = targets?.find(t => t.device._id === selectedDeviceId);

  const handleDelegate = async (workspaceId: Id<'deviceWorkspaces'>) => {
    if (!selectedDeviceId || !selectedProvider) return;
    try {
      await delegateMutation({
        issueId,
        deviceId: selectedDeviceId,
        workspaceId,
        provider: selectedProvider,
      });
      setOpen(false);
      setSelectedDeviceId(null);
      setSelectedProvider(null);
      toast.success('Issue delegated successfully');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delegate issue';
      toast.error(msg);
    }
  };

  const reset = () => {
    setSelectedDeviceId(null);
    setSelectedProvider(null);
  };

  return (
    <Popover
      open={open}
      onOpenChange={v => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant='ghost' size='xs' className='h-6 gap-1 px-1.5'>
          <Play className='size-3' />
          <span className='text-xs'>Run on device</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-80 p-0' align='end'>
        {!selectedDeviceId ? (
          // Step 1: Pick device
          <Command>
            <CommandInput placeholder='Select device...' />
            <CommandList>
              <CommandEmpty>
                {targets === undefined ? (
                  <div className='space-y-2 p-2'>
                    <Skeleton className='h-8 w-full' />
                    <Skeleton className='h-8 w-full' />
                  </div>
                ) : (
                  <span className='text-muted-foreground text-sm'>
                    No online devices with workspaces
                  </span>
                )}
              </CommandEmpty>
              <CommandGroup heading='Online devices'>
                {targets?.map(({ device, workspaces }) => (
                  <CommandItem
                    key={device._id}
                    disabled={workspaces.length === 0}
                    onSelect={() => setSelectedDeviceId(device._id)}
                    className='gap-2'
                  >
                    <Monitor className='size-4' />
                    <div className='min-w-0 flex-1'>
                      <div className='text-sm'>{device.displayName}</div>
                      <div className='text-muted-foreground text-xs'>
                        {device.platform ?? 'unknown'} &middot;{' '}
                        {workspaces.length} workspace
                        {workspaces.length !== 1 && 's'}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : !selectedProvider ? (
          // Step 2: Pick agent
          <Command>
            <div className='flex items-center gap-2 border-b px-3 py-2'>
              <Button
                variant='ghost'
                size='xs'
                className='h-5 px-1'
                onClick={reset}
              >
                &larr;
              </Button>
              <span className='text-sm font-medium'>
                {selectedTarget?.device.displayName}
              </span>
            </div>
            <CommandList>
              <CommandGroup heading='Select agent'>
                <CommandItem
                  onSelect={() => setSelectedProvider('codex')}
                  className='gap-2'
                >
                  <Cpu className='size-4' />
                  <span>Codex</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => setSelectedProvider('claude_code')}
                  className='gap-2'
                >
                  <Terminal className='size-4' />
                  <span>Claude</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          // Step 3: Pick workspace
          <Command>
            <div className='flex items-center gap-2 border-b px-3 py-2'>
              <Button
                variant='ghost'
                size='xs'
                className='h-5 px-1'
                onClick={() => setSelectedProvider(null)}
              >
                &larr;
              </Button>
              <span className='text-sm font-medium'>
                {selectedTarget?.device.displayName} &middot;{' '}
                {selectedProvider === 'codex' ? 'Codex' : 'Claude'}
              </span>
            </div>
            <CommandList>
              <CommandGroup heading='Select workspace'>
                {selectedTarget?.workspaces.map(ws => (
                  <CommandItem
                    key={ws._id}
                    onSelect={() => handleDelegate(ws._id)}
                    className='gap-2'
                  >
                    <div className='min-w-0 flex-1'>
                      <div className='text-sm'>{ws.label}</div>
                      <div className='text-muted-foreground truncate font-mono text-xs'>
                        {ws.path}
                      </div>
                    </div>
                  </CommandItem>
                ))}
                {selectedTarget?.workspaces.length === 0 && (
                  <div className='text-muted-foreground p-3 text-center text-sm'>
                    No workspaces configured for delegation
                  </div>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Provider Icon ───────────────────────────────────────────────────────────

export function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  switch (provider) {
    case 'codex':
      return <Cpu className={cn('size-4', className)} />;
    case 'claude_code':
      return <Terminal className={cn('size-4', className)} />;
    default:
      return <Activity className={cn('size-4', className)} />;
  }
}

// ── Mode Badge ──────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium',
        mode === 'managed'
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {mode === 'managed' ? 'Managed' : 'Observed'}
    </span>
  );
}

// ── Main Section ────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'canceled',
  'disconnected',
]);

export function IssueLiveActivitySection({
  issueId,
  currentUser,
}: {
  issueId: Id<'issues'>;
  currentUser?: {
    _id: string;
    name: string;
    email: string | null;
    image: string | null;
  } | null;
}) {
  const activities = useCachedQuery(
    api.agentBridge.queries.listIssueLiveActivities,
    { issueId },
  );

  const [showOld, setShowOld] = useState(false);

  const activeActivities =
    activities?.filter(a => !TERMINAL_STATUSES.has(a.status)) ?? [];
  const oldActivities =
    activities?.filter(a => TERMINAL_STATUSES.has(a.status)) ?? [];
  const activeCount = activeActivities.length;

  // Don't render section at all if no activities and loading is done
  if (activities !== undefined && activities.length === 0) {
    // Still show the header with attach/delegate buttons
    return (
      <div className='border-t'>
        <SectionHeader count={0} issueId={issueId} />
      </div>
    );
  }

  return (
    <div className='border-t'>
      <SectionHeader count={activeCount} issueId={issueId} />

      {/* Loading skeleton */}
      {activities === undefined && (
        <div className='space-y-1 px-3 pb-2'>
          <Skeleton className='h-14 w-full rounded-md' />
        </div>
      )}

      {/* Active activity cards */}
      {activeActivities.length > 0 && (
        <div className='space-y-2 px-3 pb-2'>
          {activeActivities.map(activity => (
            <LiveActivityCard
              key={activity._id}
              activity={activity}
              currentUser={currentUser}
            />
          ))}
        </div>
      )}

      {/* Old/disconnected activities — collapsed by default */}
      {oldActivities.length > 0 && (
        <div className='px-3 pb-2'>
          <button
            type='button'
            onClick={() => setShowOld(!showOld)}
            className='text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 py-1 text-xs transition-colors'
          >
            {showOld ? (
              <ChevronUp className='size-3' />
            ) : (
              <ChevronDown className='size-3' />
            )}
            {oldActivities.length} past session
            {oldActivities.length !== 1 && 's'}
          </button>
          {showOld && (
            <div className='mt-1 space-y-2'>
              {oldActivities.map(activity => (
                <LiveActivityCard
                  key={activity._id}
                  activity={activity}
                  currentUser={currentUser}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
