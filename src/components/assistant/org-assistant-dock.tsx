'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useConvexAuth } from 'convex/react';
import { useAction, useMutation, useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { GradientWaveText } from '@/components/gradient-wave-text';
import { BarsSpinner } from '@/components/bars-spinner';
import { cn } from '@/lib/utils';
import { ArrowUp, ChevronsDown, Trash2, X } from 'lucide-react';
import {
  type UIMessage,
  optimisticallySendMessage,
  useUIMessages,
} from '@convex-dev/agent/react';
import { resolveAssistantPageContext } from '@/lib/assistant-context';
import { useAssistantActions } from '@/hooks/use-assistant-actions';
import { useConfirm } from '@/hooks/use-confirm';
import { toast } from 'sonner';
import { ProgressiveBlur } from '@/components/ui/progressive-blur';
import { AssistantDockMessage } from './assistant-message-renderer';

type PendingAction = {
  id: string;
  entityType: 'document' | 'issue' | 'project' | 'team';
  entityLabel: string;
  summary: string;
};

export function OrgAssistantDock({ orgSlug }: { orgSlug: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const isSettingsPage = pathname.startsWith(`/${orgSlug}/settings`);
  const isReadyForAssistant = isAuthenticated && !isLoading;

  const threadRowQuery = useQuery(
    api.ai.queries.getThreadForCurrentUser,
    isReadyForAssistant ? { orgSlug } : 'skip',
  );
  const threadRow = threadRowQuery.data;
  const pendingThreadIdRef = useRef<string | null>(null);
  const ensureThread = useMutation(api.ai.mutations.ensureThread);
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

  const [draft, setDraft] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [confirmAction, ConfirmActionDialog] = useConfirm();

  const threadId = threadRow?.threadId;
  const uiMessages = useUIMessages(
    api.ai.queries.listThreadMessages,
    isReadyForAssistant && threadId ? { threadId } : 'skip',
    {
      initialNumItems: 20,
      stream: true,
    },
  );

  const messages = (uiMessages.results ?? []) as UIMessage[];
  const pendingAction = (threadRow?.pendingAction ??
    null) as PendingAction | null;
  const hasMessages = messages.length > 0;

  // --- Scroll management ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMessageCountRef = useRef(0);
  const needsInitialScrollRef = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = scrollContainerRef.current;
    if (!container) {
      endRef.current?.scrollIntoView({ behavior, block: 'end' });
      return;
    }

    const userMessages = container.querySelectorAll<HTMLElement>(
      '[data-message-role="user"]',
    );
    const latestUserMessage =
      userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;

    if (latestUserMessage) {
      const containerRect = container.getBoundingClientRect();
      const messageRect = latestUserMessage.getBoundingClientRect();
      const messageTopInScroll =
        messageRect.top - containerRect.top + container.scrollTop;
      const targetTop = Math.max(
        0,
        Math.min(
          messageTopInScroll - container.clientHeight * 0.45,
          container.scrollHeight - container.clientHeight,
        ),
      );
      if (behavior === 'auto') {
        container.scrollTop = targetTop;
      } else {
        container.scrollTo({ top: targetTop, behavior });
      }
    } else if (behavior === 'auto') {
      container.scrollTop = container.scrollHeight;
    } else {
      endRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
  }, []);

  const debouncedScrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto', delayMs = 150) => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        scrollToBottom(behavior);
        scrollTimeoutRef.current = null;
      }, delayMs);
    },
    [scrollToBottom],
  );

  useLayoutEffect(() => {
    if (!isExpanded) return;
    const currentCount = messages.length;

    if (needsInitialScrollRef.current && currentCount > 0) {
      needsInitialScrollRef.current = false;
      prevMessageCountRef.current = currentCount;
      scrollToBottom('auto');
      return;
    }

    if (
      currentCount > prevMessageCountRef.current &&
      prevMessageCountRef.current > 0
    ) {
      debouncedScrollToBottom('smooth', 150);
    }

    prevMessageCountRef.current = currentCount;
  }, [isExpanded, messages.length, scrollToBottom, debouncedScrollToBottom]);

  useEffect(() => {
    if (isExpanded) {
      needsInitialScrollRef.current = true;
      prevMessageCountRef.current = 0;
    }
  }, [isExpanded]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, []);

  if (!isReadyForAssistant || threadRowQuery.isError) {
    return null;
  }

  if (
    pendingThreadIdRef.current &&
    threadRow?.threadId === pendingThreadIdRef.current
  ) {
    pendingThreadIdRef.current = null;
  }

  const handleSend = async () => {
    const prompt = draft.trim();
    if (!prompt || isSending) return;

    setDraft('');
    setIsExpanded(true);
    setIsSending(true);

    try {
      let ensuredThreadId = threadRow?.threadId ?? null;
      if (!threadRow) {
        const ensuredThread = await ensureThread({ orgSlug, pageContext });
        ensuredThreadId = ensuredThread?.threadId ?? null;
      }
      pendingThreadIdRef.current = ensuredThreadId;
      await sendMessage({ orgSlug, pageContext, prompt });
    } catch (error) {
      pendingThreadIdRef.current = null;
      setDraft(prompt);
      toast.error(
        error instanceof Error ? error.message : 'Failed to send message',
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;

    const ok = await confirmAction({
      title: `Delete ${pendingAction.entityType}`,
      description: `This will permanently delete "${pendingAction.entityLabel}" and cannot be undone.`,
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

  const handleClearHistory = async () => {
    const ok = await confirmAction({
      title: 'Clear conversation',
      description: 'This will clear the conversation and start fresh.',
      confirmLabel: 'Clear',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      await clearThreadHistory({ orgSlug });
      setDraft('');
      setIsExpanded(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to clear history',
      );
    }
  };

  return (
    <>
      <div className='pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:right-2 lg:left-[14.5rem]'>
        <div
          className={cn(
            'mx-auto flex w-full max-w-2xl flex-col px-2 sm:px-3',
            isSettingsPage ? 'pb-3 sm:pb-4' : 'pb-16 sm:pb-4',
          )}
        >
          {/* Messages area — borders + progressive blur fade at top */}
          <AnimatePresence initial={false}>
            {isExpanded && hasMessages ? (
              <motion.div
                key='messages'
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className='pointer-events-auto relative'
              >
                <ProgressiveBlur
                  direction='top'
                  blurLayers={10}
                  blurIntensity={0.8}
                  bgGradient
                  bgGradientOpacity={0.4}
                  className='pointer-events-none absolute inset-x-0 top-0 z-10 h-20 rounded-t-2xl'
                />
                <button
                  type='button'
                  onClick={() => setIsExpanded(false)}
                  className='bg-muted/60 text-muted-foreground/60 hover:bg-muted hover:text-foreground absolute top-2 right-2 z-20 flex size-6 items-center justify-center rounded-full backdrop-blur-sm transition-colors'
                  aria-label='Collapse chat'
                >
                  <ChevronsDown className='size-3.5' />
                </button>
                <div
                  ref={scrollContainerRef}
                  className='border-border/40 bg-background/90 max-h-[min(50vh,420px)] space-y-3 overflow-y-auto overscroll-contain rounded-t-2xl border-x border-t px-3 pt-14 pb-3 backdrop-blur-sm'
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
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Collapsed preview — last messages fading into page */}
          {!isExpanded && hasMessages ? (
            <div className='pointer-events-none relative max-h-20 overflow-hidden'>
              <ProgressiveBlur
                direction='top'
                blurLayers={6}
                blurIntensity={0.6}
                bgGradient
                bgGradientOpacity={0.9}
                className='pointer-events-none absolute inset-0 z-10'
              />
              <div className='space-y-2 px-3 pt-2 pb-1'>
                {messages.slice(-2).map(message => (
                  <AssistantDockMessage
                    key={`${message.role}-${message.id ?? `${message.order}-${message.stepOrder}`}-preview`}
                    message={message}
                  />
                ))}
              </div>
            </div>
          ) : !isExpanded && !hasMessages ? (
            <div className='pointer-events-none px-3 pb-1'>
              <GradientWaveText
                speed={0.8}
                repeat
                once={false}
                className='text-muted-foreground text-[11px]'
              >
                Ask me anything about this page.
              </GradientWaveText>
            </div>
          ) : null}

          {/* Pending action banner */}
          {pendingAction ? (
            <motion.div
              layout
              className='bg-background/96 pointer-events-auto mb-1 flex items-center gap-2 rounded-lg border border-[#cb706f]/20 px-3 py-1.5 backdrop-blur-xl'
            >
              <Trash2 className='size-3 text-[#cb706f]' />
              <div className='min-w-0 flex-1'>
                <div className='truncate text-[11px]'>
                  {pendingAction.summary}
                </div>
              </div>
              <Button
                size='sm'
                variant='outline'
                className='h-6 text-[11px]'
                onClick={handleConfirmAction}
              >
                Confirm
              </Button>
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground'
                onClick={() => void cancelPendingAction({ orgSlug })}
              >
                <X className='size-3' />
              </button>
            </motion.div>
          ) : null}

          {/* Error banner */}
          {threadRow?.threadStatus === 'error' && threadRow.errorMessage ? (
            <div className='bg-background/96 pointer-events-auto mb-1 rounded-lg border border-[#cb706f]/20 px-3 py-1.5 text-[11px] text-[#cb706f] backdrop-blur-xl'>
              {threadRow.errorMessage}
            </div>
          ) : null}

          {/* Input bar */}
          <motion.div
            layout
            className='border-border/60 bg-card pointer-events-auto rounded-3xl border p-1 shadow-sm backdrop-blur-xl'
          >
            <div className='flex items-end gap-1'>
              <Textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onFocus={() => setIsExpanded(true)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                rows={1}
                placeholder='Ask anything or tell me what to do...'
                className='min-h-9 resize-none border-0 bg-transparent px-3 py-2 text-sm shadow-none focus-visible:ring-0'
              />
              <div className='flex shrink-0 items-center gap-1 p-1'>
                {hasMessages ? (
                  <button
                    type='button'
                    onClick={() => void handleClearHistory()}
                    className='text-muted-foreground/40 hover:text-muted-foreground flex size-7 items-center justify-center rounded-full transition-colors'
                    aria-label='Clear conversation'
                  >
                    <Trash2 className='size-3' />
                  </button>
                ) : null}
                <Button
                  size='sm'
                  className='size-8 rounded-full p-0'
                  onClick={() => void handleSend()}
                  disabled={isSending || !draft.trim()}
                >
                  {isSending || threadRow?.threadStatus === 'pending' ? (
                    <BarsSpinner size={14} />
                  ) : (
                    <ArrowUp className='size-4' />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      <ConfirmActionDialog />
    </>
  );
}
