import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

import { api } from '@vector/convex/_generated/api';
import type { Id } from '@vector/convex/_generated/dataModel';
import { useOutboxStore, type OutboxMessage } from '@/state/outbox';
import { retryDelayForAttempt } from './delivery-policy';

const SLOW_SEND_MS = 8_000;

/**
 * Delivers persisted optimistic messages over Convex's retrying websocket.
 * Convex retries an individual mutation until it is acknowledged; our stable
 * clientMessageId makes cold-start retries idempotent as well.
 */
export function useMessageDelivery() {
  const inFlight = useRef(new Set<string>());
  const sendMutation = useMutation(api.collaboration.messages.send);
  const generateUploadUrl = useMutation(
    api.collaboration.messages.generateUploadUrl,
  );
  const markSending = useOutboxStore(state => state.markSending);
  const markFailed = useOutboxStore(state => state.markFailed);
  const scheduleRetry = useOutboxStore(state => state.scheduleRetry);
  const markQueued = useOutboxStore(state => state.markQueued);
  const confirm = useOutboxStore(state => state.confirm);
  const markAttachmentUploaded = useOutboxStore(
    state => state.markAttachmentUploaded,
  );
  const messages = useOutboxStore(state => state.messages);

  const deliver = useCallback(
    async (message: OutboxMessage) => {
      if (inFlight.current.has(message.clientMessageId)) return;
      inFlight.current.add(message.clientMessageId);
      markSending(message.clientMessageId);
      const startedAt = performance.now();
      const slowTimer = setTimeout(() => {
        // This is informational state only. The Convex mutation stays alive and
        // will keep retrying over its persistent connection.
        markQueued(message.clientMessageId);
      }, SLOW_SEND_MS);
      try {
        const uploadedAttachments = await Promise.all(
          message.attachments.map(async attachment => {
            let storageId = attachment.storageId;
            if (!storageId) {
              const uploadUrl = await generateUploadUrl({
                channelId: message.channelId as Id<'channels'>,
              });
              const file = new File(attachment.localUri);
              const uploadResponse = await expoFetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': attachment.contentType },
                body: file,
              });
              if (!uploadResponse.ok) {
                throw new Error(
                  `Attachment upload failed (${uploadResponse.status}).`,
                );
              }
              const uploadResult = (await uploadResponse.json()) as {
                storageId?: string;
              };
              if (!uploadResult.storageId)
                throw new Error(
                  'Attachment upload did not return a storage id.',
                );
              storageId = uploadResult.storageId;
              markAttachmentUploaded(
                message.clientMessageId,
                attachment.localUri,
                storageId,
              );
            }
            return {
              storageId: storageId as Id<'_storage'>,
              kind: attachment.kind,
              name: attachment.name,
              contentType: attachment.contentType,
              size: attachment.size,
              width: attachment.width,
              height: attachment.height,
              duration: attachment.duration,
            };
          }),
        );
        await sendMutation({
          channelId: message.channelId as Id<'channels'>,
          body: message.body,
          clientMessageId: message.clientMessageId,
          threadRootId: message.threadRootId as
            Id<'channelMessages'> | undefined,
          replyToMessageId: message.replyToMessageId as
            Id<'channelMessages'> | undefined,
          mentionedUserIds: message.mentionedUserIds as Id<'users'>[],
          mentionedAgentIds:
            message.mentionedAgentIds as Id<'registeredAgents'>[],
          attachments: uploadedAttachments,
        });
        confirm(message.clientMessageId);
        if (__DEV__) {
          console.info('[message-latency]', {
            clientMessageId: message.clientMessageId,
            commitMs: Math.round(performance.now() - startedAt),
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Vector could not send this message.';
        const retryDelay = retryDelayForAttempt(message.attempts);
        if (retryDelay !== undefined) {
          scheduleRetry(
            message.clientMessageId,
            errorMessage,
            Date.now() + retryDelay,
          );
        } else {
          markFailed(message.clientMessageId, errorMessage);
        }
      } finally {
        clearTimeout(slowTimer);
        inFlight.current.delete(message.clientMessageId);
      }
    },
    [
      confirm,
      generateUploadUrl,
      markAttachmentUploaded,
      markFailed,
      markQueued,
      markSending,
      scheduleRetry,
      sendMutation,
    ],
  );

  useEffect(() => {
    const now = Date.now();
    const queued = messages.filter(message => message.status === 'queued');
    const nextRetryAt = queued.reduce<number | undefined>((next, message) => {
      if (!message.retryAt || message.retryAt <= now) return next;
      return next === undefined
        ? message.retryAt
        : Math.min(next, message.retryAt);
    }, undefined);
    if (nextRetryAt === undefined) return;
    const timer = setTimeout(
      () => {
        // Force the persisted queue through a state update. The app-level
        // manager owns account-scoped delivery and will pick it up.
        const latest = useOutboxStore.getState().messages;
        for (const message of latest) {
          if (
            message.status === 'queued' &&
            message.retryAt &&
            message.retryAt <= Date.now()
          ) {
            markQueued(message.clientMessageId);
          }
        }
      },
      Math.max(0, nextRetryAt - now),
    );
    return () => clearTimeout(timer);
  }, [markQueued, messages]);

  return deliver;
}
