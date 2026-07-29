'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Bookmark,
  BookmarkCheck,
  Bot,
  BriefcaseBusiness,
  Check,
  CircleAlert,
  Download,
  File,
  FileInput,
  FolderKanban,
  Link2,
  ListTodo,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { BarsSpinner } from '@/components/bars-spinner';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/hooks/use-confirm';
import { useOptimisticValue } from '@/hooks/use-optimistic';
import { cn } from '@/lib/utils';
import { AgentOwnerLabel, AgentRunStatusPill } from './agent-presence';
import { MediaViewer } from './media-viewer';
import type {
  CollaborationAttachment,
  CollaborationEntityLink,
  CollaborationMessage,
  CollaborationReaction,
} from './types';
import type { PresenceStatus } from '@/components/user-status-indicator';

const quickReactions = ['👍', '✅', '👀'] as const;

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return `Yesterday at ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, h:mm a');
}

function toPresenceStatus(
  presence: 'online' | 'away' | 'busy' | 'offline' | undefined,
): PresenceStatus | undefined {
  if (presence === 'away') return 'idle';
  if (presence === 'busy') return 'dnd';
  return presence;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MessageBody({ body }: { body: string }) {
  const parts = useMemo(
    () => body.split(/((?:https?:\/\/|www\.)\S+|@[a-zA-Z0-9._-]+)/g),
    [body],
  );

  return (
    <p className='overflow-wrap-anywhere max-w-[75ch] text-sm leading-5 whitespace-pre-wrap'>
      {parts.map((part, index) => {
        if (/^(?:https?:\/\/|www\.)/.test(part)) {
          const href = part.startsWith('www.') ? `https://${part}` : part;
          return (
            <a
              key={`${part}-${index}`}
              href={href}
              target='_blank'
              rel='noreferrer'
              className='text-primary decoration-primary/40 hover:decoration-primary underline underline-offset-2'
            >
              {part}
            </a>
          );
        }
        if (part.startsWith('@')) {
          return (
            <span
              key={`${part}-${index}`}
              className='bg-primary/10 text-primary rounded px-1 py-0.5 font-medium'
            >
              {part}
            </span>
          );
        }
        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </p>
  );
}

function AttachmentView({
  attachment,
  grouped = false,
  onOpen,
}: {
  attachment: CollaborationAttachment;
  grouped?: boolean;
  onOpen?: () => void;
}) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  if (attachment.kind === 'image') {
    const width = attachment.width ?? 720;
    const height = attachment.height ?? 480;
    return (
      <figure className={cn('min-w-0', grouped ? 'w-full' : 'max-w-xl')}>
        <button
          type='button'
          onClick={onOpen}
          className={cn(
            'bg-muted/30 focus-visible:ring-ring relative block cursor-zoom-in overflow-hidden rounded-lg text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            grouped && 'aspect-square w-full',
          )}
          aria-label={`Preview ${attachment.name}`}
          aria-busy={loadState === 'loading'}
        >
          {loadState === 'loading' ? (
            <Skeleton
              className='absolute inset-0 size-full rounded-lg'
              aria-hidden='true'
            />
          ) : null}
          <Image
            src={attachment.url}
            alt={attachment.name}
            width={width}
            height={height}
            unoptimized
            onLoad={() => setLoadState('ready')}
            onError={() => setLoadState('error')}
            className={cn(
              'outline -outline-offset-1 outline-black/10 transition-opacity dark:outline-white/10',
              grouped
                ? 'size-full object-cover'
                : 'max-h-[28rem] w-auto max-w-full rounded-lg object-contain',
              loadState === 'ready' ? 'opacity-100' : 'opacity-0',
            )}
          />
          {loadState === 'error' ? (
            <span className='text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-xs'>
              <CircleAlert className='size-5' aria-hidden='true' />
              Image unavailable
            </span>
          ) : null}
        </button>
        <figcaption className='text-muted-foreground mt-1 truncate text-[11px]'>
          {attachment.name}
        </figcaption>
      </figure>
    );
  }

  if (attachment.kind === 'video') {
    return (
      <figure className={cn('min-w-0', grouped ? 'w-full' : 'max-w-xl')}>
        <div
          className={cn(
            'bg-muted/30 relative overflow-hidden rounded-lg',
            grouped && 'aspect-square w-full',
          )}
          aria-busy={loadState === 'loading'}
        >
          {loadState === 'loading' ? (
            <Skeleton
              className='absolute inset-0 size-full rounded-lg'
              aria-hidden='true'
            />
          ) : null}
          <video
            src={attachment.url}
            controls
            preload='metadata'
            onLoadedMetadata={() => setLoadState('ready')}
            onError={() => setLoadState('error')}
            aria-label={`Video: ${attachment.name}`}
            className={cn(
              'relative rounded-lg bg-black object-contain outline -outline-offset-1 outline-black/10 transition-opacity dark:outline-white/10',
              grouped ? 'size-full' : 'max-h-[28rem] max-w-xl',
              loadState === 'ready' ? 'opacity-100' : 'opacity-0',
            )}
          />
          {loadState === 'error' ? (
            <span className='text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-xs'>
              <CircleAlert className='size-5' aria-hidden='true' />
              Video unavailable
            </span>
          ) : null}
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='absolute top-1.5 right-1.5 z-10 border border-white/15 bg-black/40 text-white shadow-sm backdrop-blur-sm hover:bg-black/60 hover:text-white'
            onClick={onOpen}
            aria-label={`Expand ${attachment.name}`}
            title='Expand video'
          >
            <Maximize2 className='size-3.5' aria-hidden='true' />
          </Button>
        </div>
        <figcaption className='text-muted-foreground mt-1 truncate text-[11px]'>
          {attachment.name}
        </figcaption>
      </figure>
    );
  }

  if (attachment.kind === 'audio') {
    return (
      <div className='bg-muted/35 max-w-md rounded-lg border p-2'>
        <p className='mb-1 truncate text-xs font-medium'>{attachment.name}</p>
        <audio
          src={attachment.url}
          controls
          preload='metadata'
          aria-label={`Audio: ${attachment.name}`}
          className='h-8 w-full'
        />
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      download={attachment.name}
      className='hover:bg-muted/50 focus-visible:ring-ring flex max-w-sm items-center gap-2 rounded-lg border p-2 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
    >
      <div className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-md'>
        <File className='size-4' aria-hidden='true' />
      </div>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-xs font-medium'>
          {attachment.name}
        </span>
        <span className='text-muted-foreground block text-[10px] tabular-nums'>
          {formatFileSize(attachment.size)}
        </span>
      </span>
      <Download
        className='text-muted-foreground size-3.5 shrink-0'
        aria-hidden='true'
      />
    </a>
  );
}

function updateReaction(
  reactions: CollaborationReaction[],
  emoji: string,
): CollaborationReaction[] {
  const existing = reactions.find(reaction => reaction.emoji === emoji);
  if (!existing) {
    return [
      ...reactions,
      { emoji, count: 1, reactedByCurrentUser: true, userNames: [] },
    ];
  }
  if (existing.reactedByCurrentUser && existing.count <= 1) {
    return reactions.filter(reaction => reaction.emoji !== emoji);
  }
  return reactions.map(reaction =>
    reaction.emoji === emoji
      ? {
          ...reaction,
          count: Math.max(
            0,
            reaction.count + (reaction.reactedByCurrentUser ? -1 : 1),
          ),
          reactedByCurrentUser: !reaction.reactedByCurrentUser,
        }
      : reaction,
  );
}

interface MessageItemProps {
  message: CollaborationMessage;
  onOpenThread?: (message: CollaborationMessage) => void;
  onEdit?: (messageId: string, body: string) => Promise<void> | void;
  onDelete?: (messageId: string) => Promise<void> | void;
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void> | void;
  onTogglePin?: (messageId: string, pinned: boolean) => Promise<void> | void;
  onToggleSave?: (messageId: string, saved: boolean) => Promise<void> | void;
  onRespondToPermission?: (
    runId: string,
    optionId: string,
  ) => Promise<void> | void;
  onCancelRun?: (runId: string) => Promise<void> | void;
  linkableEntities?: CollaborationEntityLink[];
  onLinkEntity?: (
    messageId: string,
    entity: Pick<CollaborationEntityLink, 'type' | 'entityId'>,
  ) => Promise<void> | void;
  onCreateRequestFromMessage?: (
    message: CollaborationMessage,
  ) => Promise<void> | void;
  onCreateWorkFromMessage?: (
    message: CollaborationMessage,
  ) => Promise<void> | void;
}

export function MessageItem({
  message,
  onOpenThread,
  onEdit,
  onDelete,
  onToggleReaction,
  onTogglePin,
  onToggleSave,
  onRespondToPermission,
  onCancelRun,
  linkableEntities = [],
  onLinkEntity,
  onCreateRequestFromMessage,
  onCreateWorkFromMessage,
}: MessageItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<'request' | 'work' | null>(
    null,
  );
  const [confirmDelete, ConfirmDeleteDialog] = useConfirm();
  const [displayReactions, setOptimisticReactions] = useOptimisticValue(
    message.reactions,
  );
  const [displayPinned, setOptimisticPinned] = useOptimisticValue(
    message.isPinned,
  );
  const [displaySaved, setOptimisticSaved] = useOptimisticValue(
    message.isSaved,
  );
  const [displayLinkedEntities, setOptimisticLinkedEntities] =
    useOptimisticValue(message.linkedEntities ?? []);
  const mediaAttachments = useMemo(
    () =>
      message.attachments.filter(
        attachment =>
          attachment.kind === 'image' || attachment.kind === 'video',
      ),
    [message.attachments],
  );

  const toggleReaction = useCallback(
    (emoji: string) => {
      setOptimisticReactions(updateReaction(displayReactions, emoji));
      void onToggleReaction?.(message.id, emoji);
    },
    [displayReactions, message.id, onToggleReaction, setOptimisticReactions],
  );

  const saveEdit = useCallback(async () => {
    const trimmed = editBody.trim();
    if (!trimmed || trimmed === message.body) {
      setIsEditing(false);
      return;
    }
    setIsSavingEdit(true);
    try {
      await onEdit?.(message.id, trimmed);
      setIsEditing(false);
    } finally {
      setIsSavingEdit(false);
    }
  }, [editBody, message.body, message.id, onEdit]);

  const deleteMessage = useCallback(async () => {
    const confirmed = await confirmDelete({
      title: 'Delete message',
      description:
        'This message will be removed from the channel and its thread.',
      confirmLabel: 'Delete message',
      variant: 'destructive',
    });
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await onDelete?.(message.id);
      setMenuOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [confirmDelete, message.id, onDelete]);

  const createFromMessage = useCallback(
    async (kind: 'request' | 'work') => {
      setPendingCreate(kind);
      try {
        if (kind === 'request') {
          await onCreateRequestFromMessage?.(message);
        } else {
          await onCreateWorkFromMessage?.(message);
        }
        setMenuOpen(false);
      } finally {
        setPendingCreate(null);
      }
    },
    [message, onCreateRequestFromMessage, onCreateWorkFromMessage],
  );

  if (message.author.kind === 'system') {
    return (
      <div className='text-muted-foreground flex items-center gap-2 px-3 py-1.5 text-xs italic'>
        <MessageSquare className='size-3.5 shrink-0' aria-hidden='true' />
        <span className='overflow-wrap-anywhere min-w-0 flex-1'>
          {message.body}
        </span>
        <time className='shrink-0 text-[10px] tabular-nums'>
          {formatTimestamp(message.createdAt)}
        </time>
      </div>
    );
  }

  const authorUser = message.author.user;
  const authorAgent = message.author.agent;
  const deleted = Boolean(message.deletedAt);

  return (
    <>
      <article
        id={`message-${message.id}`}
        className='group/message hover:bg-muted/25 relative flex gap-2 px-3 py-2'
        aria-label={
          authorAgent
            ? `Message from agent ${authorAgent.name}`
            : `Message from ${authorUser?.name ?? 'unknown member'}`
        }
      >
        {authorUser ? (
          <UserAvatar
            name={authorUser.name}
            email={authorUser.email}
            image={authorUser.image}
            userId={authorUser.id}
            size='sm'
            className='mt-0.5 size-7 shrink-0'
            showStatus
            presence={toPresenceStatus(authorUser.presence)}
          />
        ) : (
          <div
            className='text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center'
            aria-hidden='true'
          >
            <Bot className='size-4' />
          </div>
        )}

        <div className='min-w-0 flex-1'>
          <div className='flex min-h-5 flex-wrap items-baseline gap-x-2 gap-y-0.5'>
            {authorUser ? (
              <span className='text-sm font-semibold'>{authorUser.name}</span>
            ) : authorAgent ? (
              <>
                <span className='text-xs font-medium'>
                  @{authorAgent.handle}
                </span>
                <AgentOwnerLabel agent={authorAgent} />
              </>
            ) : null}
            <time
              dateTime={new Date(message.createdAt).toISOString()}
              className='text-muted-foreground text-[10px] tabular-nums'
            >
              {formatTimestamp(message.createdAt)}
            </time>
            {message.editedAt ? (
              <span className='text-muted-foreground text-[10px]'>Edited</span>
            ) : null}
            {displayPinned ? (
              <span className='text-muted-foreground inline-flex items-center gap-1 text-[10px]'>
                <Pin className='size-3' aria-hidden='true' />
                Pinned
              </span>
            ) : null}
            {message.run ? (
              <AgentRunStatusPill
                run={message.run}
                compact
                onRespondToPermission={onRespondToPermission}
                onCancelRun={onCancelRun}
              />
            ) : null}
          </div>

          {deleted ? (
            <p className='text-muted-foreground text-sm italic'>
              This message was deleted.
            </p>
          ) : isEditing ? (
            <div className='mt-1 space-y-1.5'>
              <Textarea
                value={editBody}
                onChange={event => setEditBody(event.target.value)}
                className='min-h-20 resize-y text-base sm:text-sm'
                aria-label='Edit message'
                disabled={isSavingEdit}
                autoFocus
                onKeyDown={event => {
                  if (
                    event.key === 'Enter' &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    void saveEdit();
                  }
                  if (event.key === 'Escape') {
                    setEditBody(message.body);
                    setIsEditing(false);
                  }
                }}
              />
              <div className='flex items-center gap-1'>
                <Button
                  type='button'
                  size='sm'
                  className='h-7 gap-1.5 px-2 text-xs'
                  onClick={() => void saveEdit()}
                  disabled={isSavingEdit || !editBody.trim()}
                >
                  {isSavingEdit ? (
                    <BarsSpinner size={11} />
                  ) : (
                    <Check className='size-3.5' aria-hidden='true' />
                  )}
                  Save message
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='h-7 gap-1.5 px-2 text-xs'
                  disabled={isSavingEdit}
                  onClick={() => {
                    setEditBody(message.body);
                    setIsEditing(false);
                  }}
                >
                  <X className='size-3.5' aria-hidden='true' />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <MessageBody body={message.body} />
              {message.attachments.length > 0 ? (
                <div
                  className={cn(
                    'mt-2 gap-2',
                    message.attachments.length > 1
                      ? 'grid max-w-xl grid-cols-2 sm:grid-cols-3'
                      : 'flex max-w-3xl flex-wrap',
                  )}
                >
                  {message.attachments.map(attachment => {
                    const mediaIndex = mediaAttachments.findIndex(
                      media => media.id === attachment.id,
                    );
                    return (
                      <AttachmentView
                        key={attachment.id}
                        attachment={attachment}
                        grouped={message.attachments.length > 1}
                        onOpen={
                          mediaIndex >= 0
                            ? () => setActiveMediaIndex(mediaIndex)
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              ) : null}
              {mediaAttachments.length > 0 ? (
                <MediaViewer
                  attachments={mediaAttachments}
                  activeIndex={activeMediaIndex}
                  onActiveIndexChange={setActiveMediaIndex}
                  onOpenChange={open => {
                    if (!open) setActiveMediaIndex(null);
                  }}
                />
              ) : null}
              {displayLinkedEntities.length > 0 ? (
                <div
                  className='mt-1.5 flex flex-wrap gap-1'
                  aria-label='Linked work'
                >
                  {displayLinkedEntities.map(entity => {
                    const icon =
                      entity.type === 'request'
                        ? FileInput
                        : entity.type === 'project'
                          ? FolderKanban
                          : entity.type === 'document'
                            ? File
                            : ListTodo;
                    const EntityIcon = icon;
                    const content = (
                      <>
                        <EntityIcon className='size-3' aria-hidden='true' />
                        <span className='max-w-48 truncate'>
                          {entity.label}
                        </span>
                      </>
                    );
                    return entity.href ? (
                      <Badge
                        key={entity.id}
                        variant='outline'
                        className='h-5 gap-1 px-1.5 text-[10px]'
                        render={<Link href={entity.href} />}
                      >
                        {content}
                      </Badge>
                    ) : (
                      <Badge
                        key={entity.id}
                        variant='outline'
                        className='h-5 gap-1 px-1.5 text-[10px]'
                      >
                        {content}
                      </Badge>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}

          {!deleted && displayReactions.length > 0 ? (
            <div className='mt-1.5 flex flex-wrap items-center gap-1'>
              {displayReactions.map(reaction => (
                <button
                  key={reaction.emoji}
                  type='button'
                  onClick={() => toggleReaction(reaction.emoji)}
                  className={cn(
                    'hover:bg-muted focus-visible:ring-ring inline-flex min-h-6 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.96]',
                    reaction.reactedByCurrentUser &&
                      'border-primary/40 bg-primary/10 text-primary',
                  )}
                  aria-pressed={reaction.reactedByCurrentUser}
                  aria-label={`${reaction.emoji} reaction, ${reaction.count} ${reaction.count === 1 ? 'person' : 'people'}`}
                  title={reaction.userNames?.join(', ')}
                >
                  <span aria-hidden='true'>{reaction.emoji}</span>
                  <span className='tabular-nums'>{reaction.count}</span>
                </button>
              ))}
              <button
                type='button'
                onClick={() => toggleReaction('👍')}
                className='text-muted-foreground hover:bg-muted focus-visible:ring-ring flex size-6 items-center justify-center rounded-md border border-transparent focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
                aria-label='Add reaction'
              >
                <SmilePlus className='size-3.5' aria-hidden='true' />
              </button>
            </div>
          ) : null}

          {!deleted && onOpenThread && message.replyCount > 0 ? (
            <button
              type='button'
              onClick={() => onOpenThread?.(message)}
              className='text-primary hover:bg-primary/5 focus-visible:ring-ring mt-1.5 inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
            >
              <MessageSquare className='size-3.5' aria-hidden='true' />
              {message.replyCount}{' '}
              {message.replyCount === 1 ? 'reply' : 'replies'}
              {message.lastReplyAt ? (
                <span className='text-muted-foreground font-normal'>
                  · latest {formatTimestamp(message.lastReplyAt)}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>

        {!deleted && !isEditing ? (
          <div
            className={cn(
              'bg-background absolute top-1 right-3 items-center rounded-lg border p-0.5 shadow-sm',
              menuOpen
                ? 'flex'
                : 'hidden group-focus-within/message:flex group-hover/message:flex',
            )}
          >
            {quickReactions.map(emoji => (
              <button
                key={emoji}
                type='button'
                onClick={() => toggleReaction(emoji)}
                className='hover:bg-muted focus-visible:ring-ring flex size-7 items-center justify-center rounded-md text-sm focus-visible:ring-2 focus-visible:outline-none active:scale-[0.96]'
                aria-label={`React with ${emoji}`}
              >
                <span aria-hidden='true'>{emoji}</span>
              </button>
            ))}
            {onOpenThread ? (
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                className='size-7'
                onClick={() => onOpenThread(message)}
                aria-label='Reply in thread'
              >
                <Reply className='size-3.5' aria-hidden='true' />
              </Button>
            ) : null}
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  className='size-7'
                  aria-label='Message actions'
                >
                  {isDeleting ? (
                    <BarsSpinner size={11} />
                  ) : (
                    <MoreHorizontal className='size-3.5' aria-hidden='true' />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align='end' className='w-60 p-0'>
                <Command>
                  <CommandInput
                    placeholder='Search message actions…'
                    className='h-9'
                  />
                  <CommandList>
                    <CommandGroup>
                      {onOpenThread ? (
                        <CommandItem
                          value='Reply in thread'
                          onSelect={() => {
                            onOpenThread(message);
                            setMenuOpen(false);
                          }}
                        >
                          <Reply aria-hidden='true' />
                          Reply in thread
                        </CommandItem>
                      ) : null}
                      <CommandItem
                        value={displaySaved ? 'Remove from saved' : 'Save'}
                        onSelect={() => {
                          const next = !displaySaved;
                          setOptimisticSaved(next);
                          void onToggleSave?.(message.id, next);
                          setMenuOpen(false);
                        }}
                      >
                        {displaySaved ? (
                          <BookmarkCheck aria-hidden='true' />
                        ) : (
                          <Bookmark aria-hidden='true' />
                        )}
                        {displaySaved ? 'Remove from saved' : 'Save for later'}
                      </CommandItem>
                      <CommandItem
                        value={displayPinned ? 'Unpin' : 'Pin'}
                        onSelect={() => {
                          const next = !displayPinned;
                          setOptimisticPinned(next);
                          void onTogglePin?.(message.id, next);
                          setMenuOpen(false);
                        }}
                      >
                        {displayPinned ? (
                          <PinOff aria-hidden='true' />
                        ) : (
                          <Pin aria-hidden='true' />
                        )}
                        {displayPinned ? 'Unpin message' : 'Pin message'}
                      </CommandItem>
                      {message.canEdit && onEdit ? (
                        <CommandItem
                          value='Edit message'
                          onSelect={() => {
                            setEditBody(message.body);
                            setIsEditing(true);
                            setMenuOpen(false);
                          }}
                        >
                          <Pencil aria-hidden='true' />
                          Edit message
                        </CommandItem>
                      ) : null}
                      {message.canDelete && onDelete ? (
                        <CommandItem
                          value='Delete message'
                          className='text-destructive'
                          disabled={isDeleting}
                          onSelect={() => void deleteMessage()}
                        >
                          {isDeleting ? (
                            <BarsSpinner size={12} />
                          ) : (
                            <Trash2 aria-hidden='true' />
                          )}
                          Delete message
                        </CommandItem>
                      ) : null}
                    </CommandGroup>
                    {onLinkEntity ||
                    onCreateRequestFromMessage ||
                    onCreateWorkFromMessage ? (
                      <CommandGroup heading='Connect to work'>
                        {onCreateRequestFromMessage ? (
                          <CommandItem
                            value='Create request from message'
                            disabled={pendingCreate !== null}
                            onSelect={() => void createFromMessage('request')}
                          >
                            {pendingCreate === 'request' ? (
                              <BarsSpinner size={12} />
                            ) : (
                              <FileInput aria-hidden='true' />
                            )}
                            Create request
                          </CommandItem>
                        ) : null}
                        {onCreateWorkFromMessage ? (
                          <CommandItem
                            value='Create work from message'
                            disabled={pendingCreate !== null}
                            onSelect={() => void createFromMessage('work')}
                          >
                            {pendingCreate === 'work' ? (
                              <BarsSpinner size={12} />
                            ) : (
                              <BriefcaseBusiness aria-hidden='true' />
                            )}
                            Create work
                          </CommandItem>
                        ) : null}
                        {onLinkEntity
                          ? linkableEntities.slice(0, 5).map(entity => (
                              <CommandItem
                                key={entity.id}
                                value={`Link ${entity.type} ${entity.label} ${entity.title ?? ''}`}
                                onSelect={() => {
                                  if (
                                    !displayLinkedEntities.some(
                                      linked =>
                                        linked.type === entity.type &&
                                        linked.entityId === entity.entityId,
                                    )
                                  ) {
                                    setOptimisticLinkedEntities([
                                      ...displayLinkedEntities,
                                      entity,
                                    ]);
                                    void onLinkEntity(message.id, {
                                      type: entity.type,
                                      entityId: entity.entityId,
                                    });
                                  }
                                  setMenuOpen(false);
                                }}
                              >
                                <Link2 aria-hidden='true' />
                                <span className='min-w-0 flex-1 truncate'>
                                  Link {entity.label}
                                </span>
                              </CommandItem>
                            ))
                          : null}
                      </CommandGroup>
                    ) : null}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
      </article>
      <ConfirmDeleteDialog />
    </>
  );
}
