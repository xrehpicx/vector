'use client';

import { useCachedQuery, useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { authClient } from '@/lib/auth-client';
import type { Id, Doc } from '@/convex/_generated/dataModel';
import { useEffect, useState } from 'react';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Monitor,
  Smartphone,
  Globe,
  Trash2,
  ShieldOff,
  Cpu,
  Terminal,
  FolderOpen,
  Plus,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BarsSpinner } from '@/components/bars-spinner';
import { useQuery } from '@/lib/convex';

// ── Types ───────────────────────────────────────────────────────────────────

interface BetterAuthSession {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseUserAgent(ua?: string): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };
  let browser = 'Browser';
  let os = 'Unknown';

  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('node') || ua.includes('Node')) browser = 'CLI';

  if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';

  return { browser, os };
}

function deviceIcon(platform?: string, ua?: string) {
  if (platform === 'darwin' || ua?.includes('Mac'))
    return <Monitor className='size-5' />;
  if (ua?.includes('iPhone') || ua?.includes('Android'))
    return <Smartphone className='size-5' />;
  return <Globe className='size-5' />;
}

const STATUS_COLORS: Record<string, string> = {
  online: 'text-green-600 dark:text-green-400',
  stale: 'text-yellow-600 dark:text-yellow-400',
  offline: 'text-muted-foreground',
};

// ── Device Row with Workspaces ───────────────────────────────────────────────

function DeviceRow({
  device,
  onRevoke,
  onRemove,
}: {
  device: Doc<'agentDevices'>;
  onRevoke: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const workspaces = useCachedQuery(
    api.agentBridge.queries.listDeviceWorkspaces,
    expanded ? { deviceId: device._id } : 'skip',
  );
  const addWorkspace = useMutation(api.agentBridge.mutations.upsertWorkspace);
  const removeWorkspace = useMutation(
    api.agentBridge.mutations.removeWorkspace,
  );
  const renameDevice = useMutation(api.agentBridge.mutations.renameDevice);

  const [addingWs, setAddingWs] = useState(false);
  const [wsPath, setWsPath] = useState('');
  const [wsLabel, setWsLabel] = useState('');

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(device.displayName);
  const [renaming, setRenaming] = useState(false);

  const handleRename = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === device.displayName) {
      setEditing(false);
      setEditName(device.displayName);
      return;
    }
    setRenaming(true);
    try {
      await renameDevice({ deviceId: device._id, displayName: trimmed });
      setEditing(false);
      toast.success('Device renamed');
    } catch {
      toast.error('Failed to rename device');
    } finally {
      setRenaming(false);
    }
  };

  const handleAddWorkspace = async () => {
    if (!wsPath.trim()) return;
    try {
      await addWorkspace({
        deviceId: device._id,
        path: wsPath.trim(),
        label: wsLabel.trim() || wsPath.trim().split('/').pop() || 'Workspace',
        isDefault: false,
        launchPolicy: 'allow_delegated',
      });
      setWsPath('');
      setWsLabel('');
      setAddingWs(false);
      toast.success('Workspace added');
    } catch {
      toast.error('Failed to add workspace');
    }
  };

  return (
    <div>
      <div className='flex items-center gap-3 px-4 py-3'>
        <div className='text-muted-foreground shrink-0'>
          {deviceIcon(device.platform)}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            {editing ? (
              <form
                className='flex items-center gap-1'
                onSubmit={e => {
                  e.preventDefault();
                  void handleRename();
                }}
              >
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className='h-6 w-40 text-sm font-medium'
                  autoFocus
                  disabled={renaming}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setEditing(false);
                      setEditName(device.displayName);
                    }
                  }}
                />
                <Button
                  type='submit'
                  variant='ghost'
                  size='sm'
                  className='h-6 px-1'
                  disabled={renaming}
                >
                  {renaming ? (
                    <BarsSpinner className='size-3' />
                  ) : (
                    <Check className='size-3' />
                  )}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='h-6 px-1'
                  disabled={renaming}
                  onClick={() => {
                    setEditing(false);
                    setEditName(device.displayName);
                  }}
                >
                  <X className='size-3' />
                </Button>
              </form>
            ) : (
              <button
                type='button'
                className='group flex items-center gap-1.5 text-sm font-medium'
                onClick={() => {
                  setEditName(device.displayName);
                  setEditing(true);
                }}
              >
                {device.displayName}
                <Pencil className='text-muted-foreground size-3 opacity-0 group-hover:opacity-100' />
              </button>
            )}
            <span
              className={cn(
                'text-xs capitalize',
                STATUS_COLORS[device.status] ?? STATUS_COLORS.offline,
              )}
            >
              {device.status}
            </span>
          </div>
          <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs'>
            {device.hostname && <span>{device.hostname}</span>}
            {device.platform && (
              <>
                <span>&middot;</span>
                <span>{device.platform}</span>
              </>
            )}
            <span>&middot;</span>
            <span>
              Last seen{' '}
              {formatDistanceToNow(device.lastSeenAt, { addSuffix: true })}
            </span>
          </div>
          {device.capabilities && device.capabilities.length > 0 && (
            <div className='mt-1 flex items-center gap-1'>
              {device.capabilities.map(cap => (
                <span
                  key={cap}
                  className='bg-muted text-muted-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]'
                >
                  {cap === 'codex' ? (
                    <Cpu className='size-2.5' />
                  ) : cap === 'claude_code' ? (
                    <Terminal className='size-2.5' />
                  ) : null}
                  {cap === 'claude_code' ? 'Claude' : cap}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground h-7 px-2 text-xs'
            onClick={() => setExpanded(!expanded)}
          >
            <FolderOpen className='mr-1 size-3' />
            Workspaces
            {expanded ? (
              <ChevronUp className='ml-1 size-3' />
            ) : (
              <ChevronDown className='ml-1 size-3' />
            )}
          </Button>
          {device.deviceSecret && (
            <Button
              variant='ghost'
              size='sm'
              className='text-muted-foreground hover:text-destructive h-7 gap-1 px-2 text-xs'
              onClick={onRevoke}
            >
              <ShieldOff className='size-3' />
            </Button>
          )}
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-destructive h-7 px-1.5'
            onClick={onRemove}
          >
            <Trash2 className='size-3' />
          </Button>
        </div>
      </div>

      {/* Expanded workspaces */}
      {expanded && (
        <div className='bg-muted/30 border-t px-4 py-2'>
          {workspaces === undefined ? (
            <Skeleton className='h-8 w-full rounded' />
          ) : (
            <div className='space-y-1'>
              {workspaces.map(ws => (
                <div
                  key={ws._id}
                  className='flex items-center gap-2 rounded px-2 py-1'
                >
                  <FolderOpen className='text-muted-foreground size-3.5 shrink-0 self-center' />
                  <span className='text-xs font-medium'>{ws.label}</span>
                  <span className='text-muted-foreground min-w-0 flex-1 truncate font-mono text-[10px]'>
                    {ws.path}
                  </span>
                  {ws.isDefault && (
                    <span className='text-muted-foreground text-[10px]'>
                      default
                    </span>
                  )}
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-muted-foreground hover:text-destructive h-5 px-1'
                    onClick={() =>
                      void removeWorkspace({ workspaceId: ws._id })
                    }
                  >
                    <Trash2 className='size-2.5' />
                  </Button>
                </div>
              ))}

              {workspaces.length === 0 && !addingWs && (
                <p className='text-muted-foreground py-1 text-xs'>
                  No workspaces configured.
                </p>
              )}

              {addingWs ? (
                <div className='space-y-1.5 pt-1'>
                  <Input
                    value={wsPath}
                    onChange={e => setWsPath(e.target.value)}
                    placeholder='/path/to/project'
                    className='h-7 font-mono text-xs'
                    autoFocus
                  />
                  <Input
                    value={wsLabel}
                    onChange={e => setWsLabel(e.target.value)}
                    placeholder={
                      wsPath.trim().split('/').pop() || 'Label (optional)'
                    }
                    className='h-7 text-xs'
                  />
                  <div className='flex items-center gap-1'>
                    <Button
                      size='sm'
                      className='h-6 text-xs'
                      disabled={!wsPath.trim()}
                      onClick={() => void handleAddWorkspace()}
                    >
                      Add
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='h-6 text-xs'
                      onClick={() => {
                        setAddingWs(false);
                        setWsPath('');
                        setWsLabel('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-muted-foreground h-6 gap-1 px-2 text-xs'
                  onClick={() => setAddingWs(true)}
                >
                  <Plus className='size-3' />
                  Add workspace
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DevicesPage() {
  const userQuery = useQuery(api.users.currentUser);
  const user = userQuery.data;
  const devices = useCachedQuery(api.agentBridge.queries.listMyDevices, {});
  const revokeDevice = useMutation(api.agentBridge.mutations.revokeDevice);
  const removeDevice = useMutation(api.agentBridge.mutations.removeDevice);

  const [sessions, setSessions] = useState<BetterAuthSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [currentSessionToken, setCurrentSessionToken] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!userQuery.isPending && user === null) {
      redirect('/auth/login');
    }
  }, [user, userQuery.isPending]);

  // Fetch Better Auth sessions
  useEffect(() => {
    async function fetchSessions() {
      try {
        const result = await authClient.listSessions();
        if (result.data) {
          setSessions(result.data as unknown as BetterAuthSession[]);
        }
        // Get current session
        const current = await authClient.getSession();
        if (current.data?.session) {
          setCurrentSessionToken(
            (current.data.session as unknown as BetterAuthSession).token,
          );
        }
      } catch {
        // Session listing might not be available
      } finally {
        setSessionsLoading(false);
      }
    }
    void fetchSessions();
  }, []);

  const handleRevokeSession = async (token: string) => {
    try {
      await authClient.revokeSession({ token });
      setSessions(prev => prev.filter(s => s.token !== token));
      toast.success('Session revoked');
    } catch {
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeDevice = async (deviceId: Id<'agentDevices'>) => {
    try {
      await revokeDevice({ deviceId });
      toast.success('Device token invalidated');
    } catch {
      toast.error('Failed to revoke device');
    }
  };

  const handleRemoveDevice = async (deviceId: Id<'agentDevices'>) => {
    if (!window.confirm('Remove this device? It will need to re-register.'))
      return;
    try {
      await removeDevice({ deviceId });
      toast.success('Device removed');
    } catch {
      toast.error('Failed to remove device');
    }
  };

  return (
    <div className='bg-background h-full'>
      {/* Header */}
      <div className='border-b'>
        <div className='flex items-center p-1 pl-8 lg:pl-1'>
          <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
            <Monitor className='size-3.5' />
            Devices & Sessions
          </span>
        </div>
      </div>

      <div className='mx-auto max-w-3xl space-y-6 p-4 sm:p-6'>
        {/* Bridge Devices */}
        <section>
          <h2 className='mb-1 text-sm font-medium'>Bridge Devices</h2>
          <p className='text-muted-foreground mb-3 text-xs'>
            Machines running the Vector bridge service. Each device can discover
            local agent processes and receive delegated work.
          </p>

          {devices === undefined ? (
            <div className='space-y-2'>
              <Skeleton className='h-16 w-full rounded-lg' />
              <Skeleton className='h-16 w-full rounded-lg' />
            </div>
          ) : devices.length === 0 ? (
            <div className='text-muted-foreground rounded-lg border px-4 py-6 text-center text-sm'>
              No devices registered.{' '}
              <code className='bg-muted rounded px-1 text-xs'>
                vcli service start
              </code>{' '}
              to connect this machine.
            </div>
          ) : (
            <div className='divide-y rounded-lg border'>
              {devices.map(device => (
                <DeviceRow
                  key={device._id}
                  device={device}
                  onRevoke={() => void handleRevokeDevice(device._id)}
                  onRemove={() => void handleRemoveDevice(device._id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Browser Sessions */}
        <section>
          <h2 className='mb-1 text-sm font-medium'>Active Sessions</h2>
          <p className='text-muted-foreground mb-3 text-xs'>
            Browser and CLI sessions signed into your account.
          </p>

          {sessionsLoading ? (
            <div className='space-y-2'>
              <Skeleton className='h-14 w-full rounded-lg' />
              <Skeleton className='h-14 w-full rounded-lg' />
            </div>
          ) : sessions.length === 0 ? (
            <div className='text-muted-foreground rounded-lg border px-4 py-6 text-center text-sm'>
              No active sessions found.
            </div>
          ) : (
            <div className='divide-y rounded-lg border'>
              {sessions.map(session => {
                const { browser, os } = parseUserAgent(session.userAgent);
                const isCurrent = session.token === currentSessionToken;

                return (
                  <div
                    key={session.id}
                    className='flex items-center gap-3 px-4 py-3'
                  >
                    <div className='text-muted-foreground shrink-0'>
                      {deviceIcon(undefined, session.userAgent)}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-2'>
                        <span className='text-sm font-medium'>
                          {browser} on {os}
                        </span>
                        {isCurrent && (
                          <span className='rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] leading-none font-medium text-green-700 dark:text-green-400'>
                            Current
                          </span>
                        )}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {session.ipAddress && (
                          <span>{session.ipAddress} &middot; </span>
                        )}
                        Created{' '}
                        {formatDistanceToNow(new Date(session.createdAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                    {!isCurrent && (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='text-muted-foreground hover:text-destructive h-7 gap-1 px-2 text-xs'
                        onClick={() => void handleRevokeSession(session.token)}
                      >
                        <ShieldOff className='size-3' />
                        Revoke
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
