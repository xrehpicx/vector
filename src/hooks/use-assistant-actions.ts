'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/convex';
import type { Id } from '@/convex/_generated/dataModel';

export function useAssistantActions(orgSlug: string) {
  const router = useRouter();
  const pendingActions = useQuery(api.ai.queries.listPendingActions, {
    orgSlug,
  });
  const markCompleted = useMutation(api.ai.mutations.markActionCompleted);
  const processingRef = useRef<Set<string>>(new Set());

  const executeAction = useCallback(
    async (type: string, payload: Record<string, string>) => {
      switch (type) {
        case 'navigate':
          if (payload.url) router.push(payload.url);
          break;
        case 'open_tab':
          if (payload.url) {
            const openedWindow = window.open(payload.url, '_blank');
            if (!openedWindow) {
              throw new Error('POPUP_BLOCKED');
            }
          }
          break;
        case 'copy':
          if (payload.text) {
            if (!navigator.clipboard?.writeText) {
              throw new Error('CLIPBOARD_UNAVAILABLE');
            }
            await navigator.clipboard.writeText(payload.text);
          }
          break;
        case 'toast':
          if (payload.text) toast(payload.text);
          break;
      }
    },
    [router],
  );

  useEffect(() => {
    if (!pendingActions || pendingActions.length === 0) return;

    for (const action of pendingActions) {
      const id = action._id as Id<'assistantActions'>;
      if (processingRef.current.has(id)) continue;
      processingRef.current.add(id);

      const payload = action.payload as Record<string, string>;

      void (async () => {
        try {
          await executeAction(action.type, payload);
          await markCompleted({ actionId: id, status: 'done' });
        } catch {
          processingRef.current.delete(id);
          await markCompleted({ actionId: id, status: 'failed' });
        }
      })();
    }
  }, [pendingActions, markCompleted, executeAction]);
}
