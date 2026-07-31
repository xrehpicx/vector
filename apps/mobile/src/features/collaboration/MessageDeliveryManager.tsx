import { useMessageDelivery } from './useMessageDelivery';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useOutboxStore } from '@/state/outbox';
import { isMessageDue } from './delivery-policy';

/**
 * Owns the one delivery loop for the entire signed-in app. Stack navigation
 * keeps previous screens mounted, so screen-scoped loops can otherwise race
 * each other for the same persisted outbox entry.
 */
export function MessageDeliveryManager() {
  const { currentUser } = useWorkspace();
  const deliver = useMessageDelivery();
  const messages = useOutboxStore(state => state.messages);

  // Delivery is scoped to the account that created each entry. This prevents
  // a durable queue from being replayed as a different user after sign-out.
  useEffect(() => {
    for (const message of messages) {
      if (message.authorUserId === currentUser._id && isMessageDue(message)) {
        void deliver(message);
      }
    }
  }, [currentUser._id, deliver, messages]);
  return null;
}
import { useEffect } from 'react';
