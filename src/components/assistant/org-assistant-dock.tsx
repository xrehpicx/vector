'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useDroppable } from '@dnd-kit/core';
import { useConvexAuth } from 'convex/react';
import { useQuery, useMutation, useAction } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { type MentionRef } from './assistant-input';
import { cn } from '@/lib/utils';
import {
  ChevronsDown,
  ChevronsUp,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
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
import { useAssistantIssueDnd } from './assistant-issue-dnd';
import { useRouter } from 'nextjs-toploader/app';
import {
  AssistantComposer,
  type AssistantComposerHandle,
  type AssistantComposerSubmitOptions,
} from './assistant-composer';
import {
  AssistantPendingActions,
  normalizePendingActions,
  type AssistantPendingAction,
} from './assistant-pending-actions';

const CHAT_PANEL_TRANSITION = {
  height: {
    type: 'spring' as const,
    stiffness: 280,
    damping: 30,
    mass: 0.9,
  },
  opacity: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};
const CHAT_PANEL_EXIT = {
  height: { duration: 0.16, ease: [0.4, 0, 1, 1] as const },
  opacity: { duration: 0.12, ease: [0.4, 0, 1, 1] as const },
};

export function OrgAssistantDock({ orgSlug }: { orgSlug: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const isReadyForAssistant = isAuthenticated && !isLoading;

  // Hide dock on thread detail pages — those have their own full-page view
  const isOnThreadPage = pathname.startsWith(`/${orgSlug}/threads/`);

  const threadRowQuery = useQuery(
    api.ai.queries.getActiveThread,
    isReadyForAssistant ? { orgSlug } : 'skip',
  );
  const threadRow = threadRowQuery.data;
  const pendingThreadIdRef = useRef<string | null>(null);
  const ensureThread = useMutation(api.ai.mutations.ensureThread);
  const createNewThread = useMutation(api.ai.mutations.createThread);
  const sendMessage = useMutation(
    api.ai.mutations.sendMessage,
  ).withOptimisticUpdate((store, args) => {
    const optimisticThreadId =
      threadRowQuery.data?.threadId ?? pendingThreadIdRef.current;
    if (!optimisticThreadId) return;
    optimisticallySendMessage(api.ai.queries.listThreadMessages)(store, {
      threadId: optimisticThreadId,
      prompt: args.prompt,
    });
  });
  const executeConfirmedAction = useMutation(
    api.ai.mutations.executeConfirmedAction,
  );
  const cancelPendingAction = useMutation(api.ai.mutations.cancelPendingAction);
  const clearThreadHistory = useAction(api.ai.actions.clearThreadHistory);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(
    null,
  );
  const [cancellingActionId, setCancellingActionId] = useState<string | null>(
    null,
  );
  const [confirmAction, ConfirmActionDialog] = useConfirm();
  const inputRef = useRef<AssistantComposerHandle>(null);
  const assistantDropId = useId();
  const { activeIssueDrag } = useAssistantIssueDnd();
  const { setNodeRef: setAssistantDropRef, isOver: isIssueDropOver } =
    useDroppable({
      id: assistantDropId,
      data: {
        type: 'assistant-issue-drop',
        onIssueDrop: (issue: {
          key: string;
          title: string;
          href: string;
          icon?: string | null;
          color?: string | null;
        }) => {
          inputRef.current?.insertIssueMention({
            label: `${issue.key} ${issue.title}`,
            href: issue.href,
            icon: issue.icon,
            color: issue.color,
          });
          setIsExpanded(true);
        },
      },
    });

  // Listen for command menu "Message Vector" event
  useEffect(() => {
    const onFocusAssistant = () => {
      setIsExpanded(true);
      // Delay focus to allow the expansion animation to start
      setTimeout(() => inputRef.current?.focus(), 150);
    };
    window.addEventListener('command-menu:focus-assistant', onFocusAssistant);
    return () =>
      window.removeEventListener(
        'command-menu:focus-assistant',
        onFocusAssistant,
      );
  }, []);

  const threadId = threadRow?.threadId;
  const uiMessages = useUIMessages(
    api.ai.queries.listThreadMessages,
    isReadyForAssistant && threadId ? { threadId } : 'skip',
    {
      initialNumItems: 20,
      stream: true,
    },
  );

  const messages = useMemo(
    () => (uiMessages.results ?? []) as UIMessage[],
    [uiMessages.results],
  );
  const pendingActions = normalizePendingActions(threadRow?.pendingAction);
  const hasMessages = messages.length > 0;
  const isAssistantActive =
    isSending ||
    threadRow?.threadStatus === 'pending' ||
    messages.some(message => message.status === 'streaming');

  // Thread title for dock header
  const threadTitle = threadRow?.title || 'Vector';

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
    if (viewportRef.current) {
      return viewportRef.current;
    }
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
    if (!isExpanded) return;
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
  }, [isExpanded, messages.length, scrollToBottom, debouncedScroll]);

  useEffect(() => {
    if (isExpanded) {
      needsInitialScrollRef.current = true;
      prevMessageCountRef.current = 0;
      shouldAutoFollowRef.current = true;
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded || !hasMessages) return;

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

    return () => {
      viewport.removeEventListener('scroll', syncAutoFollow);
    };
  }, [getViewport, hasMessages, isExpanded, isNearBottom]);

  useEffect(() => {
    if (!isExpanded || !hasMessages) return;

    let frameOne = 0;
    let frameTwo = 0;
    const timer = window.setTimeout(() => {
      scrollToBottom('auto');
    }, 220);

    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    });

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      window.clearTimeout(timer);
    };
  }, [hasMessages, isExpanded, scrollToBottom]);

  useEffect(() => {
    if (!isExpanded || !isAssistantActive || !shouldAutoFollowRef.current) {
      return;
    }

    debouncedScroll('tail', 'auto', 120);
  }, [isAssistantActive, isExpanded, messages, debouncedScroll]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
        programmaticScrollTimeoutRef.current = null;
      }
    };
  }, []);

  if (
    pendingThreadIdRef.current &&
    threadRow?.threadId === pendingThreadIdRef.current
  ) {
    pendingThreadIdRef.current = null;
  }

  const handleSend = async (
    text: string,
    mentions: MentionRef[],
    options: AssistantComposerSubmitOptions,
  ) => {
    if (isSending) return false;

    let prompt = text.trim();
    if (!prompt && options.attachments.length === 0) return false;

    if (mentions.length > 0) {
      const mentionContext = mentions
        .map(m => `[${m.type}:${m.label}](${m.href})`)
        .join(', ');
      prompt = `${prompt}\n\n[Referenced: ${mentionContext}]`;
    }

    setIsExpanded(true);
    setIsSending(true);
    shouldAutoFollowRef.current = true;
    scrollToTail('smooth');

    try {
      let ensuredThreadId = threadRow?.threadId ?? null;
      if (!threadRow) {
        const ensuredThread = await ensureThread({ orgSlug, pageContext });
        ensuredThreadId = ensuredThread?.threadId ?? null;
      }
      pendingThreadIdRef.current = ensuredThreadId;
      await sendMessage({
        orgSlug,
        pageContext,
        prompt,
        model: options.model,
        thinkingLevel: options.thinkingLevel,
        skipConfirmations: options.skipConfirmations,
        attachments: options.attachments.map(attachment => ({
          storageId: attachment.storageId,
          filename: attachment.filename,
          mediaType: attachment.mediaType,
        })),
      });
      scrollToTail('smooth');
      return true;
    } catch (error) {
      pendingThreadIdRef.current = null;
      toast.error(
        error instanceof Error ? error.message : 'Failed to send message',
      );
      return false;
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmAction = useCallback(
    async (action: AssistantPendingAction) => {
      setConfirmingActionId(action.id);
      try {
        await executeConfirmedAction({
          orgSlug,
          actionId: action.id,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Action failed');
      } finally {
        setConfirmingActionId(null);
      }
    },
    [executeConfirmedAction, orgSlug],
  );

  const handleCancelPendingAction = useCallback(
    async (action: AssistantPendingAction) => {
      setCancellingActionId(action.id);
      try {
        await cancelPendingAction({ orgSlug, actionId: action.id });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Cancel failed');
      } finally {
        setCancellingActionId(null);
      }
    },
    [cancelPendingAction, orgSlug],
  );

  const handleClearHistory = async () => {
    const ok = await confirmAction({
      title: 'Clear conversation',
      description: 'This will delete this thread and start fresh.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;

    setIsClearing(true);
    try {
      await clearThreadHistory({
        orgSlug,
        threadId: threadRow?._id,
      });
      setIsExpanded(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to clear history',
      );
    } finally {
      setIsClearing(false);
    }
  };

  const handleCreateThread = async () => {
    setIsCreatingThread(true);
    try {
      await createNewThread({ orgSlug });
      setIsExpanded(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create thread',
      );
    } finally {
      setIsCreatingThread(false);
    }
  };

  const handleOpenInPage = () => {
    if (threadRow?._id) {
      router.push(`/${orgSlug}/threads/${threadRow._id}`);
    }
  };

  useEffect(() => {
    if (pendingActions.length === 0) return;
    if (confirmingActionId || cancellingActionId) return;

    const nextAction = pendingActions[0];
    const storedSkip =
      typeof window !== 'undefined' &&
      window.localStorage.getItem('vector.assistant.skip-confirmations') ===
        'true';

    if (!storedSkip || !nextAction) return;

    void handleConfirmAction(nextAction);
  }, [
    cancellingActionId,
    confirmingActionId,
    handleConfirmAction,
    pendingActions,
  ]);

  if (isOnThreadPage) {
    return null;
  }

  if (!isReadyForAssistant || threadRowQuery.isError) {
    return null;
  }

  return (
    <>
      <div className='border-border bg-background flex flex-col border-t'>
        {/* Header toggle */}
        <div className='flex items-center justify-between px-3 py-1.5'>
          <button
            type='button'
            onClick={() => setIsExpanded(prev => !prev)}
            className='text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium transition-colors'
          >
            <svg
              width='14'
              height='14'
              viewBox='300 300 628 628'
              fill='none'
              xmlns='http://www.w3.org/2000/svg'
              aria-hidden
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
            <span className='truncate'>{threadTitle}</span>
            {isAssistantActive && (
              <span className='bg-foreground/40 size-1.5 animate-pulse rounded-full' />
            )}
          </button>
          <div className='flex items-center gap-0.5'>
            {threadRow && (
              <button
                type='button'
                onClick={handleOpenInPage}
                className='text-muted-foreground/50 hover:text-muted-foreground flex size-5 items-center justify-center rounded transition-colors'
                aria-label='Open in page'
              >
                <ExternalLink className='size-2.5' />
              </button>
            )}
            <button
              type='button'
              onClick={handleCreateThread}
              disabled={isCreatingThread}
              className='text-muted-foreground/50 hover:text-muted-foreground flex size-5 items-center justify-center rounded transition-colors disabled:opacity-30'
              aria-label='New thread'
            >
              {isCreatingThread ? (
                <Loader2 className='size-2.5 animate-spin' />
              ) : (
                <Plus className='size-3' />
              )}
            </button>
            <button
              type='button'
              onClick={() => setIsExpanded(prev => !prev)}
              className='text-muted-foreground/50 hover:text-muted-foreground flex size-5 items-center justify-center rounded transition-colors'
            >
              {isExpanded ? (
                <ChevronsDown className='size-3' />
              ) : (
                <ChevronsUp className='size-3' />
              )}
            </button>
          </div>
        </div>

        {/* Expanded messages */}
        <AnimatePresence initial={false}>
          {isExpanded && hasMessages ? (
            <motion.div
              key='messages'
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{
                opacity: 0,
                height: 0,
                transition: CHAT_PANEL_EXIT,
              }}
              transition={CHAT_PANEL_TRANSITION}
              className='relative min-w-0 overflow-hidden'
            >
              <ScrollArea
                className='h-[min(40vh,320px)] w-full min-w-0'
                viewportClassName='overscroll-contain'
                maskHeight={12}
                viewportRef={viewportRef}
              >
                <div
                  ref={contentRef}
                  className='min-w-0 space-y-2.5 overflow-x-hidden px-2 pt-1 pb-2'
                >
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
              </ScrollArea>
              {isClearing && (
                <div className='bg-background/80 absolute inset-0 z-20 flex items-center justify-center backdrop-blur-[2px]'>
                  <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                    <Loader2 className='size-3.5 animate-spin' />
                    <span>Clearing conversation...</span>
                  </div>
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Collapsed preview — last message */}
        <AnimatePresence initial={false}>
          {!isExpanded && hasMessages ? (
            <motion.div
              key='preview'
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{
                opacity: 0,
                height: 0,
                transition: CHAT_PANEL_EXIT,
              }}
              transition={CHAT_PANEL_TRANSITION}
              className='cursor-pointer overflow-hidden'
              onClick={() => setIsExpanded(true)}
            >
              <div className='px-2 pb-1'>
                {messages.slice(-1).map(message => (
                  <AssistantDockMessage
                    key={`${message.role}-${message.id ?? `${message.order}-${message.stepOrder}`}-preview`}
                    message={message}
                    compact
                  />
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AssistantPendingActions
          actions={pendingActions}
          variant='dock'
          confirmingActionId={confirmingActionId}
          cancellingActionId={cancellingActionId}
          onConfirm={action => void handleConfirmAction(action)}
          onCancel={action => void handleCancelPendingAction(action)}
        />

        {/* Error banner */}
        {threadRow?.threadStatus === 'error' && threadRow.errorMessage ? (
          <div className='mx-2 mb-1 rounded-md border border-[#cb706f]/20 px-2 py-1 text-[11px] text-[#cb706f]'>
            {threadRow.errorMessage}
          </div>
        ) : null}

        {/* Input bar */}
        <div className='px-1.5 pb-1.5'>
          <div
            ref={setAssistantDropRef}
            className={cn(
              'rounded-lg',
              activeIssueDrag && 'transition-colors',
              isIssueDropOver && 'bg-primary/5 ring-primary/20 ring-1',
            )}
          >
            <AssistantComposer
              ref={inputRef}
              orgSlug={orgSlug}
              onSubmit={handleSend}
              onFocus={() => setIsExpanded(true)}
              disabled={isSending}
              busy={isSending || threadRow?.threadStatus === 'pending'}
              variant='dock'
              placeholder='Ask anything...'
              auxiliaryActions={
                hasMessages ? (
                  <button
                    type='button'
                    onClick={() => void handleClearHistory()}
                    disabled={isClearing}
                    className='text-muted-foreground/40 hover:text-muted-foreground flex size-5 items-center justify-center rounded transition-colors disabled:pointer-events-none disabled:opacity-30'
                    aria-label='Delete thread'
                  >
                    {isClearing ? (
                      <Loader2 className='size-2.5 animate-spin' />
                    ) : (
                      <Trash2 className='size-2.5' />
                    )}
                  </button>
                ) : null
              }
              className={cn(
                isIssueDropOver &&
                  'border-primary/35 bg-primary/5 ring-primary/20 ring-1',
              )}
            />
          </div>
        </div>
      </div>
      <ConfirmActionDialog />
    </>
  );
}
