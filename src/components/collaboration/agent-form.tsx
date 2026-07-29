'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Check,
  ChevronDown,
  Folder,
  HardDrive,
  LockKeyhole,
  Network,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
} from 'lucide-react';
import { BarsSpinner } from '@/components/bars-spinner';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  AgentDeviceOption,
  AgentInteractionPolicy,
  AgentWorkspaceOption,
  CollaborationAgent,
  CollaborationUser,
  RegisteredAgentFormValue,
} from './types';

const providers = [
  {
    value: 'codex',
    label: 'Codex',
    description: 'Connect an OpenAI Codex coding session through ACP.',
  },
  {
    value: 'claude_code',
    label: 'Claude Code',
    description: 'Connect an Anthropic Claude Code session through ACP.',
  },
] as const;

const permissionModes = [
  {
    value: 'ask',
    label: 'Ask before risky actions',
    description: 'The agent pauses for approval before risky commands.',
    icon: ShieldCheck,
  },
  {
    value: 'plan',
    label: 'Plan only',
    description:
      'The agent can inspect and propose work without changing files.',
    icon: LockKeyhole,
  },
] as const;

const interactionPolicies: ReadonlyArray<{
  value: AgentInteractionPolicy;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    value: 'owner_only',
    label: 'Owner only',
    description: 'Only the owner can tag or control this agent.',
    icon: LockKeyhole,
  },
  {
    value: 'selected_users',
    label: 'Selected people',
    description: 'Only the owner and selected workspace members can interact.',
    icon: Users,
  },
  {
    value: 'channel_members',
    label: 'Channel members',
    description: 'Anyone in a channel containing the agent can interact.',
    icon: Network,
  },
];

const codexThinkingLevels = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
  { value: 'xhigh', label: 'Extra high' },
] as const;

const EMPTY_FORM: RegisteredAgentFormValue = {
  name: '',
  handle: '',
  description: '',
  provider: 'codex',
  deviceId: '',
  workspaceId: '',
  defaultFolder: '',
  model: '',
  permissionMode: 'ask',
  thinkingLevel: 'medium',
  interactionPolicy: 'owner_only',
  selectedUserIds: [],
};

function SelectField<T extends string>({
  label,
  value,
  items,
  onChange,
  placeholder,
  searchPlaceholder,
  disabled,
}: {
  label: string;
  value: T;
  items: ReadonlyArray<{
    value: T;
    label: string;
    description?: string;
    disabled?: boolean;
  }>;
  onChange: (value: T) => void;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find(item => item.value === value);

  return (
    <div className='space-y-1'>
      <span className='text-xs font-medium'>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            className='h-9 w-full justify-start gap-2 px-2 text-sm font-normal'
            disabled={disabled}
          >
            <span className='min-w-0 flex-1 truncate text-start'>
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown
              className='text-muted-foreground size-3.5 shrink-0'
              aria-hidden='true'
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-72 p-0'>
          <Command>
            <CommandInput placeholder={searchPlaceholder} className='h-9' />
            <CommandList>
              <CommandEmpty>No options match this search.</CommandEmpty>
              <CommandGroup>
                {items.map(item => (
                  <CommandItem
                    key={item.value}
                    value={`${item.label} ${item.description ?? ''}`}
                    disabled={item.disabled}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm font-medium'>
                        {item.label}
                      </span>
                      {item.description ? (
                        <span className='text-muted-foreground block text-xs leading-4 text-pretty'>
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    <Check
                      className={cn(
                        'size-4',
                        item.value === value ? 'opacity-100' : 'opacity-0',
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
    </div>
  );
}

export function RegisteredAgentDialog({
  devices,
  workspaces,
  members,
  agent,
  onSubmit,
  trigger,
}: {
  devices: AgentDeviceOption[];
  workspaces: AgentWorkspaceOption[];
  members: CollaborationUser[];
  agent?: CollaborationAgent | null;
  onSubmit: (value: RegisteredAgentFormValue) => Promise<void> | void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RegisteredAgentFormValue>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeForm = () => {
    const matchingWorkspace = workspaces.find(
      workspace => workspace.name === agent?.workspaceName,
    );
    const matchingDevice = devices.find(
      device => device.name === agent?.deviceName,
    );
    setForm(
      agent
        ? {
            name: agent.name,
            handle: agent.handle,
            description: agent.description ?? '',
            provider: agent.provider,
            deviceId: matchingDevice?.id ?? '',
            workspaceId: matchingWorkspace?.id ?? '',
            defaultFolder: agent.defaultFolder ?? '',
            model: agent.model ?? '',
            permissionMode: agent.permissionMode ?? 'ask',
            thinkingLevel: agent.thinkingLevel ?? 'medium',
            interactionPolicy: agent.interactionPolicy,
            selectedUserIds: [],
          }
        : EMPTY_FORM,
    );
    setError(null);
  };

  const deviceWorkspaces = useMemo(
    () => workspaces.filter(workspace => workspace.deviceId === form.deviceId),
    [form.deviceId, workspaces],
  );
  const selectedWorkspace = deviceWorkspaces.find(
    workspace => workspace.id === form.workspaceId,
  );

  const update = <K extends keyof RegisteredAgentFormValue>(
    key: K,
    value: RegisteredAgentFormValue[K],
  ) => setForm(current => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Enter an agent name.');
      return;
    }
    if (!form.handle.trim()) {
      setError('Enter an agent handle.');
      return;
    }
    if (!form.deviceId || !form.workspaceId || !form.defaultFolder.trim()) {
      setError('Choose a device, workspace, and default folder.');
      return;
    }
    if (
      form.interactionPolicy === 'selected_users' &&
      form.selectedUserIds.length === 0
    ) {
      setError('Select at least one person who can interact with this agent.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        handle: form.handle.trim().replace(/^@/, ''),
        description: form.description.trim(),
        defaultFolder: form.defaultFolder.trim(),
        model: form.model.trim(),
      });
      setOpen(false);
    } catch {
      setError(
        agent
          ? 'Unable to save the agent. Check the connection and try again.'
          : 'Unable to register the agent. Check the connection and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) initializeForm();
      }}
    >
      <ResponsiveDialogTrigger asChild>
        {trigger ?? (
          <Button type='button' size='sm' className='h-7 gap-1.5 px-2 text-xs'>
            <Bot className='size-3.5' aria-hidden='true' />
            Register agent
          </Button>
        )}
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        showCloseButton={false}
        className='max-h-[90dvh] gap-2 overflow-y-auto p-2 sm:max-w-2xl'
      >
        <ResponsiveDialogHeader className='sr-only'>
          <ResponsiveDialogTitle>
            {agent ? 'Edit agent' : 'Register agent'}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Connect a local Codex or Claude Code session to this workspace.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className='grid gap-2 sm:grid-cols-2'>
          <div className='space-y-1'>
            <label htmlFor='agent-name' className='text-xs font-medium'>
              Agent name
            </label>
            <Input
              id='agent-name'
              value={form.name}
              onChange={event => {
                const name = event.target.value;
                update('name', name);
                if (!agent && !form.handle) {
                  update(
                    'handle',
                    name
                      .toLowerCase()
                      .replace(/\s+/g, '-')
                      .replace(/[^a-z0-9-_]/g, ''),
                  );
                }
                setError(null);
              }}
              placeholder='Release coordinator'
              className='h-9 text-base sm:text-sm'
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <div className='space-y-1'>
            <label htmlFor='agent-handle' className='text-xs font-medium'>
              Handle
            </label>
            <div className='relative'>
              <span className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm'>
                @
              </span>
              <Input
                id='agent-handle'
                value={form.handle}
                onChange={event =>
                  update(
                    'handle',
                    event.target.value
                      .replace(/^@/, '')
                      .toLowerCase()
                      .replace(/\s+/g, '-')
                      .replace(/[^a-z0-9-_]/g, ''),
                  )
                }
                placeholder='release-coordinator'
                className='h-9 pl-7 text-base sm:text-sm'
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        <div className='space-y-1'>
          <label htmlFor='agent-description' className='text-xs font-medium'>
            Description
          </label>
          <Textarea
            id='agent-description'
            value={form.description}
            onChange={event => update('description', event.target.value)}
            placeholder='What should teammates ask this agent to do?'
            className='min-h-16 resize-none text-base sm:text-sm'
            disabled={isSubmitting}
          />
        </div>

        <div className='grid gap-2 sm:grid-cols-3'>
          <SelectField
            label='Provider'
            value={form.provider}
            items={providers}
            onChange={value => update('provider', value)}
            placeholder='Choose provider'
            searchPlaceholder='Search providers…'
            disabled={isSubmitting}
          />
          <SelectField
            label='Device'
            value={form.deviceId}
            items={devices.map(device => ({
              value: device.id,
              label: device.name,
              description: `${device.hostname ?? device.platform ?? 'Local device'} · ${device.status}`,
            }))}
            onChange={value => {
              update('deviceId', value);
              update('workspaceId', '');
              update('defaultFolder', '');
            }}
            placeholder='Choose device'
            searchPlaceholder='Search devices…'
            disabled={isSubmitting}
          />
          <SelectField
            label='Workspace'
            value={form.workspaceId}
            items={deviceWorkspaces.map(workspace => ({
              value: workspace.id,
              label: workspace.name,
              description: workspace.rootPath,
            }))}
            onChange={value => {
              update('workspaceId', value);
              const workspace = deviceWorkspaces.find(
                option => option.id === value,
              );
              update('defaultFolder', workspace?.rootPath ?? '');
            }}
            placeholder={
              form.deviceId ? 'Choose workspace' : 'Choose device first'
            }
            searchPlaceholder='Search workspaces…'
            disabled={isSubmitting || !form.deviceId}
          />
        </div>

        <div className='space-y-1'>
          <label htmlFor='agent-folder' className='text-xs font-medium'>
            Default working folder
          </label>
          <div className='relative'>
            <Folder
              className='text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
              aria-hidden='true'
            />
            <Input
              id='agent-folder'
              value={form.defaultFolder}
              onChange={event => update('defaultFolder', event.target.value)}
              placeholder={
                selectedWorkspace?.rootPath ?? '/path/to/project/folder'
              }
              className='h-9 pl-8 font-mono text-base sm:text-xs'
              disabled={isSubmitting || !form.workspaceId}
              spellCheck={false}
            />
          </div>
          <p className='text-muted-foreground text-[10px] leading-4 text-pretty'>
            Tagged work starts in this folder. The connected device must have
            access to it.
          </p>
        </div>

        <div className='grid gap-2 sm:grid-cols-2'>
          <div className='space-y-1'>
            <span className='text-xs font-medium'>Permission mode</span>
            <div className='space-y-1 rounded-lg border p-1'>
              {permissionModes.map(mode => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.value}
                    type='button'
                    onClick={() => update('permissionMode', mode.value)}
                    className={cn(
                      'focus-visible:ring-ring flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start focus-visible:ring-2 focus-visible:outline-none',
                      form.permissionMode === mode.value && 'bg-muted',
                    )}
                    aria-pressed={form.permissionMode === mode.value}
                    disabled={isSubmitting}
                  >
                    <Icon
                      className='text-muted-foreground mt-0.5 size-3.5 shrink-0'
                      aria-hidden='true'
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='block text-xs font-medium'>
                        {mode.label}
                      </span>
                      <span className='text-muted-foreground block text-[10px] leading-4 text-pretty'>
                        {mode.description}
                      </span>
                    </span>
                    <Check
                      className={cn(
                        'mt-0.5 size-3.5',
                        form.permissionMode === mode.value
                          ? 'opacity-100'
                          : 'opacity-0',
                      )}
                      aria-hidden='true'
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <div className='space-y-1'>
            <span className='text-xs font-medium'>Who can interact</span>
            <div className='space-y-1 rounded-lg border p-1'>
              {interactionPolicies.map(policy => {
                const Icon = policy.icon;
                return (
                  <button
                    key={policy.value}
                    type='button'
                    onClick={() => update('interactionPolicy', policy.value)}
                    className={cn(
                      'focus-visible:ring-ring flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start focus-visible:ring-2 focus-visible:outline-none',
                      form.interactionPolicy === policy.value && 'bg-muted',
                    )}
                    aria-pressed={form.interactionPolicy === policy.value}
                    disabled={isSubmitting}
                  >
                    <Icon
                      className='text-muted-foreground mt-0.5 size-3.5 shrink-0'
                      aria-hidden='true'
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='block text-xs font-medium'>
                        {policy.label}
                      </span>
                      <span className='text-muted-foreground block text-[10px] leading-4 text-pretty'>
                        {policy.description}
                      </span>
                    </span>
                    <Check
                      className={cn(
                        'mt-0.5 size-3.5',
                        form.interactionPolicy === policy.value
                          ? 'opacity-100'
                          : 'opacity-0',
                      )}
                      aria-hidden='true'
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {form.interactionPolicy === 'selected_users' ? (
          <div className='space-y-1'>
            <span className='text-xs font-medium'>Allowed people</span>
            <Command className='rounded-lg border'>
              <CommandInput
                placeholder='Search workspace members…'
                className='h-9'
              />
              <CommandList className='max-h-44'>
                <CommandEmpty>No members match this search.</CommandEmpty>
                <CommandGroup>
                  {members.map(member => {
                    const selected = form.selectedUserIds.includes(member.id);
                    return (
                      <CommandItem
                        key={member.id}
                        value={`${member.name} ${member.email ?? ''}`}
                        onSelect={() =>
                          update(
                            'selectedUserIds',
                            selected
                              ? form.selectedUserIds.filter(
                                  id => id !== member.id,
                                )
                              : [...form.selectedUserIds, member.id],
                          )
                        }
                      >
                        <UserAvatar
                          name={member.name}
                          email={member.email}
                          image={member.image}
                          userId={member.id}
                          size='sm'
                        />
                        <span className='min-w-0 flex-1 truncate text-sm'>
                          {member.name}
                        </span>
                        <Check
                          className={cn(
                            'size-4',
                            selected ? 'opacity-100' : 'opacity-0',
                          )}
                          aria-hidden='true'
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        ) : null}

        <div className='space-y-1 rounded-lg border p-2'>
          <div className='flex items-center gap-1.5'>
            <Sparkles
              className='text-muted-foreground size-3.5'
              aria-hidden='true'
            />
            <h3 className='text-xs font-medium'>Optional defaults</h3>
            <span className='text-muted-foreground text-[10px]'>
              Applied when the adapter supports them
            </span>
          </div>
          <div
            className={cn(
              'grid gap-2',
              form.provider === 'codex' && 'sm:grid-cols-2',
            )}
          >
            <div className='space-y-1'>
              <label htmlFor='agent-model' className='text-xs font-medium'>
                Model
              </label>
              <div className='relative'>
                <TerminalSquare
                  className='text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
                  aria-hidden='true'
                />
                <Input
                  id='agent-model'
                  value={form.model}
                  onChange={event => update('model', event.target.value)}
                  placeholder='Use provider default'
                  className='h-9 pl-8 text-base sm:text-sm'
                  disabled={isSubmitting}
                />
              </div>
            </div>
            {form.provider === 'codex' ? (
              <SelectField
                label='Thinking level'
                value={form.thinkingLevel}
                items={codexThinkingLevels}
                onChange={value => update('thinkingLevel', value)}
                placeholder='Use provider default'
                searchPlaceholder='Search thinking levels…'
                disabled={isSubmitting}
              />
            ) : null}
          </div>
        </div>

        {devices.length === 0 ? (
          <div
            role='status'
            className='bg-muted/40 flex items-start gap-2 rounded-lg border p-2'
          >
            <HardDrive
              className='text-muted-foreground mt-0.5 size-3.5'
              aria-hidden='true'
            />
            <div className='min-w-0 flex-1'>
              <p className='text-muted-foreground text-xs leading-5 text-pretty'>
                No devices are registered yet. Connect the Vector bridge before
                registering an agent.
              </p>
              <Button
                render={<Link href='/settings/devices' />}
                nativeButton={false}
                variant='link'
                size='sm'
                className='mt-0.5 h-6 px-0 text-xs'
              >
                Manage devices
              </Button>
            </div>
          </div>
        ) : null}

        <p
          role='alert'
          className={cn(
            'text-destructive min-h-4 px-1 text-xs',
            !error && 'sr-only',
          )}
        >
          {error ?? ''}
        </p>

        <ResponsiveDialogFooter className='flex-row items-center justify-between gap-2'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type='button'
            size='sm'
            className='gap-1.5'
            disabled={isSubmitting}
            onClick={() => void submit()}
          >
            {isSubmitting ? (
              <BarsSpinner size={12} />
            ) : agent ? (
              <Check className='size-3.5' aria-hidden='true' />
            ) : (
              <Bot className='size-3.5' aria-hidden='true' />
            )}
            {agent ? 'Save agent' : 'Register agent'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
