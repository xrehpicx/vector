'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUp,
  AtSign,
  Bot,
  File,
  FileAudio,
  FileImage,
  FileVideo,
  Link2,
  Paperclip,
  SmilePlus,
  X,
} from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AgentAvatar, AgentOwnerLabel } from './agent-presence';
import type {
  CollaborationAgent,
  CollaborationDraftAttachment,
  CollaborationMention,
  CollaborationUser,
  SendCollaborationMessageInput,
} from './types';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_SUGGESTIONS = 5;

function attachmentKind(file: File): CollaborationDraftAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function DraftAttachmentIcon({
  kind,
}: {
  kind: CollaborationDraftAttachment['kind'];
}) {
  const Icon =
    kind === 'image'
      ? FileImage
      : kind === 'video'
        ? FileVideo
        : kind === 'audio'
          ? FileAudio
          : File;
  return <Icon className='size-4' aria-hidden='true' />;
}

interface MessageComposerProps {
  channelName: string;
  currentUser?: CollaborationUser | null;
  users: CollaborationUser[];
  agents: CollaborationAgent[];
  disabled?: boolean;
  disabledReason?: string;
  threadRootId?: string;
  replyToMessageId?: string;
  initialValue?: string;
  submitLabel?: string;
  compact?: boolean;
  onSend: (input: SendCollaborationMessageInput) => Promise<void> | void;
  onTyping?: (threadRootId?: string) => Promise<void> | void;
  onTypingChange?: (typing: boolean, threadRootId?: string) => void;
}

export function MessageComposer({
  channelName,
  users,
  agents,
  disabled,
  disabledReason,
  threadRootId,
  replyToMessageId,
  initialValue = '',
  submitLabel = 'Send message',
  compact = false,
  onSend,
  onTyping,
  onTypingChange,
}: MessageComposerProps) {
  const textareaId = useId();
  const fileInputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentsRef = useRef<CollaborationDraftAttachment[]>([]);
  const pendingAttachmentsRef = useRef(
    new Map<string, CollaborationDraftAttachment[]>(),
  );
  const submitLockRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);
  const [body, setBody] = useState(initialValue);
  const [mentions, setMentions] = useState<CollaborationMention[]>([]);
  const [attachments, setAttachments] = useState<
    CollaborationDraftAttachment[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState(0);

  const mentionMatch = useMemo(() => {
    const cursor = textareaRef.current?.selectionStart ?? body.length;
    const prefix = body.slice(0, cursor);
    const match = prefix.match(/(^|\s)@([a-zA-Z0-9._-]*)$/);
    if (!match) return null;
    return {
      query: match[2].toLowerCase(),
      start: cursor - match[2].length - 1,
      end: cursor,
    };
  }, [body]);

  const suggestions = useMemo(() => {
    if (!mentionMatch) return [];
    const userSuggestions = users
      .filter(user => {
        const search = `${user.name} ${user.email ?? ''}`.toLowerCase();
        return search.includes(mentionMatch.query);
      })
      .map(user => ({
        type: 'user' as const,
        id: user.id,
        label: user.name,
        subtitle: user.email ?? 'Workspace member',
        user,
      }));
    const agentSuggestions = agents
      .filter(agent => {
        const search =
          `${agent.name} ${agent.handle} ${agent.owner.name}`.toLowerCase();
        return search.includes(mentionMatch.query);
      })
      .map(agent => ({
        type: 'agent' as const,
        id: agent.id,
        label: agent.handle,
        subtitle: `Agent · owned by ${agent.owner.name}`,
        agent,
      }));
    return [...agentSuggestions, ...userSuggestions].slice(0, MAX_SUGGESTIONS);
  }, [agents, mentionMatch, users]);

  useEffect(() => {
    setActiveSuggestion(0);
  }, [mentionMatch?.query]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 176)}px`;
  }, [body, compact]);

  useEffect(() => {
    const pendingAttachments = pendingAttachmentsRef.current;
    return () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      for (const pendingDraft of pendingAttachments.values()) {
        for (const attachment of pendingDraft) {
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        }
      }
      pendingAttachments.clear();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingActiveRef.current) onTypingChange?.(false, threadRootId);
    };
  }, [onTypingChange, threadRootId]);

  const insertMention = useCallback(
    (suggestion: (typeof suggestions)[number]) => {
      if (!mentionMatch) return;
      const mentionText = `@${suggestion.label} `;
      const nextBody =
        body.slice(0, mentionMatch.start) +
        mentionText +
        body.slice(mentionMatch.end);
      const nextCursor = mentionMatch.start + mentionText.length;
      setBody(nextBody);
      setMentions(current => {
        if (
          current.some(
            mention =>
              mention.id === suggestion.id && mention.type === suggestion.type,
          )
        ) {
          return current;
        }
        return [
          ...current,
          {
            type: suggestion.type,
            id: suggestion.id,
            label: suggestion.label,
          },
        ];
      });
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [body, mentionMatch],
  );

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const oversized = selectedFiles.find(
      file => file.size > MAX_ATTACHMENT_BYTES,
    );
    if (oversized) {
      setError(
        `${oversized.name} is larger than 25 MB. Choose a smaller file.`,
      );
      return;
    }

    setAttachments(current => {
      const available = Math.max(0, MAX_ATTACHMENTS - current.length);
      if (selectedFiles.length > available) {
        setError(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
      } else {
        setError(null);
      }
      const next = selectedFiles.slice(0, available).map(file => {
        const kind = attachmentKind(file);
        return {
          id: crypto.randomUUID(),
          file,
          kind,
          previewUrl:
            kind === 'image' || kind === 'video'
              ? URL.createObjectURL(file)
              : undefined,
        };
      });
      return [...current, ...next];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(current => {
      const removed = current.find(item => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter(item => item.id !== id);
    });
  }, []);

  const reportTyping = useCallback(() => {
    if (!onTyping && !onTypingChange) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingChange?.(true, threadRootId);
      void onTyping?.(threadRootId);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      onTypingChange?.(false, threadRootId);
    }, 2000);
  }, [onTyping, onTypingChange, threadRootId]);

  const submit = useCallback(() => {
    const trimmed = body.trim();
    if (
      (!trimmed && attachments.length === 0) ||
      submitLockRef.current ||
      disabled
    ) {
      return;
    }

    submitLockRef.current = true;
    setError(null);
    const clientMessageId = crypto.randomUUID();
    const draftAttachments = attachments;
    const activeMentions = mentions.filter(mention => {
      const pattern = new RegExp(
        `(^|\\s)@${escapeRegExp(mention.label)}(?=\\s|$|[.,!?;:])`,
      );
      return pattern.test(trimmed);
    });

    pendingAttachmentsRef.current.set(clientMessageId, draftAttachments);
    setBody('');
    setMentions([]);
    setAttachments([]);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingActiveRef.current = false;
    onTypingChange?.(false, threadRootId);
    textareaRef.current?.focus();

    let sendPromise: Promise<void>;
    try {
      sendPromise = Promise.resolve(
        onSend({
          clientMessageId,
          body: trimmed,
          mentions: activeMentions,
          attachments: draftAttachments.map(attachment => attachment.file),
          threadRootId,
          replyToMessageId,
        }),
      );
    } catch (sendError) {
      sendPromise = Promise.reject(sendError);
    }

    void sendPromise
      .then(() => {
        const sentAttachments =
          pendingAttachmentsRef.current.get(clientMessageId) ?? [];
        for (const attachment of sentAttachments) {
          if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        }
        pendingAttachmentsRef.current.delete(clientMessageId);
      })
      .catch(() => {
        pendingAttachmentsRef.current.delete(clientMessageId);
        setBody(current => {
          if (!current.trim()) return trimmed;
          if (!trimmed) return current;
          return `${trimmed}\n${current}`;
        });
        setMentions(current => {
          const restored = [...activeMentions];
          for (const mention of current) {
            if (
              !restored.some(
                item => item.id === mention.id && item.type === mention.type,
              )
            ) {
              restored.push(mention);
            }
          }
          return restored;
        });
        setAttachments(current => {
          const restored = [
            ...draftAttachments,
            ...current.filter(
              item =>
                !draftAttachments.some(
                  draftAttachment => draftAttachment.id === item.id,
                ),
            ),
          ];
          const kept = restored.slice(0, MAX_ATTACHMENTS);
          for (const discarded of restored.slice(MAX_ATTACHMENTS)) {
            if (discarded.previewUrl) {
              URL.revokeObjectURL(discarded.previewUrl);
            }
          }
          return kept;
        });
        setError('Message was not sent. Your draft has been restored.');
      });

    requestAnimationFrame(() => {
      submitLockRef.current = false;
    });
  }, [
    attachments,
    body,
    disabled,
    mentions,
    onSend,
    onTypingChange,
    replyToMessageId,
    threadRootId,
  ]);

  const suggestionsOpen = Boolean(mentionMatch && suggestions.length > 0);

  return (
    <div
      className={cn(
        'relative px-2 pb-2 sm:px-4 sm:pb-4',
        compact && 'px-3 pb-3',
        disabled && 'opacity-70',
      )}
    >
      {suggestionsOpen ? (
        <div
          id={`${textareaId}-mentions`}
          role='listbox'
          aria-label='Mention suggestions'
          className='bg-popover ring-foreground/10 absolute right-3 bottom-full left-3 z-30 mb-1 max-h-64 overflow-y-auto rounded-lg p-1 shadow-md ring-1'
        >
          <p className='text-muted-foreground px-2 py-1 text-xs font-medium'>
            People and agents
          </p>
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.id}`}
              type='button'
              role='option'
              aria-selected={activeSuggestion === index}
              onMouseDown={event => {
                event.preventDefault();
                insertMention(suggestion);
              }}
              onMouseEnter={() => setActiveSuggestion(index)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                activeSuggestion === index && 'bg-muted',
              )}
            >
              {suggestion.type === 'user' ? (
                <UserAvatar
                  name={suggestion.user.name}
                  email={suggestion.user.email}
                  image={suggestion.user.image}
                  userId={suggestion.user.id}
                  size='sm'
                />
              ) : (
                <AgentAvatar agent={suggestion.agent} size='sm' />
              )}
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-sm font-medium'>
                  {suggestion.type === 'agent' ? '@' : ''}
                  {suggestion.label}
                </span>
                <span className='text-muted-foreground block truncate text-xs'>
                  {suggestion.subtitle}
                </span>
              </span>
              {suggestion.type === 'agent' ? (
                <Bot
                  className='text-muted-foreground size-3.5 shrink-0'
                  aria-hidden='true'
                />
              ) : (
                <AtSign
                  className='text-muted-foreground size-3.5 shrink-0'
                  aria-hidden='true'
                />
              )}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          'border-border/70 bg-background overflow-hidden rounded-xl border shadow-xs',
          'transition-[border-color,box-shadow,background-color] duration-150 ease-out',
          'focus-within:border-ring/60 focus-within:ring-ring/10 focus-within:shadow-sm focus-within:ring-2',
          error && 'border-destructive',
        )}
      >
        {attachments.length > 0 ? (
          <div
            className='flex gap-2 overflow-x-auto px-2.5 pt-2.5 pb-0.5'
            aria-label='Attachments to send'
          >
            {attachments.map(attachment => (
              <div
                key={attachment.id}
                className='border-border/70 bg-muted/30 relative flex h-18 w-32 shrink-0 overflow-hidden rounded-lg border'
              >
                {attachment.previewUrl && attachment.kind === 'image' ? (
                  <Image
                    src={attachment.previewUrl}
                    alt={`Preview of ${attachment.file.name}`}
                    width={128}
                    height={72}
                    unoptimized
                    className='size-full object-cover outline -outline-offset-1 outline-black/10 dark:outline-white/10'
                  />
                ) : attachment.previewUrl && attachment.kind === 'video' ? (
                  <video
                    src={attachment.previewUrl}
                    muted
                    playsInline
                    preload='metadata'
                    aria-label={`Preview of ${attachment.file.name}`}
                    className='size-full bg-black object-contain outline -outline-offset-1 outline-black/10 dark:outline-white/10'
                  />
                ) : (
                  <div className='flex min-w-0 flex-1 items-center gap-2 p-2'>
                    <DraftAttachmentIcon kind={attachment.kind} />
                    <div className='min-w-0'>
                      <p className='truncate text-xs font-medium'>
                        {attachment.file.name}
                      </p>
                      <p className='text-muted-foreground text-[10px] leading-4 tabular-nums'>
                        {formatFileSize(attachment.file.size)}
                      </p>
                    </div>
                  </div>
                )}
                <Button
                  type='button'
                  variant='secondary'
                  size='icon-xs'
                  className='absolute top-1 right-1 shadow-xs transition-[background-color,color,transform,box-shadow] active:scale-[0.96]'
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`Remove ${attachment.file.name}`}
                >
                  <X className='size-3' aria-hidden='true' />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <label htmlFor={textareaId} className='sr-only'>
          Message {channelName}
        </label>
        <div className='flex min-w-0 flex-nowrap items-center gap-0.5 p-2'>
          <input
            id={fileInputId}
            type='file'
            multiple
            className='hidden'
            disabled={disabled}
            accept='image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip'
            onChange={event => {
              handleFiles(event.target.files);
              event.currentTarget.value = '';
            }}
          />
          <textarea
            ref={textareaRef}
            id={textareaId}
            value={body}
            name='message'
            rows={1}
            disabled={disabled}
            aria-describedby={
              error
                ? `${textareaId}-error`
                : suggestionsOpen
                  ? `${textareaId}-mentions`
                  : undefined
            }
            aria-controls={
              suggestionsOpen ? `${textareaId}-mentions` : undefined
            }
            aria-autocomplete='list'
            placeholder={
              disabled
                ? (disabledReason ?? 'You cannot send messages here.')
                : `Message #${channelName}`
            }
            onChange={event => {
              setBody(event.target.value);
              setError(null);
              reportTyping();
            }}
            onKeyDown={event => {
              if (suggestionsOpen) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveSuggestion(current =>
                    Math.min(current + 1, suggestions.length - 1),
                  );
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveSuggestion(current => Math.max(current - 1, 0));
                  return;
                }
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !(event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault();
                  insertMention(suggestions[activeSuggestion]);
                  return;
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  const cursor = event.currentTarget.selectionStart;
                  setBody(
                    current =>
                      `${current.slice(0, Math.max(0, cursor - 1))} ${current.slice(cursor)}`,
                  );
                  return;
                }
              }
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit();
              }
            }}
            className={cn(
              'placeholder:text-muted-foreground/75 max-h-44 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-base leading-6 outline-none sm:min-h-9 sm:py-1.5 sm:text-sm',
              compact && 'min-h-9',
            )}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                className='text-muted-foreground hover:text-foreground size-10 transition-[background-color,color,transform] active:scale-[0.96] sm:size-7'
                onClick={() => document.getElementById(fileInputId)?.click()}
                disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
                aria-label='Attach files'
              >
                <Paperclip
                  className='size-[18px] sm:size-3.5'
                  aria-hidden='true'
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top'>Attach files</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                className='text-muted-foreground hover:text-foreground size-10 transition-[background-color,color,transform] active:scale-[0.96] sm:size-7'
                disabled={disabled}
                aria-label='Add a link'
                onClick={() => {
                  setBody(
                    current =>
                      `${current}${
                        current && !/\s$/.test(current) ? ' ' : ''
                      }https://`,
                  );
                  textareaRef.current?.focus();
                }}
              >
                <Link2 className='size-[18px] sm:size-3.5' aria-hidden='true' />
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top'>Add link</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                className='text-muted-foreground hover:text-foreground size-10 transition-[background-color,color,transform] active:scale-[0.96] sm:size-7'
                disabled={disabled}
                aria-label='Add an emoji'
                onClick={() => {
                  setBody(current => `${current}🙂`);
                  textareaRef.current?.focus();
                }}
              >
                <SmilePlus
                  className='size-[18px] sm:size-3.5'
                  aria-hidden='true'
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top'>Add emoji</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                size='icon-sm'
                className={cn(
                  'ml-auto size-10 rounded-xl shadow-xs sm:size-7 sm:rounded-lg',
                  'transition-[background-color,color,transform,box-shadow] active:scale-[0.96]',
                  'disabled:bg-muted disabled:text-muted-foreground/45 disabled:opacity-100 disabled:shadow-none',
                )}
                onClick={() => void submit()}
                disabled={
                  disabled || (!body.trim() && attachments.length === 0)
                }
                aria-label={submitLabel}
                aria-keyshortcuts='Enter'
              >
                <ArrowUp
                  className='size-[18px] sm:size-3.5'
                  aria-hidden='true'
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top'>{submitLabel} · Enter</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        id={`${textareaId}-error`}
        role='status'
        aria-live='polite'
        className={cn(
          'text-destructive min-h-4 px-1 pt-0.5 text-xs',
          !error && 'sr-only',
        )}
      >
        {error ?? ''}
      </div>

      {agents.length > 0 && !compact ? (
        <div className='text-muted-foreground flex min-w-0 items-center gap-1 px-1 text-[10px]'>
          <Bot className='size-3 shrink-0' aria-hidden='true' />
          <span className='truncate'>
            Tag{' '}
            {agents.slice(0, 2).map((agent, index) => (
              <span key={agent.id}>
                {index > 0 ? ' or ' : ''}
                <span className='text-foreground'>@{agent.handle}</span>
                <span className='sr-only'>
                  {' '}
                  <AgentOwnerLabel agent={agent} />
                </span>
              </span>
            ))}{' '}
            to delegate work.
          </span>
        </div>
      ) : null}
    </div>
  );
}
