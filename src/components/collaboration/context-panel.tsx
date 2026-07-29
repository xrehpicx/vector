'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Bookmark,
  Bot,
  CheckCircle2,
  File,
  FileImage,
  Files,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
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
import { PermissionAware } from '@/components/ui/permission-aware';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOptimisticValue } from '@/hooks/use-optimistic';
import { cn } from '@/lib/utils';
import {
  AgentAvatar,
  AgentLifecycleBadge,
  AgentOwnerLabel,
  AgentWakeModeSelector,
} from './agent-presence';
import { AddChannelMembersDialog } from './channel-dialogs';
import type { CollaborationContextView } from './channel-header';
import { MessageComposer } from './message-composer';
import { MessageItem } from './message-item';
import type {
  AgentWakeMode,
  CollaborationAgent,
  CollaborationChannel,
  CollaborationMessage,
  CollaborationUser,
  SendCollaborationMessageInput,
} from './types';

function ContextPanelHeader({
  icon: Icon,
  title,
  description,
  onClose,
}: {
  icon: typeof Search;
  title: string;
  description?: string;
  onClose: () => void;
}) {
  return (
    <div className='flex min-h-10 shrink-0 items-center gap-2 border-b px-3'>
      <Icon
        className='text-muted-foreground size-3.5 shrink-0'
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1'>
        <h2 className='truncate text-xs font-semibold'>{title}</h2>
        {description ? (
          <p className='text-muted-foreground truncate text-[10px]'>
            {description}
          </p>
        ) : null}
      </div>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='size-7'
        onClick={onClose}
        aria-label={`Close ${title.toLowerCase()}`}
      >
        <X className='size-3.5' aria-hidden='true' />
      </Button>
    </div>
  );
}

function ThreadPanel({
  channel,
  root,
  replies,
  currentUser,
  onClose,
  onSendReply,
  onToggleReaction,
  onTogglePin,
  onToggleSave,
  onSetResolved,
  onFollow,
}: {
  channel: CollaborationChannel;
  root: CollaborationMessage;
  replies: CollaborationMessage[];
  currentUser?: CollaborationUser | null;
  onClose: () => void;
  onSendReply: (input: SendCollaborationMessageInput) => Promise<void> | void;
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void> | void;
  onTogglePin?: (messageId: string, pinned: boolean) => Promise<void> | void;
  onToggleSave?: (messageId: string, saved: boolean) => Promise<void> | void;
  onSetResolved?: (threadRootId: string, resolved: boolean) => void;
  onFollow?: (threadRootId: string, following: boolean) => void;
}) {
  const [displayResolved, setOptimisticResolved] = useOptimisticValue(
    root.threadResolved ?? false,
  );
  const [displayFollowing, setOptimisticFollowing] = useOptimisticValue(
    root.followingThread ?? false,
  );

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex h-10 shrink-0 items-center gap-2 border-b px-3'>
        <div className='flex min-w-0 flex-1 items-baseline gap-1.5'>
          <h2 className='shrink-0 text-sm font-semibold'>Thread</h2>
          <span className='text-muted-foreground truncate text-xs'>
            in #{channel.name}
          </span>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          className='size-7 shrink-0'
          onClick={onClose}
          aria-label='Close thread'
        >
          <X className='size-3.5' aria-hidden='true' />
        </Button>
      </div>
      <div className='flex min-h-0 flex-1 flex-col'>
        <ScrollArea className='min-h-0 flex-1'>
          <div className='py-1.5'>
            <MessageItem
              message={root}
              onToggleReaction={onToggleReaction}
              onTogglePin={onTogglePin}
              onToggleSave={onToggleSave}
            />
            <div className='flex items-center gap-2 px-3 py-1.5'>
              <span className='text-muted-foreground shrink-0 text-[10px] font-medium'>
                {replies.length === 0
                  ? 'Replies'
                  : `${replies.length} ${
                      replies.length === 1 ? 'reply' : 'replies'
                    }`}
              </span>
              <div className='bg-border h-px flex-1' aria-hidden='true' />
            </div>
            {replies.map(reply => (
              <MessageItem
                key={reply.id}
                message={reply}
                onToggleReaction={onToggleReaction}
                onTogglePin={onTogglePin}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
        </ScrollArea>

        <div className='flex min-h-9 shrink-0 items-center gap-1 border-t px-2'>
          <button
            type='button'
            onClick={() => {
              const next = !displayFollowing;
              setOptimisticFollowing(next);
              onFollow?.(root.id, next);
            }}
            className={cn(
              'hover:bg-muted focus-visible:ring-ring inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-xs focus-visible:ring-2 focus-visible:outline-none',
              displayFollowing && 'text-primary',
            )}
            aria-pressed={displayFollowing}
          >
            <Bookmark className='size-3.5' aria-hidden='true' />
            {displayFollowing ? 'Following' : 'Follow thread'}
          </button>
          <button
            type='button'
            onClick={() => {
              const next = !displayResolved;
              setOptimisticResolved(next);
              onSetResolved?.(root.id, next);
            }}
            className={cn(
              'hover:bg-muted focus-visible:ring-ring ml-auto inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-xs focus-visible:ring-2 focus-visible:outline-none',
              displayResolved && 'text-emerald-700 dark:text-emerald-400',
            )}
            aria-pressed={displayResolved}
          >
            <CheckCircle2 className='size-3.5' aria-hidden='true' />
            {displayResolved ? 'Resolved' : 'Resolve'}
          </button>
        </div>
        <MessageComposer
          channelName={channel.name}
          currentUser={currentUser}
          users={channel.members}
          agents={channel.agents}
          threadRootId={root.id}
          compact
          submitLabel='Send reply'
          onSend={onSendReply}
        />
      </div>
    </div>
  );
}

function SearchPanel({
  messages,
  onClose,
}: {
  messages: CollaborationMessage[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return messages
      .filter(message => {
        const author =
          message.author.user?.name ??
          message.author.agent?.name ??
          message.author.label ??
          '';
        return `${message.body} ${author}`.toLowerCase().includes(normalized);
      })
      .slice(0, 30);
  }, [messages, query]);

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ContextPanelHeader
        icon={Search}
        title='Search channel'
        description={
          query
            ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
            : 'Messages and files'
        }
        onClose={onClose}
      />
      <div className='border-b p-2'>
        <label htmlFor='channel-search-input' className='sr-only'>
          Search channel messages
        </label>
        <div className='relative'>
          <Search
            className='text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
            aria-hidden='true'
          />
          <Input
            id='channel-search-input'
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder='Search messages and files…'
            className='h-8 pl-8 text-base sm:text-sm'
            autoFocus
          />
        </div>
      </div>
      <ScrollArea className='min-h-0 flex-1'>
        {!query ? (
          <div className='text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center'>
            <Search className='size-6 opacity-50' aria-hidden='true' />
            <p className='text-sm font-medium'>Search this conversation</p>
            <p className='text-xs leading-5 text-pretty'>
              Find decisions, shared files, and earlier context.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className='text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center'>
            <Search className='size-6 opacity-50' aria-hidden='true' />
            <p className='text-sm font-medium'>No results for “{query}”</p>
            <button
              type='button'
              className='text-primary text-xs underline underline-offset-2'
              onClick={() => setQuery('')}
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className='p-2'>
            {results.map(message => (
              <button
                key={message.id}
                type='button'
                onClick={() => {
                  document
                    .getElementById(`message-${message.id}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  onClose();
                }}
                className='hover:bg-muted/50 focus-visible:ring-ring flex w-full items-start gap-2 rounded-md px-2 py-2 text-start focus-visible:ring-2 focus-visible:outline-none'
              >
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    <span className='truncate text-xs font-medium'>
                      {message.author.user?.name ??
                        (message.author.agent
                          ? `@${message.author.agent.handle}`
                          : 'System')}
                    </span>
                    <time className='text-muted-foreground shrink-0 text-[10px] tabular-nums'>
                      {new Date(message.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <p className='text-muted-foreground line-clamp-2 text-xs leading-5'>
                    {message.body}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MembersPanel({
  channel,
  workspaceMembers,
  onClose,
  onAddMembers,
}: {
  channel: CollaborationChannel;
  workspaceMembers: CollaborationUser[];
  onClose: () => void;
  onAddMembers?: (userIds: string[]) => Promise<void> | void;
}) {
  const [query, setQuery] = useState('');
  const visibleMembers = channel.members.filter(member =>
    `${member.name} ${member.email ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ContextPanelHeader
        icon={Users}
        title='Members'
        description={`${channel.memberCount} ${channel.memberCount === 1 ? 'member' : 'members'}`}
        onClose={onClose}
      />
      <div className='flex items-center gap-2 border-b p-2'>
        <div className='relative min-w-0 flex-1'>
          <Search
            className='text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
            aria-hidden='true'
          />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label='Search channel members'
            placeholder='Search members…'
            className='h-8 pl-8 text-base sm:text-sm'
          />
        </div>
        {onAddMembers ? (
          <AddChannelMembersDialog
            members={workspaceMembers}
            existingMemberIds={channel.members.map(member => member.id)}
            onAddMembers={onAddMembers}
            trigger={
              <Button
                type='button'
                variant='outline'
                size='icon-sm'
                className='size-8'
                aria-label='Add channel members'
              >
                <UserPlus className='size-3.5' aria-hidden='true' />
              </Button>
            }
          />
        ) : null}
      </div>
      <ScrollArea className='min-h-0 flex-1'>
        <div className='p-2'>
          {visibleMembers.map(member => (
            <div
              key={member.id}
              className='hover:bg-muted/40 flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5'
            >
              <UserAvatar
                name={member.name}
                email={member.email}
                image={member.image}
                userId={member.id}
                size='sm'
                showStatus
                presence={
                  member.presence === 'away'
                    ? 'idle'
                    : member.presence === 'busy'
                      ? 'dnd'
                      : member.presence
                }
              />
              <div className='min-w-0 flex-1'>
                <p className='truncate text-xs font-medium'>
                  {member.name}
                  {member.isCurrentUser ? (
                    <span className='text-muted-foreground font-normal'>
                      {' '}
                      · you
                    </span>
                  ) : null}
                </p>
                <p className='text-muted-foreground truncate text-[10px]'>
                  {member.status ?? member.email ?? 'Workspace member'}
                </p>
              </div>
              <span className='text-muted-foreground text-[10px] capitalize'>
                {member.presence ?? 'offline'}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function AgentsPanel({
  orgSlug,
  channel,
  availableAgents,
  onClose,
  onAddAgent,
  onWakeModeChange,
  onRemoveAgent,
}: {
  orgSlug: string;
  channel: CollaborationChannel;
  availableAgents: CollaborationAgent[];
  onClose: () => void;
  onAddAgent?: (agentId: string) => Promise<void> | void;
  onWakeModeChange?: (agentId: string, mode: AgentWakeMode) => void;
  onRemoveAgent?: (agentId: string) => Promise<void> | void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [removingAgentId, setRemovingAgentId] = useState<string | null>(null);
  const addableAgents = availableAgents.filter(
    agent => !channel.agents.some(channelAgent => channelAgent.id === agent.id),
  );

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ContextPanelHeader
        icon={Bot}
        title='Channel agents'
        description='Ownership and wake behavior'
        onClose={onClose}
      />
      <div className='flex min-h-10 items-center gap-2 border-b px-2'>
        <p className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
          Agents can work from mentions or every message.
        </p>
        {onAddAgent ? (
          <PermissionAware
            orgSlug={orgSlug}
            permission='channel:manage:members'
            fallbackMessage='You need channel management access to add agents.'
          >
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 gap-1.5 px-2 text-xs'
                >
                  <Plus className='size-3.5' aria-hidden='true' />
                  Add agent
                </Button>
              </PopoverTrigger>
              <PopoverContent align='end' className='w-72 p-0'>
                <Command>
                  <CommandInput
                    placeholder='Search workspace agents…'
                    className='h-9'
                  />
                  <CommandList>
                    <CommandEmpty>No agents are available.</CommandEmpty>
                    <CommandGroup>
                      {addableAgents.slice(0, 5).map(agent => (
                        <CommandItem
                          key={agent.id}
                          value={`${agent.name} ${agent.handle} ${agent.owner.name}`}
                          disabled={pendingAgentId !== null}
                          onSelect={() => {
                            setPendingAgentId(agent.id);
                            void Promise.resolve(onAddAgent(agent.id)).finally(
                              () => {
                                setPendingAgentId(null);
                                setAddOpen(false);
                              },
                            );
                          }}
                        >
                          <AgentAvatar agent={agent} size='sm' />
                          <span className='min-w-0 flex-1'>
                            <span className='block truncate text-xs font-medium'>
                              @{agent.handle}
                            </span>
                            <AgentOwnerLabel
                              agent={agent}
                              className='block truncate text-[10px]'
                            />
                          </span>
                          {pendingAgentId === agent.id ? (
                            <BarsSpinner size={12} />
                          ) : (
                            <Plus className='size-3.5' aria-hidden='true' />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </PermissionAware>
        ) : null}
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        {channel.agents.length === 0 ? (
          <div className='text-muted-foreground flex min-h-56 flex-col items-center justify-center gap-2 px-6 text-center'>
            <Bot className='size-7 opacity-40' aria-hidden='true' />
            <p className='text-sm font-medium'>No agents in this channel</p>
            <p className='max-w-xs text-xs leading-5 text-pretty'>
              Add an owned agent, then choose whether it wakes on mentions or
              every message.
            </p>
          </div>
        ) : (
          <div className='space-y-1 p-2'>
            {channel.agents.map(agent => (
              <div
                key={agent.id}
                className='hover:bg-muted/35 rounded-lg border p-2'
              >
                <div className='flex items-center gap-2'>
                  <AgentAvatar agent={agent} size='default' />
                  <div className='min-w-0 flex-1'>
                    <div className='flex min-w-0 items-center gap-1.5'>
                      <p className='truncate text-xs font-semibold'>
                        @{agent.handle}
                      </p>
                      <AgentLifecycleBadge status={agent.lifecycleStatus} />
                    </div>
                    <AgentOwnerLabel agent={agent} className='block truncate' />
                  </div>
                  {onRemoveAgent ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-sm'
                          className='size-7'
                          aria-label={`Actions for ${agent.name}`}
                        >
                          {removingAgentId === agent.id ? (
                            <BarsSpinner size={11} />
                          ) : (
                            <MoreHorizontal
                              className='size-3.5'
                              aria-hidden='true'
                            />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align='end' className='w-56 p-0'>
                        <Command>
                          <CommandInput
                            placeholder='Search agent actions…'
                            className='h-9'
                          />
                          <CommandList>
                            <CommandGroup>
                              <CommandItem
                                value='Remove agent from channel'
                                className='text-destructive'
                                disabled={removingAgentId !== null}
                                onSelect={() => {
                                  setRemovingAgentId(agent.id);
                                  void Promise.resolve(
                                    onRemoveAgent(agent.id),
                                  ).finally(() => setRemovingAgentId(null));
                                }}
                              >
                                {removingAgentId === agent.id ? (
                                  <BarsSpinner size={12} />
                                ) : (
                                  <Trash2 aria-hidden='true' />
                                )}
                                Remove from channel
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
                <div className='mt-2 flex items-center gap-2'>
                  <AgentWakeModeSelector
                    orgSlug={orgSlug}
                    value={agent.wakeMode ?? 'mentions'}
                    onChange={mode => onWakeModeChange?.(agent.id, mode)}
                    disabled={!onWakeModeChange}
                  />
                  <span className='text-muted-foreground min-w-0 flex-1 truncate text-[10px]'>
                    {agent.workspaceName ?? agent.deviceName ?? agent.provider}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      <div className='border-t p-2'>
        <Link
          href={`/${orgSlug}/agents`}
          className='hover:bg-muted focus-visible:ring-ring flex min-h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium focus-visible:ring-2 focus-visible:outline-none'
        >
          <Bot className='size-3.5' aria-hidden='true' />
          Manage workspace agents
        </Link>
      </div>
    </div>
  );
}

function PinsPanel({
  messages,
  onClose,
}: {
  messages: CollaborationMessage[];
  onClose: () => void;
}) {
  const pins = messages.filter(message => message.isPinned);
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ContextPanelHeader
        icon={Pin}
        title='Pinned messages'
        description={`${pins.length} ${pins.length === 1 ? 'message' : 'messages'}`}
        onClose={onClose}
      />
      <ScrollArea className='min-h-0 flex-1'>
        {pins.length === 0 ? (
          <div className='text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center'>
            <Pin className='size-6 opacity-50' aria-hidden='true' />
            <p className='text-sm font-medium'>No pinned messages</p>
            <p className='text-xs leading-5 text-pretty'>
              Pin decisions and reference material so the channel can find them
              quickly.
            </p>
          </div>
        ) : (
          <div className='p-2'>
            {pins.map(message => (
              <button
                key={message.id}
                type='button'
                onClick={() => {
                  document
                    .getElementById(`message-${message.id}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  onClose();
                }}
                className='hover:bg-muted/40 focus-visible:ring-ring w-full rounded-md border px-2 py-2 text-start focus-visible:ring-2 focus-visible:outline-none'
              >
                <p className='truncate text-xs font-medium'>
                  {message.author.user?.name ??
                    message.author.agent?.name ??
                    'System'}
                </p>
                <p className='text-muted-foreground line-clamp-3 text-xs leading-5'>
                  {message.body}
                </p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function FilesPanel({
  messages,
  onClose,
}: {
  messages: CollaborationMessage[];
  onClose: () => void;
}) {
  const attachments = messages.flatMap(message =>
    message.attachments.map(attachment => ({ attachment, message })),
  );

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ContextPanelHeader
        icon={Files}
        title='Files and media'
        description={`${attachments.length} ${attachments.length === 1 ? 'file' : 'files'}`}
        onClose={onClose}
      />
      <ScrollArea className='min-h-0 flex-1'>
        {attachments.length === 0 ? (
          <div className='text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center'>
            <Files className='size-6 opacity-50' aria-hidden='true' />
            <p className='text-sm font-medium'>No files shared yet</p>
            <p className='text-xs leading-5 text-pretty'>
              Images, media, and documents shared in this channel will appear
              here.
            </p>
          </div>
        ) : (
          <div className='grid grid-cols-2 gap-2 p-2'>
            {attachments.map(({ attachment, message }) => (
              <a
                key={attachment.id}
                href={attachment.url}
                target='_blank'
                rel='noreferrer'
                className='hover:bg-muted/40 focus-visible:ring-ring min-w-0 overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:outline-none'
              >
                {attachment.kind === 'image' ? (
                  <Image
                    src={attachment.url}
                    alt={attachment.name}
                    width={240}
                    height={144}
                    unoptimized
                    className='aspect-video w-full object-cover outline -outline-offset-1 outline-black/10 dark:outline-white/10'
                  />
                ) : (
                  <div className='bg-muted/40 flex aspect-video items-center justify-center'>
                    {attachment.kind === 'file' ? (
                      <File className='size-6' aria-hidden='true' />
                    ) : (
                      <FileImage className='size-6' aria-hidden='true' />
                    )}
                  </div>
                )}
                <div className='p-2'>
                  <p className='truncate text-xs font-medium'>
                    {attachment.name}
                  </p>
                  <p className='text-muted-foreground truncate text-[10px]'>
                    {message.author.user?.name ??
                      message.author.agent?.name ??
                      'System'}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function CollaborationContextPanel({
  orgSlug,
  view,
  channel,
  messages,
  threadRoot,
  threadReplies = [],
  currentUser,
  workspaceMembers,
  availableAgents,
  onClose,
  onSendReply,
  onToggleReaction,
  onTogglePin,
  onToggleSave,
  onSetThreadResolved,
  onFollowThread,
  onAddMembers,
  onAddAgent,
  onAgentWakeModeChange,
  onRemoveAgent,
}: {
  orgSlug: string;
  view: CollaborationContextView;
  channel: CollaborationChannel;
  messages: CollaborationMessage[];
  threadRoot?: CollaborationMessage | null;
  threadReplies?: CollaborationMessage[];
  currentUser?: CollaborationUser | null;
  workspaceMembers: CollaborationUser[];
  availableAgents: CollaborationAgent[];
  onClose: () => void;
  onSendReply: (input: SendCollaborationMessageInput) => Promise<void> | void;
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void> | void;
  onTogglePin?: (messageId: string, pinned: boolean) => Promise<void> | void;
  onToggleSave?: (messageId: string, saved: boolean) => Promise<void> | void;
  onSetThreadResolved?: (threadRootId: string, resolved: boolean) => void;
  onFollowThread?: (threadRootId: string, following: boolean) => void;
  onAddMembers?: (userIds: string[]) => Promise<void> | void;
  onAddAgent?: (agentId: string) => Promise<void> | void;
  onAgentWakeModeChange?: (agentId: string, mode: AgentWakeMode) => void;
  onRemoveAgent?: (agentId: string) => Promise<void> | void;
}) {
  if (view === 'thread' && threadRoot) {
    return (
      <ThreadPanel
        channel={channel}
        root={threadRoot}
        replies={threadReplies}
        currentUser={currentUser}
        onClose={onClose}
        onSendReply={onSendReply}
        onToggleReaction={onToggleReaction}
        onTogglePin={onTogglePin}
        onToggleSave={onToggleSave}
        onSetResolved={onSetThreadResolved}
        onFollow={onFollowThread}
      />
    );
  }
  if (view === 'search') {
    return <SearchPanel messages={messages} onClose={onClose} />;
  }
  if (view === 'members') {
    return (
      <MembersPanel
        channel={channel}
        workspaceMembers={workspaceMembers}
        onClose={onClose}
        onAddMembers={onAddMembers}
      />
    );
  }
  if (view === 'agents') {
    return (
      <AgentsPanel
        orgSlug={orgSlug}
        channel={channel}
        availableAgents={availableAgents}
        onClose={onClose}
        onAddAgent={onAddAgent}
        onWakeModeChange={onAgentWakeModeChange}
        onRemoveAgent={onRemoveAgent}
      />
    );
  }
  if (view === 'pins') {
    return <PinsPanel messages={messages} onClose={onClose} />;
  }
  return <FilesPanel messages={messages} onClose={onClose} />;
}
