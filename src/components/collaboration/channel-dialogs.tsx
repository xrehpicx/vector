'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Hash,
  Lock,
  Megaphone,
  MessageCircle,
  Plus,
  Search,
  UserPlus,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  ChannelKind,
  CollaborationChannel,
  CollaborationUser,
} from './types';

const channelKinds: ReadonlyArray<{
  value: Extract<ChannelKind, 'public' | 'private' | 'announcement'>;
  label: string;
  description: string;
  icon: typeof Hash;
}> = [
  {
    value: 'public',
    label: 'Public channel',
    description: 'Everyone in the workspace can find and join it.',
    icon: Hash,
  },
  {
    value: 'private',
    label: 'Private channel',
    description: 'Only invited members can find and open it.',
    icon: Lock,
  },
  {
    value: 'announcement',
    label: 'Announcement channel',
    description: 'A focused channel for important workspace updates.',
    icon: Megaphone,
  },
];

export interface CreateConversationValue {
  kind: ChannelKind;
  name: string;
  topic: string;
  memberUserIds: string[];
}

function MemberPicker({
  members,
  selectedIds,
  onChange,
  label,
}: {
  members: CollaborationUser[];
  selectedIds: string[];
  onChange: (userIds: string[]) => void;
  label: string;
}) {
  const [query, setQuery] = useState('');
  const visibleMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return members
      .filter(member => {
        if (!normalized) return true;
        return `${member.name} ${member.email ?? ''}`
          .toLowerCase()
          .includes(normalized);
      })
      .slice(0, 5);
  }, [members, query]);

  return (
    <div className='space-y-1.5'>
      <label className='text-xs font-medium'>{label}</label>
      <Command shouldFilter={false} className='rounded-lg border'>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder='Search workspace members…'
          className='h-9'
        />
        <CommandList className='max-h-52'>
          <CommandEmpty>No members match this search.</CommandEmpty>
          <CommandGroup>
            {visibleMembers.map(member => {
              const selected = selectedIds.includes(member.id);
              return (
                <CommandItem
                  key={member.id}
                  value={`${member.name} ${member.email ?? ''}`}
                  onSelect={() =>
                    onChange(
                      selected
                        ? selectedIds.filter(id => id !== member.id)
                        : [...selectedIds, member.id],
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
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium'>
                      {member.name}
                    </span>
                    {member.email ? (
                      <span className='text-muted-foreground block truncate text-xs'>
                        {member.email}
                      </span>
                    ) : null}
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
      {selectedIds.length > 0 ? (
        <p className='text-muted-foreground text-xs tabular-nums'>
          {selectedIds.length}{' '}
          {selectedIds.length === 1 ? 'member selected' : 'members selected'}
        </p>
      ) : null}
    </div>
  );
}

export function CreateConversationDialog({
  members,
  onCreate,
  trigger,
  defaultMode = 'channel',
}: {
  members: CollaborationUser[];
  onCreate: (
    value: CreateConversationValue,
  ) => Promise<void | string> | void | string;
  trigger?: React.ReactNode;
  defaultMode?: 'channel' | 'direct';
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'channel' | 'direct'>(defaultMode);
  const [kind, setKind] =
    useState<Extract<ChannelKind, 'public' | 'private' | 'announcement'>>(
      'public',
    );
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [kindOpen, setKindOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode(defaultMode);
    setKind('public');
    setName('');
    setTopic('');
    setSelectedIds([]);
    setError(null);
  };

  const selectedKind = channelKinds.find(item => item.value === kind)!;
  const KindIcon = selectedKind.icon;

  const submit = async () => {
    if (mode === 'channel' && !name.trim()) {
      setError('Enter a channel name.');
      return;
    }
    if (mode === 'direct' && selectedIds.length === 0) {
      setError('Select at least one person.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate({
        kind:
          mode === 'direct'
            ? selectedIds.length === 1
              ? 'direct'
              : 'group_direct'
            : kind,
        name: name.trim(),
        topic: topic.trim(),
        memberUserIds: selectedIds,
      });
      setOpen(false);
      reset();
    } catch {
      setError(
        mode === 'direct'
          ? 'Unable to start the conversation. Try again.'
          : 'Unable to create the channel. Try again.',
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
        if (!next) reset();
      }}
    >
      <ResponsiveDialogTrigger asChild>
        {trigger ?? (
          <Button type='button' size='sm' className='h-7 gap-1.5 px-2 text-xs'>
            <Plus className='size-3.5' aria-hidden='true' />
            New
          </Button>
        )}
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        showCloseButton={false}
        className='gap-2 p-2 sm:max-w-xl'
      >
        <ResponsiveDialogHeader className='sr-only'>
          <ResponsiveDialogTitle>
            {mode === 'channel' ? 'Create channel' : 'Start a conversation'}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Create a shared workspace channel or message workspace members
            directly.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div
          role='tablist'
          aria-label='Conversation type'
          className='bg-muted flex h-8 items-center rounded-lg p-0.5'
        >
          <button
            type='button'
            role='tab'
            aria-selected={mode === 'channel'}
            onClick={() => {
              setMode('channel');
              setError(null);
            }}
            className={cn(
              'focus-visible:ring-ring flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium focus-visible:ring-2 focus-visible:outline-none',
              mode === 'channel' && 'bg-background shadow-sm',
            )}
          >
            <Hash className='size-3.5' aria-hidden='true' />
            Channel
          </button>
          <button
            type='button'
            role='tab'
            aria-selected={mode === 'direct'}
            onClick={() => {
              setMode('direct');
              setError(null);
            }}
            className={cn(
              'focus-visible:ring-ring flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium focus-visible:ring-2 focus-visible:outline-none',
              mode === 'direct' && 'bg-background shadow-sm',
            )}
          >
            <MessageCircle className='size-3.5' aria-hidden='true' />
            Direct message
          </button>
        </div>

        {mode === 'channel' ? (
          <div className='space-y-2'>
            <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]'>
              <div className='space-y-1'>
                <label
                  htmlFor='new-channel-name'
                  className='text-xs font-medium'
                >
                  Channel name
                </label>
                <Input
                  id='new-channel-name'
                  value={name}
                  onChange={event => {
                    setName(
                      event.target.value
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                        .replace(/[^a-z0-9-_]/g, ''),
                    );
                    setError(null);
                  }}
                  placeholder='design-systems'
                  className='h-9 text-base sm:text-sm'
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
              <div className='space-y-1'>
                <span className='text-xs font-medium'>Visibility</span>
                <Popover open={kindOpen} onOpenChange={setKindOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      className='h-9 w-full justify-start gap-2 px-2'
                      disabled={isSubmitting}
                    >
                      <KindIcon className='size-3.5' aria-hidden='true' />
                      <span className='truncate'>{selectedKind.label}</span>
                      <ChevronDown
                        className='text-muted-foreground ml-auto size-3.5'
                        aria-hidden='true'
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align='end' className='w-72 p-0'>
                    <Command>
                      <CommandInput
                        placeholder='Search channel types…'
                        className='h-9'
                      />
                      <CommandList>
                        <CommandGroup>
                          {channelKinds.map(item => {
                            const Icon = item.icon;
                            return (
                              <CommandItem
                                key={item.value}
                                value={`${item.label} ${item.description}`}
                                onSelect={() => {
                                  setKind(item.value);
                                  setKindOpen(false);
                                }}
                              >
                                <Icon className='size-3.5' aria-hidden='true' />
                                <span className='min-w-0 flex-1'>
                                  <span className='block text-sm font-medium'>
                                    {item.label}
                                  </span>
                                  <span className='text-muted-foreground block text-xs leading-4 text-pretty'>
                                    {item.description}
                                  </span>
                                </span>
                                <Check
                                  className={cn(
                                    'size-4',
                                    kind === item.value
                                      ? 'opacity-100'
                                      : 'opacity-0',
                                  )}
                                  aria-hidden='true'
                                />
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className='space-y-1'>
              <label
                htmlFor='new-channel-topic'
                className='text-xs font-medium'
              >
                Topic
              </label>
              <Textarea
                id='new-channel-topic'
                value={topic}
                onChange={event => setTopic(event.target.value)}
                placeholder='What belongs in this channel?'
                className='min-h-16 resize-none text-base sm:text-sm'
                disabled={isSubmitting}
              />
            </div>
            {kind !== 'public' ? (
              <MemberPicker
                members={members}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                label='Invite members'
              />
            ) : null}
          </div>
        ) : (
          <MemberPicker
            members={members}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            label='Message people'
          />
        )}

        <p
          role='alert'
          className={cn(
            'text-destructive min-h-4 px-1 text-xs',
            !error && 'sr-only',
          )}
        >
          {error ?? ''}
        </p>

        <ResponsiveDialogFooter className='flex-row items-center justify-between gap-2 sm:-mx-2! sm:-mb-2! sm:p-2!'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-8'
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type='button'
            size='sm'
            className='h-8 gap-1.5'
            disabled={isSubmitting}
            onClick={() => void submit()}
          >
            {isSubmitting ? (
              <BarsSpinner size={12} />
            ) : mode === 'direct' ? (
              <MessageCircle className='size-3.5' aria-hidden='true' />
            ) : (
              <Plus className='size-3.5' aria-hidden='true' />
            )}
            {mode === 'direct' ? 'Start conversation' : 'Create channel'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function AddChannelMembersDialog({
  members,
  existingMemberIds,
  onAddMembers,
  trigger,
}: {
  members: CollaborationUser[];
  existingMemberIds: string[];
  onAddMembers: (userIds: string[]) => Promise<void> | void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const availableMembers = members.filter(
    member => !existingMemberIds.includes(member.id),
  );

  const submit = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await onAddMembers(selectedIds);
      setSelectedIds([]);
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        {trigger ?? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-7 gap-1.5 px-2 text-xs'
          >
            <UserPlus className='size-3.5' aria-hidden='true' />
            Add members
          </Button>
        )}
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        showCloseButton={false}
        className='gap-2 p-2 sm:max-w-lg'
      >
        <ResponsiveDialogHeader className='sr-only'>
          <ResponsiveDialogTitle>Add channel members</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Invite workspace members to this channel.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <MemberPicker
          members={availableMembers}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
          label='Add workspace members'
        />
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
            disabled={isSubmitting || selectedIds.length === 0}
            onClick={() => void submit()}
          >
            {isSubmitting ? (
              <BarsSpinner size={12} />
            ) : (
              <UserPlus className='size-3.5' aria-hidden='true' />
            )}
            Add {selectedIds.length || ''}{' '}
            {selectedIds.length === 1 ? 'member' : 'members'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function BrowseChannelsDialog({
  orgSlug,
  channels,
  onJoin,
  onCreate,
  trigger,
}: {
  orgSlug: string;
  channels: CollaborationChannel[];
  onJoin: (channelId: string) => Promise<void> | void;
  onCreate: (
    value: CreateConversationValue,
  ) => Promise<void | string> | void | string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const visibleChannels = channels.filter(channel => {
    const normalized = query.trim().toLowerCase();
    return (
      !normalized ||
      `${channel.name} ${channel.topic ?? ''}`
        .toLowerCase()
        .includes(normalized)
    );
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery('');
      }}
    >
      <ResponsiveDialogTrigger asChild>
        {trigger ?? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-7 w-full justify-start gap-2 px-2 text-xs'
          >
            <Search className='size-3.5' aria-hidden='true' />
            Browse channels
          </Button>
        )}
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        showCloseButton={false}
        className='gap-0 overflow-hidden p-0 sm:max-w-2xl'
      >
        <ResponsiveDialogHeader className='border-b px-3 py-2'>
          <div className='flex items-center gap-2'>
            <div className='min-w-0 flex-1'>
              <ResponsiveDialogTitle className='text-sm'>
                Browse channels
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className='text-xs'>
                Find public channels across this workspace.
              </ResponsiveDialogDescription>
            </div>
            <CreateConversationDialog
              members={[]}
              onCreate={onCreate}
              trigger={
                <Button
                  type='button'
                  size='sm'
                  className='h-7 gap-1.5 px-2 text-xs'
                >
                  <Plus className='size-3.5' aria-hidden='true' />
                  Create channel
                </Button>
              }
            />
          </div>
        </ResponsiveDialogHeader>
        {channels.length > 0 ? (
          <div className='border-b p-2'>
            <label htmlFor='browse-channel-search' className='sr-only'>
              Search channels
            </label>
            <div className='relative'>
              <Search
                className='text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
                aria-hidden='true'
              />
              <Input
                id='browse-channel-search'
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder='Search channels…'
                className='h-8 pl-8 text-base sm:text-sm'
                autoFocus
              />
            </div>
          </div>
        ) : null}
        <ScrollArea
          className={cn(
            'max-h-[60dvh]',
            channels.length === 0 ? 'min-h-48' : 'min-h-72',
          )}
        >
          {channels.length === 0 ? (
            <div className='text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-1.5 px-6 text-center'>
              <Hash className='size-6 opacity-50' aria-hidden='true' />
              <p className='text-sm font-medium'>No channels to browse</p>
              <p className='max-w-xs text-xs'>
                There aren’t any public channels you can join right now.
              </p>
            </div>
          ) : visibleChannels.length === 0 ? (
            <div className='text-muted-foreground flex min-h-56 flex-col items-center justify-center gap-2 px-6 text-center'>
              <Hash className='size-6 opacity-50' aria-hidden='true' />
              <p className='text-sm font-medium'>
                No channels match “{query.trim()}”
              </p>
              <button
                type='button'
                onClick={() => setQuery('')}
                className='text-primary text-xs underline underline-offset-2'
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className='divide-y'>
              {visibleChannels.map(channel => (
                <div
                  key={channel.id}
                  className='hover:bg-muted/35 flex min-h-12 items-center gap-2 px-3 py-2'
                >
                  <div className='text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md border'>
                    {channel.kind === 'private' ? (
                      <Lock className='size-3.5' aria-hidden='true' />
                    ) : channel.kind === 'announcement' ? (
                      <Megaphone className='size-3.5' aria-hidden='true' />
                    ) : (
                      <Hash className='size-3.5' aria-hidden='true' />
                    )}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <Link
                      href={`/${orgSlug}/channels/${channel.slug}`}
                      className='focus-visible:ring-ring block truncate rounded-sm text-sm font-medium focus-visible:ring-2 focus-visible:outline-none'
                      onClick={() => setOpen(false)}
                    >
                      {channel.name}
                    </Link>
                    <p className='text-muted-foreground truncate text-xs'>
                      {channel.topic ??
                        `${channel.memberCount} ${channel.memberCount === 1 ? 'member' : 'members'}`}
                    </p>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-7 gap-1.5 px-2 text-xs'
                    disabled={joiningId !== null}
                    onClick={() => {
                      setJoiningId(channel.id);
                      void Promise.resolve(onJoin(channel.id)).finally(() =>
                        setJoiningId(null),
                      );
                    }}
                  >
                    {joiningId === channel.id ? (
                      <BarsSpinner size={11} />
                    ) : (
                      <Plus className='size-3.5' aria-hidden='true' />
                    )}
                    Join
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
