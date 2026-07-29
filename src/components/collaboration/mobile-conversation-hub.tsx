'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useConvex } from 'convex/react';
import type { Id } from '@/convex/_generated/dataModel';
import { useRouter } from 'nextjs-toploader/app';
import {
  AtSign,
  Bookmark,
  Bot,
  MessageSquareReply,
  Search,
} from 'lucide-react';
import { api, useCachedQuery, useMutation } from '@/lib/convex';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ChannelList } from './channel-list';
import type { CreateConversationValue } from './channel-dialogs';
import { toCollaborationChannel, toCollaborationUser } from './adapters';

const shortcuts = [
  { label: 'Priority', path: 'priority', icon: AtSign },
  { label: 'Threads', path: 'threads', icon: MessageSquareReply },
  { label: 'Saved', path: 'saved', icon: Bookmark },
  { label: 'Agents', path: '../agents', icon: Bot },
] as const;

export function MobileConversationHub({
  orgSlug,
  mode,
}: {
  orgSlug: string;
  mode: 'all' | 'direct';
}) {
  const router = useRouter();
  const convex = useConvex();
  const currentUser = useCachedQuery(api.users.currentUser);
  const channelRows = useCachedQuery(api.collaboration.channels.list, {
    orgSlug,
    limit: 100,
  });
  const memberRows = useCachedQuery(api.organizations.queries.searchMembers, {
    orgSlug,
    limit: 100,
  });
  const createChannel = useMutation(api.collaboration.channels.create);
  const joinChannel = useMutation(api.collaboration.channels.join);

  const channels = useMemo(
    () => channelRows?.map(row => toCollaborationChannel(row)) ?? [],
    [channelRows],
  );
  const members = useMemo(() => {
    if (!memberRows || !currentUser) return [];
    const currentUserId = String(currentUser._id);
    return memberRows
      .flatMap(row => (row.user ? [row.user] : []))
      .map(user => toCollaborationUser(user, currentUserId));
  }, [currentUser, memberRows]);

  const handleCreate = async (value: CreateConversationValue) => {
    const selectedMembers = members.filter(member =>
      value.memberUserIds.includes(member.id),
    );
    const directName =
      selectedMembers.map(member => member.name).join(', ') || 'Direct message';
    const channelId = await createChannel({
      orgSlug,
      kind: value.kind,
      name:
        value.kind === 'direct' || value.kind === 'group_direct'
          ? directName
          : value.name,
      topic: value.topic || undefined,
      memberUserIds: value.memberUserIds.map(id => id as Id<'users'>),
    });
    const created = await convex.query(api.collaboration.channels.get, {
      channelId,
    });
    router.push(`/${orgSlug}/channels/${created.channel.slug}`);
    return String(channelId);
  };

  const handleJoin = async (channelId: string) => {
    const id = channelId as Id<'channels'>;
    await joinChannel({ channelId: id });
    const joined = await convex.query(api.collaboration.channels.get, {
      channelId: id,
    });
    router.push(`/${orgSlug}/channels/${joined.channel.slug}`);
  };

  if (
    currentUser === undefined ||
    channelRows === undefined ||
    memberRows === undefined
  ) {
    return (
      <div className='flex h-full flex-col' aria-label='Loading conversations'>
        <div className='flex min-h-16 items-center px-4'>
          <div className='w-full space-y-2'>
            <Skeleton className='h-5 w-28' />
            <Skeleton className='h-3 w-48' />
          </div>
        </div>
        <div className='border-y p-3'>
          <Skeleton className='h-11 w-full rounded-xl' />
        </div>
        <div className='space-y-2 p-3'>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className='h-11 w-full rounded-lg' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='flex h-full min-h-0 flex-col overflow-hidden'>
      <div className='bg-background shrink-0 space-y-3 border-b px-3 py-3 md:hidden'>
        <Link
          href={`/${orgSlug}/channels/search`}
          className='bg-muted/70 text-muted-foreground focus-visible:ring-ring flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-[15px] focus-visible:ring-2 focus-visible:outline-none'
        >
          <Search className='size-[18px]' aria-hidden='true' />
          <span>Search conversations</span>
        </Link>

        {mode === 'all' ? (
          <nav
            aria-label='Conversation shortcuts'
            className='flex snap-x scrollbar-none gap-2 overflow-x-auto'
          >
            {shortcuts.map(shortcut => {
              const Icon = shortcut.icon;
              const href = shortcut.path.startsWith('..')
                ? `/${orgSlug}/${shortcut.path.slice(3)}`
                : `/${orgSlug}/channels/${shortcut.path}`;
              return (
                <Link
                  key={shortcut.label}
                  href={href}
                  className={cn(
                    'bg-muted/45 hover:bg-muted focus-visible:ring-ring flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  )}
                >
                  <Icon
                    className='text-muted-foreground size-4'
                    aria-hidden='true'
                  />
                  {shortcut.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>

      <div className='min-h-0 flex-1'>
        <ChannelList
          orgSlug={orgSlug}
          channels={channels}
          workspaceMembers={members}
          onCreate={handleCreate}
          onJoin={handleJoin}
          mode={mode}
          title={mode === 'direct' ? 'Direct messages' : 'Home'}
          subtitle={
            mode === 'direct'
              ? 'Private conversations with teammates'
              : 'Your conversations and shared workspace'
          }
        />
      </div>
    </div>
  );
}
