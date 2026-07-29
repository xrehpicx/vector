'use client';

import { useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Bot,
  Check,
  Files,
  Hash,
  Lock,
  Megaphone,
  Menu,
  MoreHorizontal,
  Pin,
  Search,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { PermissionAwareSelector } from '@/components/ui/permission-aware';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useOptimisticValue } from '@/hooks/use-optimistic';
import { cn } from '@/lib/utils';
import type { ChannelNotificationMode, CollaborationChannel } from './types';

export type CollaborationContextView =
  'thread' | 'search' | 'members' | 'agents' | 'pins' | 'files';

const notificationModes: ReadonlyArray<{
  value: ChannelNotificationMode;
  label: string;
  description: string;
  icon: typeof Bell;
}> = [
  {
    value: 'all',
    label: 'All messages',
    description: 'Notify me about every message.',
    icon: BellRing,
  },
  {
    value: 'mentions',
    label: 'Mentions and replies',
    description: 'Notify me when someone calls me into the conversation.',
    icon: Bell,
  },
  {
    value: 'muted',
    label: 'Muted',
    description: 'Keep unread state without sending notifications.',
    icon: BellOff,
  },
];

function ChannelNotificationSelector({
  orgSlug,
  value,
  onChange,
}: {
  orgSlug: string;
  value: ChannelNotificationMode;
  onChange: (mode: ChannelNotificationMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [displayValue, setOptimisticValue] = useOptimisticValue(value);
  const current = notificationModes.find(mode => mode.value === displayValue)!;
  const CurrentIcon = current.icon;

  return (
    <PermissionAwareSelector
      orgSlug={orgSlug}
      permission='channel:view'
      fallbackMessage='You need channel access to change notifications.'
    >
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    className='size-11 md:size-7'
                    aria-label={`Notifications: ${current.label}`}
                  />
                }
              />
            }
          >
            <CurrentIcon
              className='size-[18px] md:size-3.5'
              aria-hidden='true'
            />
          </TooltipTrigger>
          <TooltipContent>{current.label}</TooltipContent>
        </Tooltip>
        <PopoverContent align='end' className='w-72 p-0'>
          <Command>
            <CommandInput
              placeholder='Search notification modes…'
              className='h-9'
            />
            <CommandList>
              <CommandGroup heading='Channel notifications'>
                {notificationModes.map(mode => {
                  const Icon = mode.icon;
                  return (
                    <CommandItem
                      key={mode.value}
                      value={`${mode.label} ${mode.description}`}
                      onSelect={() => {
                        setOptimisticValue(mode.value);
                        onChange(mode.value);
                        setOpen(false);
                      }}
                    >
                      <Icon className='size-3.5' aria-hidden='true' />
                      <span className='min-w-0 flex-1'>
                        <span className='block text-sm font-medium'>
                          {mode.label}
                        </span>
                        <span className='text-muted-foreground block text-xs leading-4 text-pretty'>
                          {mode.description}
                        </span>
                      </span>
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
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </PermissionAwareSelector>
  );
}

function ContextButton({
  label,
  icon: Icon,
  view,
  activeView,
  onOpen,
  count,
}: {
  label: string;
  icon: typeof Search;
  view: CollaborationContextView;
  activeView?: CollaborationContextView | null;
  onOpen: (view: CollaborationContextView) => void;
  count?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className={cn('relative size-7', activeView === view && 'bg-muted')}
            aria-label={label}
            aria-pressed={activeView === view}
            onClick={() => onOpen(view)}
          />
        }
      >
        <Icon className='size-3.5' aria-hidden='true' />
        {count ? (
          <span className='bg-primary text-primary-foreground absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] leading-4 font-medium tabular-nums'>
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ChannelHeader({
  orgSlug,
  channel,
  activeView,
  onOpenContext,
  onOpenChannels,
  onNotificationModeChange,
}: {
  orgSlug: string;
  channel: CollaborationChannel;
  activeView?: CollaborationContextView | null;
  onOpenContext: (view: CollaborationContextView) => void;
  onOpenChannels: () => void;
  onNotificationModeChange: (mode: ChannelNotificationMode) => void;
}) {
  const ChannelIcon =
    channel.kind === 'private'
      ? Lock
      : channel.kind === 'announcement'
        ? Megaphone
        : channel.kind === 'direct' || channel.kind === 'group_direct'
          ? Users
          : Hash;

  return (
    <header className='flex min-h-14 shrink-0 items-center gap-2 border-b px-2 md:min-h-10'>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='size-11 md:hidden'
        onClick={onOpenChannels}
        aria-label='Open channels'
      >
        <Menu className='size-[18px]' aria-hidden='true' />
      </Button>

      <div className='flex min-w-0 flex-1 items-center gap-2'>
        <ChannelIcon
          className='text-muted-foreground size-3.5 shrink-0'
          aria-hidden='true'
        />
        <h1 className='truncate text-sm font-semibold'>{channel.name}</h1>
        {channel.topic ? (
          <span
            className='text-muted-foreground hidden min-w-0 truncate text-xs lg:block'
            title={channel.topic}
          >
            {channel.topic}
          </span>
        ) : null}
      </div>

      <div className='hidden shrink-0 items-center gap-0.5 md:flex'>
        <ChannelNotificationSelector
          orgSlug={orgSlug}
          value={channel.notificationMode}
          onChange={onNotificationModeChange}
        />
        <ContextButton
          label='Search channel'
          icon={Search}
          view='search'
          activeView={activeView}
          onOpen={onOpenContext}
        />
        <ContextButton
          label='Pinned messages'
          icon={Pin}
          view='pins'
          activeView={activeView}
          onOpen={onOpenContext}
        />
        <ContextButton
          label='Files and media'
          icon={Files}
          view='files'
          activeView={activeView}
          onOpen={onOpenContext}
        />
        <ContextButton
          label={`${channel.memberCount} ${channel.memberCount === 1 ? 'member' : 'members'}`}
          icon={Users}
          view='members'
          activeView={activeView}
          onOpen={onOpenContext}
          count={channel.memberCount}
        />
        <ContextButton
          label={`${channel.agents.length} ${channel.agents.length === 1 ? 'agent' : 'agents'}`}
          icon={Bot}
          view='agents'
          activeView={activeView}
          onOpen={onOpenContext}
          count={channel.agents.length}
        />
      </div>

      <div className='flex shrink-0 items-center md:hidden'>
        <ChannelNotificationSelector
          orgSlug={orgSlug}
          value={channel.notificationMode}
          onChange={onNotificationModeChange}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon-lg'
              className='size-11'
              aria-label='Channel actions'
            >
              <MoreHorizontal className='size-[19px]' aria-hidden='true' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='min-w-56 p-1.5'>
            <DropdownMenuItem
              className='min-h-11 gap-3 px-3 text-[15px]'
              onClick={() => onOpenContext('search')}
            >
              <Search className='size-[18px]' aria-hidden='true' />
              Search channel
            </DropdownMenuItem>
            <DropdownMenuItem
              className='min-h-11 gap-3 px-3 text-[15px]'
              onClick={() => onOpenContext('pins')}
            >
              <Pin className='size-[18px]' aria-hidden='true' />
              Pinned messages
            </DropdownMenuItem>
            <DropdownMenuItem
              className='min-h-11 gap-3 px-3 text-[15px]'
              onClick={() => onOpenContext('files')}
            >
              <Files className='size-[18px]' aria-hidden='true' />
              Files and media
            </DropdownMenuItem>
            <DropdownMenuItem
              className='min-h-11 gap-3 px-3 text-[15px]'
              onClick={() => onOpenContext('members')}
            >
              <Users className='size-[18px]' aria-hidden='true' />
              <span className='flex-1'>Members</span>
              <span className='text-muted-foreground text-xs tabular-nums'>
                {channel.memberCount}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className='min-h-11 gap-3 px-3 text-[15px]'
              onClick={() => onOpenContext('agents')}
            >
              <Bot className='size-[18px]' aria-hidden='true' />
              <span className='flex-1'>Agents</span>
              <span className='text-muted-foreground text-xs tabular-nums'>
                {channel.agents.length}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
