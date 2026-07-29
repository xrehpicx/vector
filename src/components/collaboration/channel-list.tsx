'use client';

import Link from 'next/link';
import {
  Bot,
  Hash,
  Lock,
  Megaphone,
  MessageCircle,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  BrowseChannelsDialog,
  CreateConversationDialog,
  type CreateConversationValue,
} from './channel-dialogs';
import type { CollaborationChannel, CollaborationUser } from './types';

function ChannelLink({
  orgSlug,
  channel,
  active,
  onNavigate,
}: {
  orgSlug: string;
  channel: CollaborationChannel;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon =
    channel.kind === 'private'
      ? Lock
      : channel.kind === 'announcement'
        ? Megaphone
        : channel.kind === 'direct' || channel.kind === 'group_direct'
          ? channel.kind === 'group_direct'
            ? Users
            : MessageCircle
          : Hash;

  return (
    <Link
      href={`/${orgSlug}/channels/${channel.slug}`}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'hover:bg-muted/60 focus-visible:ring-ring group flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors focus-visible:ring-2 focus-visible:outline-none md:min-h-8 md:gap-2 md:rounded-md md:px-2 md:text-xs',
        active && 'bg-muted text-foreground font-medium',
        !active && 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className='size-[18px] shrink-0 md:size-3.5' aria-hidden='true' />
      <span className='min-w-0 flex-1 truncate'>{channel.name}</span>
      {channel.agents.some(agent => agent.lifecycleStatus === 'ready') ? (
        <Bot
          className='text-primary size-3 shrink-0'
          aria-label='Agent available'
        />
      ) : null}
      {channel.mentionCount ? (
        <span className='bg-primary text-primary-foreground flex min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] leading-4 font-semibold tabular-nums'>
          {channel.mentionCount > 99 ? '99+' : channel.mentionCount}
        </span>
      ) : channel.unreadCount ? (
        <span className='text-foreground text-[10px] font-medium tabular-nums'>
          {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

export function ChannelList({
  orgSlug,
  channels,
  workspaceMembers,
  activeChannelId,
  onCreate,
  onJoin,
  onNavigate,
  mode = 'all',
  title = 'Conversations',
  subtitle = 'Channels, teammates, and agents',
}: {
  orgSlug: string;
  channels: CollaborationChannel[];
  workspaceMembers: CollaborationUser[];
  activeChannelId?: string | null;
  onCreate: (
    value: CreateConversationValue,
  ) => Promise<void | string> | void | string;
  onJoin: (channelId: string) => Promise<void> | void;
  onNavigate?: () => void;
  mode?: 'all' | 'direct';
  title?: string;
  subtitle?: string;
}) {
  const channelItems = channels.filter(
    channel =>
      channel.isMember !== false &&
      (channel.kind === 'public' ||
        channel.kind === 'private' ||
        channel.kind === 'announcement'),
  );
  const discoverableChannels = channels.filter(
    channel => channel.kind === 'public' && channel.isMember === false,
  );
  const directItems = channels.filter(
    channel => channel.kind === 'direct' || channel.kind === 'group_direct',
  );

  return (
    <aside className='bg-muted/10 flex h-full min-h-0 w-full flex-col'>
      <div className='flex min-h-14 shrink-0 items-center gap-2 border-b px-4 md:min-h-10 md:px-2'>
        <div className='min-w-0 flex-1'>
          <h2 className='truncate text-[17px] leading-5 font-semibold tracking-[-0.01em] md:text-xs md:leading-normal'>
            {title}
          </h2>
          <p className='text-muted-foreground mt-0.5 truncate text-xs md:mt-0 md:text-[10px]'>
            {subtitle}
          </p>
        </div>
        <CreateConversationDialog
          members={workspaceMembers}
          onCreate={onCreate}
          trigger={
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              className='size-11 rounded-full md:size-7 md:rounded-md'
              aria-label='Create channel or direct message'
            >
              <Plus className='size-3.5' aria-hidden='true' />
            </Button>
          }
        />
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        <nav
          aria-label='Workspace conversations'
          className='space-y-5 px-2 py-3 md:space-y-4 md:py-2'
        >
          {mode === 'all' ? (
            <div className='space-y-1'>
              <div className='flex h-8 items-center gap-1 px-2 md:h-6'>
                <h3 className='text-muted-foreground min-w-0 flex-1 truncate text-[10px] font-semibold tracking-wide uppercase'>
                  Channels
                </h3>
                <BrowseChannelsDialog
                  orgSlug={orgSlug}
                  channels={discoverableChannels}
                  onJoin={onJoin}
                  onCreate={onCreate}
                  trigger={
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      className='size-11 rounded-full md:size-6 md:rounded-md'
                      aria-label='Browse channels'
                    >
                      <Search className='size-3' aria-hidden='true' />
                    </Button>
                  }
                />
                <CreateConversationDialog
                  members={workspaceMembers}
                  onCreate={onCreate}
                  trigger={
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      className='size-11 rounded-full md:size-6 md:rounded-md'
                      aria-label='Create channel'
                    >
                      <Plus className='size-3' aria-hidden='true' />
                    </Button>
                  }
                />
              </div>
              {channelItems.length === 0 ? (
                <p className='text-muted-foreground px-2 py-1 text-xs'>
                  No channels yet
                </p>
              ) : (
                channelItems.map(channel => (
                  <ChannelLink
                    key={channel.id}
                    orgSlug={orgSlug}
                    channel={channel}
                    active={activeChannelId === channel.id}
                    onNavigate={onNavigate}
                  />
                ))
              )}
            </div>
          ) : null}

          <div className='space-y-1'>
            <div className='flex h-8 items-center gap-1 px-2 md:h-6'>
              <h3 className='text-muted-foreground min-w-0 flex-1 truncate text-[10px] font-semibold tracking-wide uppercase'>
                Direct messages
              </h3>
              <CreateConversationDialog
                members={workspaceMembers}
                onCreate={onCreate}
                defaultMode='direct'
                trigger={
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    className='size-11 rounded-full md:size-6 md:rounded-md'
                    aria-label='Start direct message'
                  >
                    <Plus className='size-3' aria-hidden='true' />
                  </Button>
                }
              />
            </div>
            {directItems.length === 0 ? (
              <p className='text-muted-foreground px-2 py-1 text-xs'>
                Start a conversation with a teammate.
              </p>
            ) : (
              directItems.map(channel => (
                <ChannelLink
                  key={channel.id}
                  orgSlug={orgSlug}
                  channel={channel}
                  active={activeChannelId === channel.id}
                  onNavigate={onNavigate}
                />
              ))
            )}
          </div>

          {mode === 'all' ? (
            <div className='space-y-1'>
              <h3 className='text-muted-foreground h-6 px-2 text-[10px] leading-6 font-semibold tracking-wide uppercase'>
                Automations
              </h3>
              <Link
                href={`/${orgSlug}/agents`}
                onClick={onNavigate}
                className='text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] focus-visible:ring-2 focus-visible:outline-none md:min-h-8 md:gap-2 md:rounded-md md:px-2 md:text-xs'
              >
                <Bot className='size-[18px] md:size-3.5' aria-hidden='true' />
                <span className='min-w-0 flex-1 truncate'>Agents</span>
              </Link>
            </div>
          ) : null}
        </nav>
      </ScrollArea>
    </aside>
  );
}
