'use client';

import { useState } from 'react';
import { useCachedQuery, useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
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
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Monitor,
  Share2,
  Unlink,
  UserRoundPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { BarsSpinner } from '@/components/bars-spinner';
import { ProviderIcon } from './live-activity-section';
import { WorkSessionTerminal } from './work-session-terminal';

type LiveActivity = FunctionReturnType<
  typeof api.agentBridge.queries.listIssueLiveActivities
>[number];

// ── Status Badge ────────────────────────────────────────────────────────────

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

// ── Unified Live Activity Card ──────────────────────────────────────────────

export function LiveActivityCard({
  activity,
  orgSlug,
  currentUser,
}: {
  activity: LiveActivity;
  orgSlug: string;
  currentUser?: {
    _id: string;
    name: string;
    email: string | null;
    image: string | null;
  } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const updateStatus = useMutation(
    api.agentBridge.mutations.updateLiveActivityStatus,
  );
  const changeWorkflowState = useMutation(
    api.issues.mutations.changeWorkflowState,
  );
  const timeAgo = formatDistanceToNow(activity.lastEventAt, {
    addSuffix: true,
  });

  const isTerminal = [
    'completed',
    'failed',
    'canceled',
    'disconnected',
  ].includes(activity.status);

  // Fetch workspace options only for terminal sessions to find the "done" state
  const workspaceOptions = useCachedQuery(
    api.organizations.queries.getWorkspaceOptions,
    isTerminal ? { orgSlug } : 'skip',
  );
  const doneState = workspaceOptions?.issueStates?.find(
    (s: { type: string }) => s.type === 'done',
  );

  const isOwner = currentUser?._id === activity.ownerUserId;
  const canManageSession = activity.canManageSession ?? isOwner;
  const workSession = activity.workSession;
  const workspaceLabel =
    workSession?.repoRoot ??
    workSession?.workspacePath ??
    activity.workSession?.cwd ??
    activity.title;
  const workspaceName = workspaceLabel
    ? workspaceLabel.split('/').filter(Boolean).at(-1)
    : 'Session';
  const workSessionTitle =
    workSession?.title ??
    activity.title ??
    activity.latestSummary ??
    workspaceName;
  const sessionKindLabel = workSession?.agentProvider
    ? activity.providerLabel
    : 'Shell';

  const terminalSnapshot = workSession?.terminalSnapshot?.trim() ?? '';
  const showTerminal =
    terminalSnapshot.length > 0 || Boolean(workSession?.tmuxPaneId);

  const toggleExpanded = () => {
    setExpanded(current => !current);
  };

  const handleDetach = async () => {
    setDetaching(true);
    try {
      await updateStatus({
        liveActivityId: activity._id,
        status: 'canceled',
      });
      toast.success('Process detached from issue');
    } catch {
      toast.error('Failed to detach process');
    } finally {
      setDetaching(false);
    }
  };

  const handleMarkDone = async () => {
    if (!doneState || markingDone) return;
    setMarkingDone(true);
    try {
      await changeWorkflowState({
        issueId: activity.issueId,
        stateId: doneState._id,
      });
      toast.success('Issue marked as done');
    } catch {
      toast.error('Failed to mark issue as done');
    } finally {
      setMarkingDone(false);
    }
  };

  const cardContent = (
    <>
      {/* Row header */}
      <div
        className={cn(
          'group flex items-start gap-2.5',
          fullscreen
            ? 'border-b px-4 py-2'
            : 'hover:bg-muted/40 cursor-pointer rounded-md px-1.5 py-1.5 transition-colors',
        )}
        onClick={fullscreen ? undefined : toggleExpanded}
      >
        <ProviderIcon
          provider={workSession?.agentProvider ?? activity.provider}
          className='text-muted-foreground mt-0.5 size-3.5 shrink-0'
        />
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <span className='truncate text-sm font-medium'>
              {workSessionTitle}
            </span>
            <span className='bg-muted text-muted-foreground inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium'>
              {sessionKindLabel}
            </span>
            <StatusBadge status={activity.status} />
          </div>
          <div className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs'>
            <span className='truncate'>{workspaceName}</span>
            {workSession?.branch && (
              <>
                <span>&middot;</span>
                <span className='font-mono'>{workSession.branch}</span>
              </>
            )}
            <span>&middot;</span>
            <Monitor className='size-3 shrink-0' />
            <span className='truncate'>{activity.deviceName}</span>
            <span>&middot;</span>
            <span className='shrink-0'>{timeAgo}</span>
          </div>
        </div>
        <div
          className='flex shrink-0 items-center gap-2 pt-0.5'
          onClick={e => e.stopPropagation()}
        >
          {canManageSession && workSession && (
            <ShareWorkSessionPopover
              orgSlug={orgSlug}
              workSessionId={workSession._id}
              sharedMembers={workSession.sharedMembers ?? []}
              currentUserId={currentUser?._id}
            />
          )}
          {canManageSession && !isTerminal && (
            <button
              type='button'
              onClick={() => void handleDetach()}
              disabled={detaching}
              className='text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors disabled:opacity-50'
              title='Detach process'
              aria-label='Detach process'
            >
              {detaching ? (
                <BarsSpinner className='size-3.5' />
              ) : (
                <Unlink className='size-3.5' />
              )}
            </button>
          )}
          {expanded && showTerminal && (
            <button
              type='button'
              onClick={() => setFullscreen(f => !f)}
              className='text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors'
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? (
                <Minimize2 className='size-3.5' />
              ) : (
                <Maximize2 className='size-3.5' />
              )}
            </button>
          )}
          {!fullscreen && (
            <button
              type='button'
              onClick={toggleExpanded}
              className='text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors'
              aria-label={
                expanded ? 'Collapse work session' : 'Expand work session'
              }
            >
              {expanded ? (
                <ChevronUp className='size-3.5' />
              ) : (
                <ChevronDown className='size-3.5' />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: terminal view */}
      {expanded && showTerminal && (
        <div className={cn(fullscreen ? 'flex-1' : 'mt-1')}>
          <WorkSessionTerminal
            snapshot={terminalSnapshot}
            terminalUrl={workSession?.terminalUrl}
            terminalToken={workSession?.terminalToken}
            terminalLocalPort={workSession?.terminalLocalPort}
            workSessionId={workSession?._id}
            isTerminal={isTerminal}
            fullscreen={fullscreen}
          />
        </div>
      )}

      {expanded && !showTerminal && (
        <div className='text-muted-foreground mt-1 rounded-lg border py-6 text-center text-sm'>
          Terminal output will appear when the device syncs this pane.
        </div>
      )}

      {/* Terminal status + mark done for completed/failed sessions */}
      {expanded && isTerminal && !fullscreen && (
        <div className='mt-2 space-y-2'>
          <div className='text-muted-foreground flex items-center gap-3 text-xs'>
            <div className='bg-border h-px flex-1' />
            <span>Session {activity.status}</span>
            <div className='bg-border h-px flex-1' />
          </div>
          {doneState &&
            (activity.status === 'completed' ||
              activity.status === 'failed') && (
              <Button
                variant='outline'
                size='sm'
                className='h-7 w-full gap-1.5 text-xs'
                onClick={() => void handleMarkDone()}
                disabled={markingDone}
              >
                <CheckCircle2 className='size-3.5' />
                {markingDone ? 'Marking...' : 'Mark issue as done'}
              </Button>
            )}
        </div>
      )}
    </>
  );

  if (fullscreen) {
    return (
      <div className='bg-background fixed inset-0 z-50 flex flex-col'>
        {cardContent}
      </div>
    );
  }

  return <div className={cn(expanded && 'pb-2')}>{cardContent}</div>;
}

function ShareWorkSessionPopover({
  orgSlug,
  workSessionId,
  sharedMembers,
  currentUserId,
}: {
  orgSlug: string;
  workSessionId: Id<'workSessions'>;
  sharedMembers: Array<{
    userId: string;
    name: string;
    email?: string | null;
    image?: string | null;
    accessLevel: 'viewer' | 'controller';
  } | null>;
  currentUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  const members = useCachedQuery(
    api.organizations.queries.listMembers,
    open ? { orgSlug } : 'skip',
  );
  const shareMutation = useMutation(api.agentBridge.mutations.shareWorkSession);
  const revokeMutation = useMutation(
    api.agentBridge.mutations.revokeWorkSessionShare,
  );

  const resolvedSharedMembers = sharedMembers.filter(
    (
      member,
    ): member is {
      userId: string;
      name: string;
      email?: string | null;
      image?: string | null;
      accessLevel: 'viewer' | 'controller';
    } => Boolean(member),
  );

  const sharedUserIds = new Set(
    resolvedSharedMembers.map(member => member.userId),
  );

  // Filter out current user and already-shared users, limit to top 5
  const availableMembers = (members ?? [])
    .flatMap(member =>
      member.user &&
      !sharedUserIds.has(member.user._id) &&
      member.user._id !== currentUserId
        ? [{ ...member, user: member.user }]
        : [],
    )
    .slice(0, 5);

  const handleShare = async (
    userId: Id<'users'>,
    accessLevel: 'viewer' | 'controller',
  ) => {
    try {
      await shareMutation({ workSessionId, userId, accessLevel });
      toast.success('Session access updated');
    } catch {
      toast.error('Failed to update session sharing');
    }
  };

  const handleRevoke = async (userId: Id<'users'>) => {
    try {
      await revokeMutation({ workSessionId, userId });
      toast.success('Session access removed');
    } catch {
      toast.error('Failed to revoke session access');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='text-muted-foreground hover:text-foreground size-6'
        >
          <Share2 className='size-3.5' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0'>
        <Command>
          <CommandInput placeholder='Share with a teammate...' />
          <CommandList>
            <CommandEmpty>
              {members === undefined ? (
                <div className='space-y-2 p-2'>
                  <Skeleton className='h-8 w-full' />
                  <Skeleton className='h-8 w-full' />
                </div>
              ) : (
                'No members found'
              )}
            </CommandEmpty>
            {resolvedSharedMembers.length > 0 && (
              <CommandGroup heading='Shared'>
                {resolvedSharedMembers.map(member => (
                  <CommandItem
                    key={member.userId}
                    onSelect={() => handleRevoke(member.userId as Id<'users'>)}
                    className='gap-2'
                  >
                    <UserAvatar
                      name={member.name}
                      email={member.email ?? null}
                      image={member.image ?? null}
                      userId={member.userId}
                      size='sm'
                      className='size-5'
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-sm'>{member.name}</div>
                      <div className='text-muted-foreground text-xs'>
                        {member.accessLevel}
                      </div>
                    </div>
                    <span className='text-muted-foreground text-[11px]'>
                      Remove
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading='Teammates'>
              {availableMembers.map(member => (
                <CommandItem
                  key={member.user._id}
                  onSelect={() => handleShare(member.user._id, 'controller')}
                  className='gap-2'
                >
                  <UserAvatar
                    name={member.user.name}
                    email={member.user.email}
                    image={member.user.image}
                    userId={member.user._id}
                    size='sm'
                    className='size-5'
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='truncate text-sm'>
                      {member.user.name ?? member.user.email ?? 'Unknown'}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      Click to allow control
                    </div>
                  </div>
                  <UserRoundPlus className='text-muted-foreground size-3.5' />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
