'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Bot,
  Folder,
  HardDrive,
  MessageSquareText,
  MoreHorizontal,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PermissionAware } from '@/components/ui/permission-aware';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AgentAvatar,
  AgentLifecycleBadge,
  AgentOwnerLabel,
} from './agent-presence';
import { RegisteredAgentDialog } from './agent-form';
import {
  toCollaborationAgent,
  toCollaborationUser,
  type AgentListItem,
} from './adapters';
import type {
  AgentDeviceOption,
  AgentWorkspaceOption,
  RegisteredAgentFormValue,
} from './types';

const policyLabels = {
  owner_only: 'Owner only',
  selected_users: 'Selected people',
  channel_members: 'Channel members',
} as const;

function AgentsPageSkeleton() {
  return (
    <div className='flex h-[calc(100dvh-5rem)] min-h-[32rem] flex-col lg:h-[calc(100dvh-1rem)]'>
      <div className='flex h-11 items-center border-b px-3'>
        <Skeleton className='h-4 w-24' />
        <Skeleton className='ml-auto h-7 w-28' />
      </div>
      <div className='space-y-1 p-2'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-16 w-full rounded-lg' />
        ))}
      </div>
    </div>
  );
}

export function AgentManagementPage({ orgSlug }: { orgSlug: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const agentViews = useCachedQuery(api.collaboration.agents.list, {
    orgSlug,
    now,
    limit: 100,
  });
  const [retainedAgentViews, setRetainedAgentViews] = useState<AgentListItem[]>(
    [],
  );
  useEffect(() => {
    if (agentViews !== undefined) {
      setRetainedAgentViews(agentViews);
    }
  }, [agentViews]);
  const effectiveAgentViews = agentViews ?? retainedAgentViews;
  const devicesData = useCachedQuery(api.agentBridge.queries.listMyDevices, {});
  const workspacesData = useCachedQuery(
    api.agentBridge.queries.listAllMyWorkspaces,
    {},
  );
  const memberRows = useCachedQuery(api.organizations.queries.searchMembers, {
    orgSlug,
    limit: 100,
  });
  const currentUser = useCachedQuery(api.users.currentUser);
  const createAgent = useMutation(api.collaboration.agents.create);
  const updateAgent = useMutation(api.collaboration.agents.update);
  const removeAgent = useMutation(api.collaboration.agents.remove);
  const setAccessGrant = useMutation(api.collaboration.agents.setAccessGrant);
  const [confirm, ConfirmDialog] = useConfirm();

  if (
    devicesData === undefined ||
    workspacesData === undefined ||
    memberRows === undefined ||
    currentUser === undefined
  ) {
    return <AgentsPageSkeleton />;
  }

  const currentUserId = currentUser ? String(currentUser._id) : null;
  const agents = effectiveAgentViews.map(view =>
    toCollaborationAgent(view, currentUserId),
  );
  const members = memberRows
    .flatMap(row => (row.user ? [row.user] : []))
    .filter(user => String(user._id) !== currentUserId)
    .map(user => toCollaborationUser(user, currentUserId));
  const devices: AgentDeviceOption[] = devicesData.map(device => ({
    id: String(device._id),
    name: device.displayName,
    status: device.status === 'online' ? 'online' : 'offline',
    hostname: device.hostname,
    platform: device.platform,
  }));
  const workspaces: AgentWorkspaceOption[] = workspacesData
    .filter(workspace => workspace.launchPolicy === 'allow_delegated')
    .map(workspace => ({
      id: String(workspace._id),
      deviceId: String(workspace.deviceId),
      name: workspace.label,
      rootPath: workspace.path,
    }));

  const handleCreate = async (value: RegisteredAgentFormValue) => {
    const agentId = await createAgent({
      orgSlug,
      name: value.name,
      handle: value.handle,
      description: value.description || undefined,
      provider: value.provider === 'claude_code' ? 'claude_code' : 'codex',
      deviceId: value.deviceId as Id<'agentDevices'>,
      workspaceId: value.workspaceId as Id<'deviceWorkspaces'>,
      defaultFolder: value.defaultFolder,
      model: value.model || undefined,
      permissionMode: value.permissionMode,
      thinkingLevel:
        value.provider === 'codex' ? value.thinkingLevel : undefined,
      interactionPolicy: value.interactionPolicy,
    });
    if (value.interactionPolicy === 'selected_users') {
      await Promise.all(
        value.selectedUserIds.map(userId =>
          setAccessGrant({
            agentId,
            userId: userId as Id<'users'>,
            canInteract: true,
            canControl: false,
          }),
        ),
      );
    }
    toast.success(`${value.name} is registered.`);
  };

  const handleStatusChange = async (agentId: string, paused: boolean) => {
    try {
      await updateAgent({
        agentId: agentId as Id<'registeredAgents'>,
        lifecycleStatus: paused ? 'paused' : 'ready',
      });
    } catch {
      toast.error('Unable to update the agent.');
    }
  };

  const handleRemove = async (agentId: string, agentName: string) => {
    const confirmed = await confirm({
      title: `Remove ${agentName}?`,
      description:
        'This permanently removes the registration. Agents with message or run history cannot be removed.',
      confirmLabel: 'Remove agent',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await removeAgent({
        agentId: agentId as Id<'registeredAgents'>,
      });
      toast.success(`${agentName} was removed.`);
    } catch {
      toast.error(
        'This agent has collaboration history and cannot be removed. Pause it instead.',
      );
    }
  };

  return (
    <>
      <div className='flex h-[calc(100dvh-5rem)] min-h-[32rem] flex-col lg:h-[calc(100dvh-1rem)]'>
        <header className='flex min-h-11 shrink-0 items-center gap-2 border-b px-3'>
          <Bot className='text-muted-foreground size-3.5' aria-hidden='true' />
          <div className='min-w-0 flex-1'>
            <h1 className='truncate text-sm font-semibold'>Agents</h1>
            <p className='text-muted-foreground truncate text-[10px]'>
              Local coding agents your workspace can tag
            </p>
          </div>
          <Button
            render={<Link href='/settings/devices' />}
            nativeButton={false}
            variant='ghost'
            size='sm'
            className='hidden h-7 gap-1.5 px-2 text-xs sm:inline-flex'
          >
            <Settings2 className='size-3.5' aria-hidden='true' />
            Devices
          </Button>
          <PermissionAware
            orgSlug={orgSlug}
            permission='agent:create'
            fallbackMessage="You don't have permission to register agents."
          >
            <RegisteredAgentDialog
              devices={devices}
              workspaces={workspaces}
              members={members}
              onSubmit={handleCreate}
            />
          </PermissionAware>
        </header>

        <div className='bg-muted/15 flex min-h-8 shrink-0 items-center border-b px-3 text-[10px]'>
          <span className='text-muted-foreground'>
            Agents run through your registered devices. Offline agents remain
            available and reconnect automatically.
          </span>
        </div>

        <ScrollArea className='min-h-0 flex-1'>
          {agents.length === 0 ? (
            <div className='text-muted-foreground flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center'>
              <div className='bg-muted flex size-10 items-center justify-center rounded-lg'>
                <Bot className='size-5 opacity-50' aria-hidden='true' />
              </div>
              <div>
                <p className='text-foreground text-sm font-medium'>
                  Bring an agent into the workspace
                </p>
                <p className='mt-1 max-w-sm text-xs leading-5 text-pretty'>
                  Register a Codex or Claude Code connection, choose its working
                  folder, then add it to a channel.
                </p>
              </div>
              <PermissionAware
                orgSlug={orgSlug}
                permission='agent:create'
                fallbackMessage="You don't have permission to register agents."
              >
                <RegisteredAgentDialog
                  devices={devices}
                  workspaces={workspaces}
                  members={members}
                  onSubmit={handleCreate}
                />
              </PermissionAware>
            </div>
          ) : (
            <div className='p-2'>
              <div className='overflow-hidden rounded-lg border'>
                {agents.map(agent => (
                  <div
                    key={agent.id}
                    className='hover:bg-muted/30 group flex min-h-16 items-center gap-2 border-b px-2 py-2 last:border-b-0'
                  >
                    <AgentAvatar agent={agent} />
                    <div className='min-w-0 flex-1'>
                      <div className='flex min-w-0 items-center gap-1.5'>
                        <span className='truncate text-xs font-semibold'>
                          {agent.name}
                        </span>
                        <span className='text-muted-foreground truncate font-mono text-[10px]'>
                          @{agent.handle}
                        </span>
                        <AgentLifecycleBadge status={agent.lifecycleStatus} />
                      </div>
                      <div className='mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px]'>
                        <AgentOwnerLabel agent={agent} />
                        <span className='text-muted-foreground inline-flex min-w-0 items-center gap-1'>
                          <HardDrive className='size-3' aria-hidden='true' />
                          <span className='truncate'>
                            {agent.deviceName ?? 'Device unavailable'}
                          </span>
                        </span>
                        <span className='text-muted-foreground inline-flex min-w-0 items-center gap-1'>
                          <Folder className='size-3' aria-hidden='true' />
                          <span className='max-w-56 truncate font-mono'>
                            {agent.defaultFolder}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className='hidden shrink-0 items-center gap-1.5 lg:flex'>
                      <span className='text-muted-foreground inline-flex items-center gap-1 text-[10px]'>
                        {agent.interactionPolicy === 'owner_only' ? (
                          <ShieldCheck className='size-3' aria-hidden='true' />
                        ) : (
                          <Users className='size-3' aria-hidden='true' />
                        )}
                        {policyLabels[agent.interactionPolicy]}
                      </span>
                      <Button
                        render={<Link href={`/${orgSlug}/channels`} />}
                        nativeButton={false}
                        variant='outline'
                        size='sm'
                        className='h-7 gap-1 px-2 text-xs'
                      >
                        <MessageSquareText
                          className='size-3'
                          aria-hidden='true'
                        />
                        Add to channel
                      </Button>
                    </div>
                    {agent.canControl ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            className='size-7 shrink-0'
                            aria-label={`Agent actions for ${agent.name}`}
                          >
                            <MoreHorizontal
                              className='size-3.5'
                              aria-hidden='true'
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end' className='w-48'>
                          <DropdownMenuItem
                            onSelect={() =>
                              void handleStatusChange(
                                agent.id,
                                agent.lifecycleStatus !== 'paused',
                              )
                            }
                          >
                            {agent.lifecycleStatus === 'paused' ? (
                              <Play className='size-3.5' aria-hidden='true' />
                            ) : (
                              <Pause className='size-3.5' aria-hidden='true' />
                            )}
                            {agent.lifecycleStatus === 'paused'
                              ? 'Resume agent'
                              : 'Pause agent'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant='destructive'
                            onSelect={() =>
                              void handleRemove(agent.id, agent.name)
                            }
                          >
                            <Trash2 className='size-3.5' aria-hidden='true' />
                            Remove agent
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
      <ConfirmDialog />
    </>
  );
}
