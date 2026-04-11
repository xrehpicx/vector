'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  Paperclip,
  ArrowUp,
  X,
  Settings2,
  ShieldCheck,
  Lightbulb,
} from 'lucide-react';
import type { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import { useMutation } from '@/lib/convex';
import { useCachedQuery } from '@/lib/convex';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BarsSpinner } from '@/components/bars-spinner';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AssistantInput,
  type AssistantInputHandle,
  type AssistantInputIssueMention,
  type MentionRef,
} from './assistant-input';

const MODEL_STORAGE_KEY = 'vector.assistant.model';
const SKIP_CONFIRM_STORAGE_KEY = 'vector.assistant.skip-confirmations';
const THINKING_STORAGE_KEY = 'vector.assistant.thinking';
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const FALLBACK_MODEL_OPTIONS = [
  {
    value: '',
    label: 'Workspace default',
    hint: 'Use the workspace OpenRouter default',
  },
  {
    value: 'moonshotai/kimi-k2.5:nitro',
    label: 'Kimi K2.5',
    hint: 'Fast general-purpose default',
  },
  {
    value: 'anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4',
    hint: 'Stronger reasoning and writing',
  },
  {
    value: 'openai/gpt-5-mini',
    label: 'GPT-5 Mini',
    hint: 'Compact OpenAI option',
  },
];

type ModelOption = { value: string; label: string; hint: string };

type AssistantComposerVariant = 'dock' | 'thread';

export type AssistantComposerAttachment = {
  id: string;
  storageId: Id<'_storage'>;
  filename: string;
  mediaType: string;
  size: number;
  previewUrl?: string;
};

export type AssistantComposerSubmitOptions = {
  attachments: AssistantComposerAttachment[];
  model?: string;
  skipConfirmations: boolean;
  thinkingLevel?: 'low' | 'medium' | 'high';
};

type QueuedSubmission = {
  text: string;
  mentions: MentionRef[];
  options: AssistantComposerSubmitOptions;
};

export type AssistantComposerHandle = {
  submit: () => Promise<void>;
  focus: () => void;
  insertIssueMention: (issue: AssistantInputIssueMention) => void;
};

type AssistantComposerProps = {
  orgSlug: string;
  placeholder?: string;
  disabled?: boolean;
  busy?: boolean;
  onSubmit: (
    text: string,
    mentions: MentionRef[],
    options: AssistantComposerSubmitOptions,
  ) => Promise<boolean> | boolean;
  onFocus?: () => void;
  variant?: AssistantComposerVariant;
  auxiliaryActions?: ReactNode;
  className?: string;
};

function formatBytes(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 102.4) / 10)} KB`;
  }
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
}

export const AssistantComposer = forwardRef<
  AssistantComposerHandle,
  AssistantComposerProps
>(function AssistantComposer(
  {
    orgSlug,
    placeholder = 'Ask anything...',
    disabled = false,
    busy = false,
    onSubmit,
    onFocus,
    variant = 'thread',
    auxiliaryActions,
    className,
  },
  ref,
) {
  const inputRef = useRef<AssistantInputHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<AssistantComposerAttachment[]>(
    [],
  );
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [model, setModel] = useState('');
  const [customModelDraft, setCustomModelDraft] = useState('');
  const [skipConfirmations, setSkipConfirmations] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<
    'off' | 'low' | 'medium' | 'high'
  >('off');
  const [modelOpen, setModelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queuedSubmission, setQueuedSubmission] =
    useState<QueuedSubmission | null>(null);
  const prevBusyRef = useRef(busy);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);
  const attachmentIdPrefix = useId();
  const attachmentsRef = useRef<AssistantComposerAttachment[]>([]);
  const generateAttachmentUploadUrl = useMutation(
    api.ai.mutations.generateAttachmentUploadUrl,
  );

  // Load admin-configured models
  const adminModels = useCachedQuery(
    api.platformAdmin.queries.getAssistantModels,
  );

  const modelOptions: ModelOption[] = useMemo(() => {
    const adminModelList = adminModels?.models;
    const adminDefault = adminModels?.defaultModel;

    const defaultName = adminDefault
      ? adminModelList?.find(m => m.modelId === adminDefault)?.name
      : undefined;

    const workspaceDefault: ModelOption = {
      value: '',
      label: 'Workspace default',
      hint: defaultName
        ? `Uses ${defaultName}`
        : 'Use the workspace OpenRouter default',
    };

    if (adminModelList && adminModelList.length > 0) {
      return [
        workspaceDefault,
        ...adminModelList.map(m => ({
          value: m.modelId,
          label: m.name,
          hint: m.hint ?? m.modelId,
        })),
      ];
    }

    return FALLBACK_MODEL_OPTIONS;
  }, [adminModels]);

  function modelLabel(value: string) {
    const builtIn = modelOptions.find(option => option.value === value);
    if (builtIn) return builtIn.label;
    if (!value.trim()) return 'Workspace default';
    return value;
  }

  useEffect(() => {
    const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (storedModel) {
      setModel(storedModel);
      setCustomModelDraft(storedModel);
    }

    setSkipConfirmations(
      window.localStorage.getItem(SKIP_CONFIRM_STORAGE_KEY) === 'true',
    );
    const storedThinking = window.localStorage.getItem(THINKING_STORAGE_KEY);
    if (
      storedThinking === 'low' ||
      storedThinking === 'medium' ||
      storedThinking === 'high'
    ) {
      setThinkingLevel(storedThinking);
    }
  }, []);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      }
    };
  }, []);

  const persistModel = useCallback((nextModel: string) => {
    setModel(nextModel);
    if (nextModel) {
      window.localStorage.setItem(MODEL_STORAGE_KEY, nextModel);
    } else {
      window.localStorage.removeItem(MODEL_STORAGE_KEY);
    }
  }, []);

  const handleToggleSkipConfirmations = useCallback(() => {
    setSkipConfirmations(current => {
      const next = !current;
      window.localStorage.setItem(
        SKIP_CONFIRM_STORAGE_KEY,
        next ? 'true' : 'false',
      );
      return next;
    });
  }, []);

  const handleCycleThinking = useCallback(() => {
    setThinkingLevel(current => {
      const order = ['off', 'low', 'medium', 'high'] as const;
      const nextIndex = (order.indexOf(current) + 1) % order.length;
      const next = order[nextIndex];
      if (next === 'off') {
        window.localStorage.removeItem(THINKING_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THINKING_STORAGE_KEY, next);
      }
      return next;
    });
  }, []);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setAttachments(current => {
      const target = current.find(item => item.id === attachmentId);
      if (target?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter(item => item.id !== attachmentId);
    });
  }, []);

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length === 0) return;

      setIsUploadingAttachment(true);
      try {
        const uploadUrl = await generateAttachmentUploadUrl({ orgSlug });
        const uploaded: AssistantComposerAttachment[] = [];

        for (const [index, file] of files.entries()) {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            throw new Error(
              `${file.name} is larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
            );
          }

          const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: file,
          });

          if (!response.ok) {
            throw new Error(`Failed to upload ${file.name}`);
          }

          const { storageId } = (await response.json()) as {
            storageId: Id<'_storage'>;
          };

          uploaded.push({
            id: `${attachmentIdPrefix}-${Date.now()}-${index}`,
            storageId,
            filename: file.name,
            mediaType: file.type || 'application/octet-stream',
            size: file.size,
            previewUrl: file.type.startsWith('image/')
              ? URL.createObjectURL(file)
              : undefined,
          });
        }

        setAttachments(current => [...current, ...uploaded]);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Attachment upload failed',
        );
      } finally {
        setIsUploadingAttachment(false);
      }
    },
    [attachmentIdPrefix, generateAttachmentUploadUrl, orgSlug],
  );

  const handleSubmit = useCallback(
    async (text: string, mentions: MentionRef[]) => {
      const options: AssistantComposerSubmitOptions = {
        attachments,
        model: model.trim() || undefined,
        skipConfirmations,
        thinkingLevel: thinkingLevel !== 'off' ? thinkingLevel : undefined,
      };

      // Queue the submission if the assistant is still working on the
      // previous turn. The queued message auto-fires when busy flips to
      // false (see effect below). Attachments are transferred to the queue
      // slot so the user can keep attaching new files to their next turn.
      if (busy) {
        setQueuedSubmission(prev => {
          if (prev) {
            for (const attachment of prev.options.attachments) {
              if (attachment.previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(attachment.previewUrl);
              }
            }
          }
          return { text, mentions, options };
        });
        setAttachments([]);
        return true;
      }

      const shouldClear = await onSubmit(text, mentions, options);

      if (shouldClear !== false) {
        for (const attachment of attachments) {
          if (attachment.previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        }
        setAttachments([]);
      }

      return shouldClear;
    },
    [attachments, busy, model, onSubmit, skipConfirmations, thinkingLevel],
  );

  // Auto-fire the queued submission when the assistant becomes idle again.
  // We only trigger on the busy-true → busy-false transition so we don't
  // race against the user manually clearing the queue while idle.
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (!wasBusy || busy || !queuedSubmission || disabled) return;

    const queued = queuedSubmission;
    setQueuedSubmission(null);
    void onSubmitRef.current(queued.text, queued.mentions, queued.options);
  }, [busy, disabled, queuedSubmission]);

  const handleCancelQueue = useCallback(() => {
    setQueuedSubmission(prev => {
      if (prev) {
        for (const attachment of prev.options.attachments) {
          if (attachment.previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        }
      }
      return null;
    });
  }, []);

  // `canType` gates the editor and send button. The send button stays
  // enabled while busy so the user can queue a follow-up turn without
  // waiting for the assistant to finish streaming.
  const canType = !disabled && !isUploadingAttachment;
  // `canConfigure` gates toolbar controls that should only change on a new
  // turn (model picker, attach button). Keeping them frozen while busy
  // avoids accidentally mutating the in-flight request's attachments.
  const canConfigure = !disabled && !busy && !isUploadingAttachment;
  const canInteract = canConfigure;
  const triggerLabel = useMemo(() => modelLabel(model), [model, modelOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(
    ref,
    () => ({
      submit: () => inputRef.current?.submit() ?? Promise.resolve(),
      focus: () => inputRef.current?.focus(),
      insertIssueMention: issue => inputRef.current?.insertIssueMention(issue),
    }),
    [],
  );

  const toolbarButtonClass =
    variant === 'dock'
      ? 'h-6 gap-1.5 rounded-md px-2 text-[11px]'
      : 'h-7 gap-1.5 rounded-md px-2.5 text-xs';
  const iconButtonClass =
    variant === 'dock' ? 'size-6 rounded-md p-0' : 'size-7 rounded-md p-0';
  const sendButtonClass =
    variant === 'dock' ? 'size-7 rounded-md p-0' : 'size-8 rounded-md p-0';
  const inputClass =
    variant === 'dock'
      ? 'min-h-8 flex-1 px-2 py-1.5 text-xs'
      : 'min-h-10 flex-1 px-3 py-2 text-sm';

  // ── Toolbar content (shared between inline and popover) ────────────

  const toolbarContent = (
    <>
      <input
        ref={fileInputRef}
        type='file'
        className='hidden'
        multiple
        onChange={event => void handleFileSelect(event)}
        accept='image/*,.txt,.md,.json,.csv,.pdf,.js,.ts,.tsx,.jsx,.py,.go,.rs,.sh'
      />
      <Button
        type='button'
        size='sm'
        variant='ghost'
        className={toolbarButtonClass}
        disabled={!canInteract}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploadingAttachment ? (
          <Loader2 className='size-3 animate-spin' />
        ) : (
          <Paperclip className='size-3' />
        )}
        Attach
      </Button>

      <Popover open={modelOpen} onOpenChange={setModelOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className={cn(toolbarButtonClass, 'min-w-0 justify-between')}
            disabled={!canInteract}
          >
            <span className='truncate'>{triggerLabel}</span>
            <ChevronDown className='size-3 shrink-0' />
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='w-[320px] p-0'>
          <Command>
            <CommandInput placeholder='Search model...' className='h-9' />
            <CommandList>
              <CommandEmpty>No models found.</CommandEmpty>
              <CommandGroup>
                {modelOptions.map(option => (
                  <CommandItem
                    key={option.label}
                    value={`${option.label} ${option.value} ${option.hint}`}
                    onSelect={() => {
                      persistModel(option.value);
                      setCustomModelDraft(option.value);
                      setModelOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-3.5',
                        model === option.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-xs'>{option.label}</div>
                      <div className='text-muted-foreground truncate text-[10px]'>
                        {option.hint}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <div className='border-border/60 space-y-2 border-t p-2'>
            <div className='text-muted-foreground text-[10px] tracking-[0.12em] uppercase'>
              Custom model ID
            </div>
            <div className='flex items-center gap-1.5'>
              <Input
                value={customModelDraft}
                onChange={event => setCustomModelDraft(event.target.value)}
                placeholder='openrouter/model-id'
                className='h-8 text-xs'
              />
              <Button
                type='button'
                size='sm'
                className='h-8 px-2 text-xs'
                onClick={() => {
                  persistModel(customModelDraft.trim());
                  setModelOpen(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className={cn(
              iconButtonClass,
              thinkingLevel !== 'off' &&
                'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400',
            )}
            onClick={handleCycleThinking}
          >
            <Lightbulb
              className={cn(variant === 'dock' ? 'size-3' : 'size-3.5')}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          Thinking:{' '}
          {thinkingLevel === 'off'
            ? 'Off'
            : thinkingLevel.charAt(0).toUpperCase() + thinkingLevel.slice(1)}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className={cn(
              iconButtonClass,
              'ml-auto',
              skipConfirmations &&
                'bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400',
            )}
            onClick={handleToggleSkipConfirmations}
          >
            <ShieldCheck
              className={cn(variant === 'dock' ? 'size-3' : 'size-3.5')}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          {skipConfirmations
            ? 'Skip confirmations: On'
            : 'Skip confirmations: Off'}
        </TooltipContent>
      </Tooltip>
    </>
  );

  return (
    <div
      className={cn(
        'border-border/60 bg-background/80 overflow-hidden rounded-lg border',
        variant === 'thread' && 'backdrop-blur-sm',
        className,
      )}
    >
      {/* Attachments bar */}
      {attachments.length > 0 ? (
        <div className='border-border/50 flex flex-wrap gap-1.5 border-b px-2 py-2'>
          {attachments.map(attachment => (
            <div
              key={attachment.id}
              className='bg-muted/40 flex max-w-full items-center gap-2 rounded-md border px-2 py-1'
            >
              {attachment.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachment.previewUrl}
                  alt={attachment.filename}
                  className='size-8 rounded object-cover'
                />
              ) : (
                <div className='bg-background flex size-8 items-center justify-center rounded border'>
                  <FileText className='text-muted-foreground size-3.5' />
                </div>
              )}
              <div className='min-w-0'>
                <div className='max-w-[180px] truncate text-xs font-medium'>
                  {attachment.filename}
                </div>
                <div className='text-muted-foreground text-[10px]'>
                  {formatBytes(attachment.size)}
                </div>
              </div>
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground shrink-0'
                onClick={() => handleRemoveAttachment(attachment.id)}
                aria-label={`Remove ${attachment.filename}`}
              >
                <X className='size-3.5' />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Queued message indicator — shown while the assistant is still
          working on the previous turn and the user has queued a follow-up. */}
      {queuedSubmission ? (
        <div className='border-border/50 bg-muted/30 flex items-center gap-2 border-b px-3 py-1'>
          <Clock className='text-muted-foreground size-3 shrink-0' />
          <div className='min-w-0 flex-1 text-[11px] leading-4'>
            <span className='text-muted-foreground'>Queued · </span>
            <span className='truncate'>
              {queuedSubmission.text.trim() ||
                `${queuedSubmission.options.attachments.length} attachment${
                  queuedSubmission.options.attachments.length === 1 ? '' : 's'
                }`}
            </span>
          </div>
          <button
            type='button'
            onClick={handleCancelQueue}
            className='text-muted-foreground/60 hover:text-foreground shrink-0 transition-colors'
            aria-label='Cancel queued message'
          >
            <X className='size-3' />
          </button>
        </div>
      ) : null}

      {/* Input row */}
      <div className='flex items-center gap-1'>
        <AssistantInput
          ref={inputRef}
          orgSlug={orgSlug}
          onSubmit={handleSubmit}
          onFocus={onFocus}
          disabled={!canType}
          hasExternalContent={attachments.length > 0}
          className={inputClass}
          placeholder={
            busy && !queuedSubmission
              ? 'Ask anything (will queue until the current turn finishes)'
              : placeholder
          }
        />
        <div className='flex shrink-0 items-center gap-0.5 pr-1'>
          {auxiliaryActions}
          <Button
            type='button'
            size='sm'
            className={sendButtonClass}
            disabled={!canType || !!queuedSubmission}
            onClick={() => inputRef.current?.submit()}
          >
            {isUploadingAttachment ? (
              <Loader2 className='size-3 animate-spin' />
            ) : busy && !queuedSubmission ? (
              <BarsSpinner size={variant === 'dock' ? 10 : 12} />
            ) : (
              <ArrowUp
                className={cn(variant === 'dock' ? 'size-2.5' : 'size-3.5')}
              />
            )}
          </Button>
        </div>
      </div>

      {/* Toolbar — below input for thread, behind a settings icon for dock */}
      {variant === 'dock' ? (
        <div className='border-border/50 flex items-center border-t px-1 py-0.5'>
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                className='h-5 gap-1 rounded px-1.5 text-[10px]'
              >
                <Settings2 className='size-3' />
                <span className='text-muted-foreground'>Options</span>
                {(skipConfirmations || thinkingLevel !== 'off' || model) && (
                  <span className='bg-primary size-1.5 rounded-full' />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align='start'
              sideOffset={8}
              className='w-auto min-w-[280px] p-0'
            >
              <div className='flex flex-wrap items-center gap-1 p-1.5'>
                {toolbarContent}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <div className='border-border/50 flex flex-wrap items-center gap-1 border-t px-1.5 py-1'>
          {toolbarContent}
        </div>
      )}
    </div>
  );
});
