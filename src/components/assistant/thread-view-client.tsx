'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useRouter } from 'nextjs-toploader/app';
import { useConvexAuth } from 'convex/react';
import { useQuery, useMutation, useAction } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  AssistantInput,
  type AssistantInputHandle,
  type MentionRef,
} from './assistant-input';
import { BarsSpinner } from '@/components/bars-spinner';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Globe,
  Building,
  Loader2,
  Lock,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {
  type UIMessage,
  optimisticallySendMessage,
  useUIMessages,
} from '@convex-dev/agent/react';
import { resolveAssistantPageContext } from '@/lib/assistant-context';
import { useAssistantActions } from '@/hooks/use-assistant-actions';
import { useConfirm } from '@/hooks/use-confirm';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AssistantDockMessage } from './assistant-message-renderer';
import { ProgressiveBlur } from '@/components/ui/progressive-blur';
import { Skeleton } from '@/components/ui/skeleton';

type PendingAction = {
  id: string;
  kind?: 'delete_entity' | 'bulk_delete_entities';
  entityType: 'document' | 'issue' | 'project' | 'team';
  entityLabel?: string;
  entities?: Array<{ entityId: string; entityLabel: string }>;
  summary: string;
};

function ThreadLoadingSkeleton() {
  return (
    <div className='bg-background relative flex h-full min-h-0 overflow-hidden'>
      {/* Header skeleton */}
      <div className='absolute top-0 right-0 left-0 z-50 p-2 px-2'>
        <ProgressiveBlur
          direction='top'
          blurLayers={10}
          blurIntensity={0.8}
          bgGradient
          className='pointer-events-none absolute inset-0 h-20'
        />
        <div className='relative z-[100] flex items-center justify-between gap-1'>
          <div className='flex items-center gap-2'>
            <Skeleton className='h-8 w-8 rounded-md' />
            <Skeleton className='h-4 w-32' />
          </div>
          <div className='flex items-center gap-1'>
            <Skeleton className='h-8 w-8 rounded-md' />
          </div>
        </div>
      </div>

      {/* Messages skeleton */}
      <div className='mx-auto min-h-0 w-full max-w-[700px] flex-1 space-y-6 overflow-y-auto px-4 pt-20 pb-32'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='space-y-3'>
            <div className='flex items-start gap-3'>
              <div className='flex-1 space-y-2'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-3/4' />
                <Skeleton className='h-4 w-1/2' />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input skeleton */}
      <div className='absolute right-0 bottom-0 left-0 z-10 px-4 pt-8 pb-4'>
        <ProgressiveBlur
          direction='bottom'
          blurLayers={6}
          blurIntensity={0.3}
          className='pointer-events-none absolute inset-0'
        />
        <div className='relative mx-auto max-w-[700px]'>
          <Skeleton className='h-12 w-full rounded-lg' />
        </div>
      </div>
    </div>
  );
}

export function ThreadViewClient() {
  const { orgSlug, threadId: threadIdParam } = useParams<{
    orgSlug: string;
    threadId: string;
  }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  useAssistantActions(orgSlug);

  const pageContext = useMemo(
    () =>
      resolveAssistantPageContext({
        orgSlug,
        pathname,
        searchParams,
      }),
    [orgSlug, pathname, searchParams],
  );

  const isReady = isAuthenticated && !authLoading;
  const assistantThreadId = threadIdParam as Id<'assistantThreads'>;

  // Fetch the thread
  const threadQuery = useQuery(
    api.ai.queries.getThreadById,
    isReady ? { threadId: assistantThreadId } : 'skip',
  );
  const threadRow = threadQuery.data;

  // Set as active thread on mount
  const setActiveThread = useMutation(api.ai.mutations.setActiveThread);
  const hasSetActive = useRef(false);
  useEffect(() => {
    if (isReady && threadRow && !hasSetActive.current) {
      hasSetActive.current = true;
      void setActiveThread({ orgSlug, threadId: assistantThreadId });
    }
  }, [isReady, threadRow, orgSlug, assistantThreadId, setActiveThread]);

  // Thread operations
  const updateThread = useMutation(api.ai.mutations.updateThread);
  const sendMessage = useMutation(
    api.ai.mutations.sendMessage,
  ).withOptimisticUpdate((store, args) => {
    if (!threadRow?.threadId) return;
    optimisticallySendMessage(api.ai.queries.listThreadMessages)(store, {
      threadId: threadRow.threadId,
      prompt: args.prompt,
    });
  });
  const clearThread = useAction(api.ai.actions.clearThreadHistory);
  const executeConfirmedAction = useMutation(
    api.ai.mutations.executeConfirmedAction,
  );
  const cancelPendingAction = useMutation(api.ai.mutations.cancelPendingAction);

  // Messages
  const agentThreadId = threadRow?.threadId;
  const uiMessages = useUIMessages(
    api.ai.queries.listThreadMessages,
    isReady && agentThreadId ? { threadId: agentThreadId } : 'skip',
    {
      initialNumItems: 40,
      stream: true,
    },
  );
  const messages = useMemo(
    () => (uiMessages.results ?? []) as UIMessage[],
    [uiMessages.results],
  );

  const pendingAction = (threadRow?.pendingAction ??
    null) as PendingAction | null;
  const hasMessages = messages.length > 0;

  // UI state
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [confirmAction, ConfirmDialog] = useConfirm();
  const inputRef = useRef<AssistantInputHandle>(null);

  const isAssistantActive =
    isSending ||
    threadRow?.threadStatus === 'pending' ||
    messages.some(message => message.status === 'streaming');

  // --- Scroll management ---
  const contentRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const prevMessageCountRef = useRef(0);
  const needsInitialScrollRef = useRef(true);
  const shouldAutoFollowRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);

  const getViewport = useCallback((): HTMLElement | null => {
    if (viewportRef.current) return viewportRef.current;
    const base = contentRef.current ?? endRef.current;
    if (!base) return null;
    return base.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  }, []);

  const isNearBottom = useCallback((element: HTMLElement, threshold = 40) => {
    return (
      element.scrollHeight - element.scrollTop - element.clientHeight <=
      threshold
    );
  }, []);

  const markProgrammaticScroll = useCallback(() => {
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimeoutRef.current) {
      clearTimeout(programmaticScrollTimeoutRef.current);
    }
    programmaticScrollTimeoutRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      programmaticScrollTimeoutRef.current = null;
    }, 140);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const viewport = getViewport();
      if (!viewport) {
        endRef.current?.scrollIntoView({ behavior, block: 'end' });
        return;
      }

      const userMessages =
        contentRef.current?.querySelectorAll<HTMLElement>(
          '[data-message-role="user"]',
        ) ?? [];
      const latestUserMessage =
        userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;

      if (latestUserMessage) {
        markProgrammaticScroll();
        const viewportRect = viewport.getBoundingClientRect();
        const messageRect = latestUserMessage.getBoundingClientRect();
        const messageTopInScroll =
          messageRect.top - viewportRect.top + viewport.scrollTop;
        const targetTop = Math.max(
          0,
          Math.min(
            messageTopInScroll - viewport.clientHeight * 0.28,
            viewport.scrollHeight - viewport.clientHeight,
          ),
        );
        if (behavior === 'auto') {
          viewport.scrollTop = targetTop;
        } else {
          viewport.scrollTo({ top: targetTop, behavior });
        }
      } else if (behavior === 'auto') {
        markProgrammaticScroll();
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        endRef.current?.scrollIntoView({ behavior, block: 'end' });
      }
    },
    [getViewport, markProgrammaticScroll],
  );

  const scrollToTail = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const viewport = getViewport();
      if (!viewport) {
        endRef.current?.scrollIntoView({ behavior, block: 'end' });
        return;
      }
      markProgrammaticScroll();
      if (behavior === 'auto') {
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      }
    },
    [getViewport, markProgrammaticScroll],
  );

  const debouncedScroll = useCallback(
    (
      scrollTarget: 'context' | 'tail' = 'context',
      behavior: ScrollBehavior = 'auto',
      delayMs = 150,
    ) => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        if (scrollTarget === 'tail') {
          scrollToTail(behavior);
        } else {
          scrollToBottom(behavior);
        }
        scrollTimeoutRef.current = null;
      }, delayMs);
    },
    [scrollToBottom, scrollToTail],
  );

  useLayoutEffect(() => {
    const currentCount = messages.length;
    if (needsInitialScrollRef.current && currentCount > 0) {
      needsInitialScrollRef.current = false;
      prevMessageCountRef.current = currentCount;
      shouldAutoFollowRef.current = true;
      scrollToBottom('auto');
      return;
    }
    if (
      shouldAutoFollowRef.current &&
      currentCount > prevMessageCountRef.current &&
      prevMessageCountRef.current > 0
    ) {
      debouncedScroll('context', 'smooth', 150);
    }
    prevMessageCountRef.current = currentCount;
  }, [messages.length, scrollToBottom, debouncedScroll]);

  useEffect(() => {
    if (!hasMessages) return;
    const viewport = getViewport();
    if (!viewport) return;
    const syncAutoFollow = () => {
      if (isProgrammaticScrollRef.current) return;
      const atBottom = isNearBottom(viewport);
      shouldAutoFollowRef.current = atBottom;
      if (!atBottom && scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
    syncAutoFollow();
    viewport.addEventListener('scroll', syncAutoFollow, { passive: true });
    return () => viewport.removeEventListener('scroll', syncAutoFollow);
  }, [getViewport, hasMessages, isNearBottom]);

  useEffect(() => {
    if (!isAssistantActive || !shouldAutoFollowRef.current) return;
    debouncedScroll('tail', 'auto', 120);
  }, [isAssistantActive, messages, debouncedScroll]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (programmaticScrollTimeoutRef.current)
        clearTimeout(programmaticScrollTimeoutRef.current);
    };
  }, []);

  // Handlers
  const handleSend = async (text: string, mentions: MentionRef[]) => {
    if (isSending) return false;

    let prompt = text.trim();
    if (!prompt) return false;

    if (mentions.length > 0) {
      const mentionContext = mentions
        .map(m => `[${m.type}:${m.label}](${m.href})`)
        .join(', ');
      prompt = `${prompt}\n\n[Referenced: ${mentionContext}]`;
    }

    setIsSending(true);
    shouldAutoFollowRef.current = true;

    try {
      await sendMessage({
        orgSlug,
        pageContext,
        prompt,
        threadId: assistantThreadId,
      });
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to send message',
      );
      return false;
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirmAction({
      title: 'Delete thread',
      description:
        'This will permanently delete this thread and all its messages.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;

    setIsDeleting(true);
    try {
      await clearThread({ orgSlug, threadId: assistantThreadId });
      router.push(`/${orgSlug}/threads`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete thread',
      );
      setIsDeleting(false);
    }
  };

  const handleSaveTitle = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === threadRow?.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await updateThread({ threadId: assistantThreadId, title: trimmed });
      setIsEditingTitle(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to rename thread',
      );
    }
  };

  const handleVisibilityChange = async (
    visibility: 'private' | 'organization' | 'public',
  ) => {
    try {
      await updateThread({ threadId: assistantThreadId, visibility });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update visibility',
      );
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    const isBulk = pendingAction.kind === 'bulk_delete_entities';
    const description = isBulk
      ? `This will permanently delete ${(pendingAction as any).entities.length} ${pendingAction.entityType}(s) and cannot be undone.\n\n${(pendingAction as any).entities.map((e: any) => `• ${e.entityLabel}`).join('\n')}`
      : `This will permanently delete "${(pendingAction as any).entityLabel}" and cannot be undone.`;
    const ok = await confirmAction({
      title: isBulk
        ? `Delete ${(pendingAction as any).entities.length} ${pendingAction.entityType}s`
        : `Delete ${pendingAction.entityType}`,
      description,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      await executeConfirmedAction({
        orgSlug,
        actionId: pendingAction.id,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  // Loading state
  if (!isReady || threadQuery.isPending) {
    return <ThreadLoadingSkeleton />;
  }

  if (!threadRow) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3'>
        <p className='text-muted-foreground text-sm'>Thread not found</p>
        <Button
          variant='outline'
          size='sm'
          onClick={() => router.push(`/${orgSlug}/threads`)}
        >
          <ArrowLeft className='mr-1.5 size-3.5' />
          Back to threads
        </Button>
      </div>
    );
  }

  return (
    <div className='bg-background relative flex h-full min-h-0 overflow-hidden'>
      {/* Floating header with progressive blur */}
      <div className='absolute top-0 right-0 left-0 z-50 p-2 px-3'>
        <ProgressiveBlur
          direction='top'
          blurLayers={10}
          blurIntensity={0.8}
          bgGradient
          className='pointer-events-none absolute inset-0 h-20'
        />
        <div className='relative z-[100] flex items-center justify-between gap-2'>
          {/* Left — back + title */}
          <div className='flex min-w-0 items-center gap-1'>
            <Button
              variant='ghost'
              size='icon'
              className='size-8 shrink-0'
              onClick={() => router.push(`/${orgSlug}/threads`)}
            >
              <ArrowLeft className='size-4' />
            </Button>

            {isEditingTitle ? (
              <div className='flex items-center gap-1'>
                <input
                  type='text'
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  className='bg-muted h-7 rounded-md border px-2 text-sm focus:outline-none'
                  autoFocus
                />
                <button
                  type='button'
                  onClick={() => void handleSaveTitle()}
                  className='text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded'
                >
                  <Check className='size-3.5' />
                </button>
                <button
                  type='button'
                  onClick={() => setIsEditingTitle(false)}
                  className='text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded'
                >
                  <X className='size-3.5' />
                </button>
              </div>
            ) : (
              <button
                type='button'
                onClick={() => {
                  setEditTitle(threadRow.title || '');
                  setIsEditingTitle(true);
                }}
                className='group flex min-w-0 items-center gap-1.5 text-sm font-medium'
              >
                <span className='truncate'>
                  {threadRow.title || 'Untitled Thread'}
                </span>
                <Pencil className='size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60' />
              </button>
            )}
          </div>

          {/* Right — visibility + delete */}
          <div className='flex shrink-0 items-center gap-1'>
            {(['private', 'organization', 'public'] as const).map(vis => {
              const Icon =
                vis === 'public'
                  ? Globe
                  : vis === 'organization'
                    ? Building
                    : Lock;
              const isActive = (threadRow.visibility ?? 'private') === vis;
              return (
                <button
                  key={vis}
                  type='button'
                  onClick={() => void handleVisibilityChange(vis)}
                  className={cn(
                    'flex size-7 items-center justify-center rounded transition-colors',
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground/50 hover:text-muted-foreground',
                  )}
                  title={vis.charAt(0).toUpperCase() + vis.slice(1)}
                >
                  <Icon className='size-3.5' />
                </button>
              );
            })}

            <Button
              variant='ghost'
              size='icon'
              className='text-muted-foreground hover:text-destructive size-8'
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              title='Delete thread'
            >
              {isDeleting ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <Trash2 className='size-4' />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Messages area — full height scroll */}
      <ScrollArea
        className='mx-auto h-full w-full max-w-[700px] flex-1'
        viewportRef={viewportRef}
      >
        <div ref={contentRef}>
          <div className='space-y-3 px-4 pt-16 pb-36'>
            {!hasMessages && (
              <div className='text-muted-foreground flex flex-col items-center justify-center gap-2 py-32 text-sm'>
                <svg
                  width='32'
                  height='32'
                  viewBox='300 300 628 628'
                  fill='none'
                  xmlns='http://www.w3.org/2000/svg'
                  className='opacity-30'
                >
                  <path
                    d='M444.705 796.719C545.526 890.195 703.034 884.24 796.51 783.42C889.986 682.599 884.032 525.091 783.211 431.615C682.391 338.139 524.882 344.093 431.406 444.913C337.93 545.734 343.884 703.243 444.705 796.719Z'
                    stroke='currentColor'
                    strokeWidth='49.7883'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  />
                  <path
                    d='M686.979 681.869L681.66 541.147L540.938 546.466'
                    stroke='currentColor'
                    strokeWidth='49.7883'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  />
                  <path
                    d='M546.257 687.188L681.66 541.146'
                    stroke='currentColor'
                    strokeWidth='49.7883'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  />
                </svg>
                <span>Start a conversation with Vector</span>
              </div>
            )}
            {messages.map(message => (
              <div
                key={`${message.role}-${message.id ?? `${message.order}-${message.stepOrder}`}`}
                data-message-role={message.role}
              >
                <AssistantDockMessage message={message} />
              </div>
            ))}
            <div ref={endRef} aria-hidden className='h-px' />
          </div>
        </div>
      </ScrollArea>

      {/* Floating input area with progressive blur */}
      <div className='absolute right-0 bottom-0 left-0 z-10 px-4 pt-2 pb-4'>
        <ProgressiveBlur
          direction='bottom'
          blurLayers={6}
          blurIntensity={0.3}
          className='pointer-events-none absolute inset-0'
        />
        <div className='relative mx-auto max-w-[700px]'>
          {/* Pending action banner */}
          {pendingAction ? (
            <div className='mb-2 flex items-center gap-2 rounded-md border border-[#cb706f]/20 px-3 py-1.5'>
              <Trash2 className='size-3.5 text-[#cb706f]' />
              <div className='min-w-0 flex-1'>
                <div className='truncate text-xs'>{pendingAction.summary}</div>
              </div>
              <Button
                size='sm'
                variant='outline'
                className='h-6 text-xs'
                onClick={handleConfirmAction}
              >
                Confirm
              </Button>
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground'
                onClick={() => void cancelPendingAction({ orgSlug })}
              >
                <X className='size-3.5' />
              </button>
            </div>
          ) : null}

          {/* Error banner */}
          {threadRow.threadStatus === 'error' && threadRow.errorMessage ? (
            <div className='mb-2 rounded-md border border-[#cb706f]/20 px-3 py-1.5 text-xs text-[#cb706f]'>
              {threadRow.errorMessage}
            </div>
          ) : null}

          {/* Input */}
          <div className='border-border/60 bg-background/80 overflow-hidden rounded-lg border backdrop-blur-sm'>
            <div className='flex items-center gap-1'>
              <AssistantInput
                ref={inputRef}
                orgSlug={orgSlug}
                onSubmit={handleSend}
                disabled={isSending}
                className='min-h-10 flex-1 px-3 py-2 text-sm placeholder:text-center'
                placeholder='Ask anything...'
              />
              <div className='flex shrink-0 items-center gap-1 px-1.5'>
                <Button
                  size='sm'
                  className='size-8 rounded-md p-0'
                  disabled={isSending}
                  onClick={() => inputRef.current?.submit()}
                >
                  {isSending || threadRow.threadStatus === 'pending' ? (
                    <BarsSpinner size={12} />
                  ) : (
                    <ArrowUp className='size-3.5' />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog />
    </div>
  );
}
