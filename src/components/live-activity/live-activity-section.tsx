'use client';

import { useState } from 'react';
import { useCachedQuery, useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Copy,
  Cpu,
  FolderOpen,
  Monitor,
  Play,
  Plus,
  Terminal,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from 'sonner';
import { LiveActivityCard } from './live-activity-card';

type DelegationWorkspace = {
  _id: Id<'deviceWorkspaces'>;
  label: string;
  path: string;
};

type DelegationDevice = {
  _id: Id<'agentDevices'>;
  displayName: string;
  platform?: string;
};

type DelegationTarget = {
  device: DelegationDevice;
  workspaces: DelegationWorkspace[];
};

// ── No Devices Setup Guide ──────────────────────────────────────────────────

export function DeviceSetupGuide({ compact }: { compact?: boolean } = {}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyCommand = (cmd: string) => {
    void navigator.clipboard.writeText(cmd);
    setCopied(cmd);
    setTimeout(() => setCopied(null), 2000);
  };

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.protocol === 'https:'
        ? window.location.hostname
        : window.location.origin
      : '';

  const steps = [
    { label: 'Install the CLI', cmd: 'npm install -g @rehpic/vcli' },
    { label: 'Log in', cmd: `vcli auth login --app-url ${appUrl}` },
    { label: 'Install the bridge', cmd: 'vcli service install' },
  ];

  return (
    <div className={compact ? 'p-3' : 'p-4'}>
      <div className='mb-3'>
        <div className='text-sm font-medium'>Connect a device</div>
        <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
          Install the Vector CLI on the machine where you want to run work
          sessions. The bridge connects your device to Vector so you can launch
          agents and shells remotely.
        </p>
      </div>
      <div className='space-y-2'>
        {steps.map((step, i) => (
          <div key={step.cmd}>
            <div className='text-muted-foreground mb-1 text-[11px] font-medium'>
              {i + 1}. {step.label}
            </div>
            <button
              type='button'
              onClick={() => copyCommand(step.cmd)}
              className='bg-muted/50 hover:bg-muted group flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left font-mono text-xs transition-colors'
            >
              <span className='text-foreground flex-1'>{step.cmd}</span>
              <Copy
                className={cn(
                  'size-3 shrink-0 transition-colors',
                  copied === step.cmd
                    ? 'text-green-500'
                    : 'text-muted-foreground opacity-0 group-hover:opacity-100',
                )}
              />
            </button>
          </div>
        ))}
      </div>
      {!compact && (
        <p className='text-muted-foreground mt-3 text-[11px]'>
          Once the bridge is running, your device will appear here
          automatically.
        </p>
      )}
    </div>
  );
}

function NoDevicesGuide() {
  return <DeviceSetupGuide compact />;
}

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  count,
  issueId,
}: {
  count: number;
  issueId: Id<'issues'>;
}) {
  return (
    <div className='mb-3 flex items-center justify-between'>
      <div className='flex items-center gap-2'>
        <h2 className='text-sm font-semibold'>Work Sessions</h2>
        {count > 0 && (
          <span className='bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium'>
            {count}
          </span>
        )}
      </div>
      <div className='flex items-center gap-1'>
        <AttachProcessPopover issueId={issueId} />
        <DelegateRunPopover issueId={issueId} />
      </div>
    </div>
  );
}

// ── Attach Process Button ───────────────────────────────────────────────────

export function AttachProcessPopover({
  issueId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
}: {
  issueId: Id<'issues'>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
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
        {children ?? (
          <Button variant='ghost' size='xs' className='h-6 gap-1 px-1.5'>
            <Plus className='size-3' />
            <span className='text-xs'>Attach Session</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className='w-80 p-0' align='end'>
        {devicesWithProcesses !== undefined &&
        devicesWithProcesses.length === 0 ? (
          <NoDevicesGuide />
        ) : (
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
                    No attachable sessions found
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
                      value={[
                        process.providerLabel ?? '',
                        process.title ?? '',
                        process.cwd ?? '',
                        process.repoRoot ?? '',
                        process.branch ?? '',
                        process.mode,
                      ]
                        .filter(Boolean)
                        .join(' ')}
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
                        <div className='truncate text-sm font-medium'>
                          {process.title?.trim() ||
                            process.cwd?.split('/').pop() ||
                            process.providerLabel}
                        </div>
                        <div className='text-muted-foreground truncate text-xs'>
                          {process.providerLabel}
                          {(process.cwd || process.branch) && ' · '}
                          {process.cwd ?? process.repoRoot ?? 'Unknown'}
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
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Delegate Run Button ─────────────────────────────────────────────────────

export function DelegateRunPopover({
  issueId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
}: {
  issueId: Id<'issues'>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [selectedDeviceId, setSelectedDeviceId] =
    useState<Id<'agentDevices'> | null>(null);
  const [selectedLaunchMode, setSelectedLaunchMode] = useState<
    'codex' | 'claude_code' | 'manual' | null
  >(null);
  const [workspaceDialogTarget, setWorkspaceDialogTarget] =
    useState<DelegationTarget | null>(null);
  const [delegating, setDelegating] = useState(false);

  const targets = useCachedQuery(
    api.agentBridge.queries.listDelegationTargets,
    open ? {} : 'skip',
  );
  const delegateMutation = useMutation(api.agentBridge.mutations.delegateIssue);

  const selectedTarget = targets?.find(t => t.device._id === selectedDeviceId);

  const handleDelegate = async (workspaceId: Id<'deviceWorkspaces'>) => {
    if (!selectedDeviceId || !selectedLaunchMode || delegating) return;
    const provider =
      selectedLaunchMode === 'manual' ? undefined : selectedLaunchMode;
    setDelegating(true);
    try {
      await delegateMutation({
        issueId,
        deviceId: selectedDeviceId,
        workspaceId,
        ...(provider ? { provider } : {}),
      });
      setOpen(false);
      setSelectedDeviceId(null);
      setSelectedLaunchMode(null);
      toast.success(
        provider
          ? 'Work session started on device'
          : 'Shell session started on device',
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delegate issue';
      toast.error(msg);
    } finally {
      setDelegating(false);
    }
  };

  const reset = () => {
    setSelectedDeviceId(null);
    setSelectedLaunchMode(null);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={v => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <PopoverTrigger asChild>
          {children ?? (
            <Button variant='ghost' size='xs' className='h-6 gap-1 px-1.5'>
              <Play className='size-3' />
              <span className='text-xs'>New Session</span>
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className='w-80 p-0' align='end'>
          {targets !== undefined && targets.length === 0 ? (
            <NoDevicesGuide />
          ) : !selectedDeviceId ? (
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
                      No online devices available
                    </span>
                  )}
                </CommandEmpty>
                <CommandGroup heading='Online devices'>
                  {targets?.map(({ device, workspaces }) => (
                    <CommandItem
                      key={device._id}
                      value={[
                        device.displayName,
                        device.platform ?? '',
                        ...workspaces.map(workspace => workspace.label),
                        ...workspaces.map(workspace => workspace.path),
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onSelect={() => {
                        if (workspaces.length === 0) {
                          setWorkspaceDialogTarget({ device, workspaces });
                          setOpen(false);
                          return;
                        }
                        setSelectedDeviceId(device._id);
                      }}
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
          ) : !selectedLaunchMode ? (
            // Step 2: Pick session type
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
                <CommandGroup heading='Select session type'>
                  <CommandItem
                    onSelect={() => setSelectedLaunchMode('codex')}
                    className='gap-2'
                  >
                    <Cpu className='size-4' />
                    <div className='min-w-0 flex-1'>
                      <div className='text-sm'>Codex</div>
                      <div className='text-muted-foreground text-xs'>
                        Open a managed Codex work session in tmux
                      </div>
                    </div>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => setSelectedLaunchMode('claude_code')}
                    className='gap-2'
                  >
                    <Terminal className='size-4' />
                    <div className='min-w-0 flex-1'>
                      <div className='text-sm'>Claude</div>
                      <div className='text-muted-foreground text-xs'>
                        Open a managed Claude work session in tmux
                      </div>
                    </div>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => setSelectedLaunchMode('manual')}
                    className='gap-2'
                  >
                    <CircleDot className='size-4' />
                    <div className='min-w-0 flex-1'>
                      <div className='text-sm'>Manual shell</div>
                      <div className='text-muted-foreground text-xs'>
                        Start a plain tmux shell tied to this issue
                      </div>
                    </div>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          ) : (
            // Step 3: Pick workspace (or add one)
            <WorkspacePickerStep
              device={selectedTarget?.device}
              workspaces={selectedTarget?.workspaces ?? []}
              providerLabel={
                selectedLaunchMode === 'codex'
                  ? 'Codex'
                  : selectedLaunchMode === 'claude_code'
                    ? 'Claude'
                    : 'Manual shell'
              }
              onBack={() => setSelectedLaunchMode(null)}
              onSelect={handleDelegate}
              loading={delegating}
            />
          )}
        </PopoverContent>
      </Popover>

      <WorkspaceConfigDialog
        device={workspaceDialogTarget?.device}
        open={workspaceDialogTarget !== null}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            setWorkspaceDialogTarget(null);
          }
        }}
        onConfigured={() => {
          if (!workspaceDialogTarget) {
            return;
          }
          setSelectedDeviceId(workspaceDialogTarget.device._id);
          setWorkspaceDialogTarget(null);
          setOpen(true);
        }}
      />
    </>
  );
}

// ── Workspace Picker Step ────────────────────────────────────────────────────

function WorkspacePickerStep({
  device,
  workspaces,
  providerLabel,
  onBack,
  onSelect,
  loading,
}: {
  device?: { _id: Id<'agentDevices'>; displayName: string };
  workspaces: Array<{
    _id: Id<'deviceWorkspaces'>;
    label: string;
    path: string;
  }>;
  providerLabel: string;
  onBack: () => void;
  onSelect: (workspaceId: Id<'deviceWorkspaces'>) => void;
  loading?: boolean;
}) {
  const [showAddForm, setShowAddForm] = useState(workspaces.length === 0);
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [adding, setAdding] = useState(false);

  const addWorkspace = useMutation(api.agentBridge.mutations.upsertWorkspace);

  const handleAdd = async () => {
    if (!device || !newPath.trim()) return;
    setAdding(true);
    try {
      const wsId = await addWorkspace({
        deviceId: device._id,
        label:
          newLabel.trim() || newPath.trim().split('/').pop() || 'Workspace',
        path: newPath.trim(),
        isDefault: workspaces.length === 0,
        launchPolicy: 'allow_delegated',
      });
      // Auto-select the newly created workspace
      onSelect(wsId);
    } catch {
      toast.error('Failed to add workspace');
    } finally {
      setAdding(false);
    }
  };

  if (showAddForm) {
    return (
      <div className='p-3'>
        <div className='flex items-center gap-2 pb-3'>
          <Button
            variant='ghost'
            size='xs'
            className='h-5 px-1'
            onClick={() =>
              workspaces.length > 0 ? setShowAddForm(false) : onBack()
            }
          >
            &larr;
          </Button>
          <span className='text-sm font-medium'>Add workspace</span>
        </div>
        <div className='space-y-2'>
          <div>
            <label className='text-muted-foreground mb-1 block text-xs'>
              Path
            </label>
            <Input
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder='/Users/you/projects/my-repo'
              className='h-8 font-mono text-xs'
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
            />
          </div>
          <div>
            <label className='text-muted-foreground mb-1 block text-xs'>
              Label (optional)
            </label>
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder={newPath.trim().split('/').pop() || 'My project'}
              className='h-8 text-xs'
            />
          </div>
          <Button
            size='sm'
            className='h-7 w-full text-xs'
            disabled={adding || !newPath.trim()}
            onClick={() => void handleAdd()}
          >
            {adding ? 'Adding...' : 'Add and run'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Command>
      <div className='flex items-center gap-2 border-b px-3 py-2'>
        <Button
          variant='ghost'
          size='xs'
          className='h-5 px-1'
          onClick={onBack}
          disabled={loading}
        >
          &larr;
        </Button>
        <span className='text-sm font-medium'>
          {device?.displayName} &middot; {providerLabel}
        </span>
        {loading && (
          <span className='text-muted-foreground ml-auto text-xs'>
            Starting...
          </span>
        )}
      </div>
      <CommandList>
        <CommandGroup heading='Select workspace'>
          {workspaces.map(ws => (
            <CommandItem
              key={ws._id}
              onSelect={() => !loading && onSelect(ws._id)}
              className={cn(
                'gap-2',
                loading && 'pointer-events-none opacity-50',
              )}
              disabled={loading}
            >
              <FolderOpen className='text-muted-foreground size-4 shrink-0' />
              <div className='min-w-0 flex-1'>
                <div className='text-sm'>{ws.label}</div>
                <div className='text-muted-foreground truncate font-mono text-xs'>
                  {ws.path}
                </div>
              </div>
            </CommandItem>
          ))}
          {!loading && (
            <CommandItem
              value='add-workspace'
              onSelect={() => setShowAddForm(true)}
              className='gap-2'
            >
              <Plus className='text-muted-foreground size-4 shrink-0' />
              <span className='text-muted-foreground text-sm'>
                Add workspace...
              </span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function WorkspaceConfigDialog({
  device,
  open,
  onOpenChange,
  onConfigured,
}: {
  device?: DelegationDevice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigured: () => void;
}) {
  const existingWorkspaces = useCachedQuery(
    api.agentBridge.queries.listDeviceWorkspaces,
    open && device ? { deviceId: device._id } : 'skip',
  );
  const addWorkspace = useMutation(api.agentBridge.mutations.upsertWorkspace);

  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!device || !newPath.trim()) return;
    setAdding(true);
    try {
      await addWorkspace({
        deviceId: device._id,
        label:
          newLabel.trim() || newPath.trim().split('/').pop() || 'Workspace',
        path: newPath.trim(),
        isDefault: (existingWorkspaces?.length ?? 0) === 0,
        launchPolicy: 'allow_delegated',
      });
      toast.success('Workspace added');
      setNewLabel('');
      setNewPath('');
      onConfigured();
    } catch {
      toast.error('Failed to add workspace');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className='gap-3 p-3 sm:max-w-md'>
        <DialogHeader className='gap-1'>
          <DialogTitle className='text-sm font-semibold'>
            Configure workspaces
          </DialogTitle>
          <DialogDescription className='text-xs'>
            {device
              ? `Add at least one workspace for ${device.displayName} before starting a new session.`
              : 'Add a workspace for this device before starting a new session.'}
          </DialogDescription>
        </DialogHeader>

        {existingWorkspaces === undefined ? (
          <div className='space-y-2'>
            <Skeleton className='h-8 w-full rounded-md' />
            <Skeleton className='h-8 w-full rounded-md' />
          </div>
        ) : existingWorkspaces.length > 0 ? (
          <div className='space-y-1 rounded-lg border p-2'>
            {existingWorkspaces.map(workspace => (
              <div
                key={workspace._id}
                className='flex items-center gap-2 rounded-md px-2 py-1.5'
              >
                <FolderOpen className='text-muted-foreground size-3.5 shrink-0' />
                <div className='min-w-0 flex-1'>
                  <div className='truncate text-xs font-medium'>
                    {workspace.label}
                  </div>
                  <div className='text-muted-foreground truncate font-mono text-[11px]'>
                    {workspace.path}
                  </div>
                </div>
                {workspace.isDefault && (
                  <span className='bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium'>
                    Default
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className='space-y-2'>
          <div className='space-y-1'>
            <label className='text-muted-foreground block text-[11px] font-medium'>
              Workspace path
            </label>
            <Input
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder='/Users/you/projects/my-repo'
              className='h-8 font-mono text-xs'
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
            />
          </div>

          <div className='space-y-1'>
            <label className='text-muted-foreground block text-[11px] font-medium'>
              Workspace label
            </label>
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder={newPath.trim().split('/').pop() || 'My project'}
              className='h-8 text-xs'
            />
          </div>
        </div>

        <DialogFooter className='-mx-3 -mb-3 px-3 py-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size='sm'
            disabled={adding || !newPath.trim()}
            onClick={() => void handleAdd()}
          >
            {adding ? 'Adding...' : 'Add workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  orgSlug,
  issueId,
  currentUser,
}: {
  orgSlug: string;
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

  return (
    <div>
      <SectionHeader count={activeCount} issueId={issueId} />

      {/* Loading skeleton */}
      {activities === undefined && (
        <div className='space-y-1'>
          <Skeleton className='h-14 w-full rounded-md' />
        </div>
      )}

      {activities !== undefined && activities.length === 0 && (
        <p className='text-muted-foreground py-2 text-sm'>
          No work sessions yet.
        </p>
      )}

      {/* Active activity cards */}
      {activeActivities.length > 0 && (
        <div className='space-y-1'>
          {activeActivities.map(activity => (
            <LiveActivityCard
              key={activity._id}
              activity={activity}
              orgSlug={orgSlug}
              currentUser={currentUser}
            />
          ))}
        </div>
      )}

      {/* Old/disconnected activities — collapsed by default */}
      {oldActivities.length > 0 && (
        <div>
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
            <div className='mt-1 space-y-1'>
              {oldActivities.map(activity => (
                <LiveActivityCard
                  key={activity._id}
                  activity={activity}
                  orgSlug={orgSlug}
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
