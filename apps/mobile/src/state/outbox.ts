import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type OutboxStatus = 'queued' | 'sending' | 'failed';

export type OutboxAttachment = {
  localUri: string;
  name: string;
  contentType: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'file';
  width?: number;
  height?: number;
  duration?: number;
  storageId?: string;
};

export type OutboxMessage = {
  authorUserId: string;
  channelId: string;
  clientMessageId: string;
  body: string;
  createdAt: number;
  threadRootId?: string;
  replyToMessageId?: string;
  mentionedUserIds: string[];
  mentionedAgentIds: string[];
  attachments: OutboxAttachment[];
  status: OutboxStatus;
  attempts: number;
  retryAt?: number;
  error?: string;
};

type OutboxState = {
  messages: OutboxMessage[];
  enqueue: (message: Omit<OutboxMessage, 'attempts' | 'status'>) => void;
  markSending: (clientMessageId: string) => void;
  markFailed: (clientMessageId: string, error: string) => void;
  scheduleRetry: (
    clientMessageId: string,
    error: string,
    retryAt: number,
  ) => void;
  markQueued: (clientMessageId: string) => void;
  markAttachmentUploaded: (
    clientMessageId: string,
    localUri: string,
    storageId: string,
  ) => void;
  confirm: (clientMessageId: string) => void;
};

export const useOutboxStore = create<OutboxState>()(
  persist(
    set => ({
      messages: [],
      enqueue: message =>
        set(state => ({
          messages: [
            ...state.messages.filter(
              item => item.clientMessageId !== message.clientMessageId,
            ),
            { ...message, status: 'queued', attempts: 0 },
          ],
        })),
      markSending: clientMessageId =>
        set(state => ({
          messages: state.messages.map(message =>
            message.clientMessageId === clientMessageId
              ? {
                  ...message,
                  status: 'sending',
                  attempts: message.attempts + 1,
                  error: undefined,
                }
              : message,
          ),
        })),
      markFailed: (clientMessageId, error) =>
        set(state => ({
          messages: state.messages.map(message =>
            message.clientMessageId === clientMessageId
              ? { ...message, status: 'failed', error }
              : message,
          ),
        })),
      scheduleRetry: (clientMessageId, error, retryAt) =>
        set(state => ({
          messages: state.messages.map(message =>
            message.clientMessageId === clientMessageId
              ? { ...message, status: 'queued', error, retryAt }
              : message,
          ),
        })),
      markQueued: clientMessageId =>
        set(state => ({
          messages: state.messages.map(message =>
            message.clientMessageId === clientMessageId
              ? {
                  ...message,
                  status: 'queued',
                  error: undefined,
                  retryAt: undefined,
                }
              : message,
          ),
        })),
      markAttachmentUploaded: (clientMessageId, localUri, storageId) =>
        set(state => ({
          messages: state.messages.map(message =>
            message.clientMessageId === clientMessageId
              ? {
                  ...message,
                  attachments: message.attachments.map(attachment =>
                    attachment.localUri === localUri
                      ? { ...attachment, storageId }
                      : attachment,
                  ),
                }
              : message,
          ),
        })),
      confirm: clientMessageId =>
        set(state => ({
          messages: state.messages.filter(
            message => message.clientMessageId !== clientMessageId,
          ),
        })),
    }),
    {
      name: 'vector-mobile-message-outbox-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ messages: state.messages }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<OutboxState>;
        return {
          ...current,
          ...saved,
          messages: (saved.messages ?? []).map(message => ({
            ...message,
            mentionedUserIds: message.mentionedUserIds ?? [],
            mentionedAgentIds: message.mentionedAgentIds ?? [],
            attachments: message.attachments ?? [],
            // An app process cannot still own an in-flight request after a
            // cold start. Requeue it with the same idempotency key.
            status: message.status === 'sending' ? 'queued' : message.status,
            retryAt: message.status === 'sending' ? undefined : message.retryAt,
          })),
        };
      },
    },
  ),
);
