import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import * as Crypto from 'expo-crypto';

import { api } from '@vector/convex/_generated/api';
import type { Id } from '@vector/convex/_generated/dataModel';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme';
import { useOutboxStore, type OutboxMessage } from '@/state/outbox';
import { MessageComposer } from './MessageComposer';
import { MessageRow, type TimelineMessage } from './MessageRow';
import { useAttachmentPicker } from './useAttachmentPicker';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useKeyboardInset } from './useKeyboardInset';

type Props = NativeStackScreenProps<RootStackParamList, 'Thread'>;

export function ThreadScreen({ navigation, route }: Props) {
  const { currentUser } = useWorkspace();
  const channelId = route.params.channelId as Id<'channels'>;
  const rootMessageId = route.params.rootMessageId as Id<'channelMessages'>;
  const listRef = useRef<FlatList<TimelineMessage>>(null);
  const root = useQuery(api.collaboration.messages.get, {
    messageId: rootMessageId,
  });
  const { results } = usePaginatedQuery(
    api.collaboration.messages.listThread,
    { threadRootId: rootMessageId },
    { initialNumItems: 30 },
  );
  const members = useQuery(api.collaboration.channels.listMembers, {
    channelId,
  });
  const agents = useQuery(api.collaboration.agents.listChannelMemberships, {
    channelId,
  });
  const toggleReaction = useMutation(api.collaboration.messages.toggleReaction);
  const toggleSaved = useMutation(api.collaboration.messages.toggleSaved);
  const messages = useOutboxStore(state => state.messages);
  const enqueue = useOutboxStore(state => state.enqueue);
  const confirm = useOutboxStore(state => state.confirm);
  const markQueued = useOutboxStore(state => state.markQueued);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const attachmentPicker = useAttachmentPicker();
  const keyboardInset = useKeyboardInset();

  const pending = useMemo(
    () =>
      messages.filter(
        message =>
          message.authorUserId === currentUser._id &&
          message.channelId === route.params.channelId &&
          message.threadRootId === route.params.rootMessageId,
      ),
    [
      currentUser._id,
      messages,
      route.params.channelId,
      route.params.rootMessageId,
    ],
  );

  useEffect(() => {
    const confirmedIds = new Set(
      results
        .map(result => result.message.clientMessageId)
        .filter((id): id is string => Boolean(id)),
    );
    pending.forEach(message => {
      if (confirmedIds.has(message.clientMessageId))
        confirm(message.clientMessageId);
    });
  }, [confirm, pending, results]);

  const timeline = useMemo<TimelineMessage[]>(() => {
    const server: TimelineMessage[] = results.map(value => ({
      kind: 'server',
      value,
    }));
    const outbox: TimelineMessage[] = pending.map(value => ({
      kind: 'outbox',
      value,
    }));
    return [...server, ...outbox].sort((left, right) => {
      const leftAt =
        left.kind === 'server'
          ? left.value.message.createdAt
          : left.value.createdAt;
      const rightAt =
        right.kind === 'server'
          ? right.value.message.createdAt
          : right.value.createdAt;
      return leftAt - rightAt;
    });
  }, [pending, results]);

  const mentionOptions = useMemo(
    () => [
      ...(members ?? []).map(member => ({
        id: member.membership.userId,
        label:
          member.user?.username ??
          member.user?.name ??
          member.user?.email ??
          'teammate',
        kind: 'user' as const,
      })),
      ...(agents ?? []).map(agent => ({
        id: agent.agent._id,
        label: agent.agent.handle,
        kind: 'agent' as const,
      })),
    ],
    [agents, members],
  );

  const replyTarget = useMemo(() => {
    if (!replyToMessageId) return null;
    if (root?.message._id === replyToMessageId) return root;
    return (
      results.find(result => result.message._id === replyToMessageId) ?? null
    );
  }, [replyToMessageId, results, root]);

  function send(
    body: string,
    mentions: Array<{ id: string; kind: 'user' | 'agent' }>,
    attachments: OutboxMessage['attachments'],
  ) {
    const message: OutboxMessage = {
      authorUserId: currentUser._id,
      channelId: route.params.channelId,
      clientMessageId: Crypto.randomUUID(),
      body,
      createdAt: Date.now(),
      threadRootId: route.params.rootMessageId,
      replyToMessageId: replyToMessageId ?? undefined,
      mentionedUserIds: mentions
        .filter(mention => mention.kind === 'user')
        .map(mention => mention.id),
      mentionedAgentIds: mentions
        .filter(mention => mention.kind === 'agent')
        .map(mention => mention.id),
      attachments,
      status: 'queued',
      attempts: 0,
    };
    enqueue(message);
    setReplyToMessageId(null);
    attachmentPicker.clear();
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true }),
    );
  }

  useEffect(() => {
    navigation.setOptions({ title: 'Thread' });
  }, [navigation]);

  return (
    <View
      style={[
        styles.page,
        keyboardInset ? { paddingBottom: keyboardInset } : null,
      ]}
    >
      <View style={styles.channelContext}>
        <Text numberOfLines={1} style={styles.channelContextText}>
          #{route.params.channelName}
        </Text>
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={timeline}
        keyExtractor={item =>
          item.kind === 'server'
            ? item.value.message._id
            : item.value.clientMessageId
        }
        ListHeaderComponent={
          root ? (
            <View style={styles.rootMessage}>
              <MessageRow
                item={{ kind: 'server', value: root }}
                onReact={(messageId, emoji) =>
                  void toggleReaction({
                    messageId: messageId as Id<'channelMessages'>,
                    emoji,
                  })
                }
                onReply={setReplyToMessageId}
                onRetry={() => undefined}
                onSave={async messageId => {
                  await toggleSaved({
                    messageId: messageId as Id<'channelMessages'>,
                  });
                }}
                onSendAttachment={attachment => send('', [], [attachment])}
                onThread={() => undefined}
              />
              <View style={styles.replyDivider}>
                <Text style={styles.replyDividerText}>
                  {root.message.replyCount}{' '}
                  {root.message.replyCount === 1 ? 'reply' : 'replies'}
                </Text>
              </View>
            </View>
          ) : null
        }
        ref={listRef}
        renderItem={({ item }) => (
          <MessageRow
            item={item}
            onReact={(messageId, emoji) =>
              void toggleReaction({
                messageId: messageId as Id<'channelMessages'>,
                emoji,
              })
            }
            onReply={setReplyToMessageId}
            onRetry={clientMessageId => {
              markQueued(clientMessageId);
            }}
            onSave={async messageId => {
              await toggleSaved({
                messageId: messageId as Id<'channelMessages'>,
              });
            }}
            onSendAttachment={attachment => send('', [], [attachment])}
            onThread={() => undefined}
          />
        )}
      />
      <MessageComposer
        channelName={route.params.channelName}
        mentionOptions={mentionOptions}
        attachments={attachmentPicker.attachments}
        onAddAttachment={attachmentPicker.choose}
        onAddCapturedAttachment={attachmentPicker.addCaptured}
        onCancelReply={() => setReplyToMessageId(null)}
        onRemoveAttachment={attachmentPicker.remove}
        onSend={send}
        replyToLabel={replyTarget?.message.body}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  channelContext: {
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  channelContextText: { color: colors.secondaryLabel, fontSize: 13 },
  list: { flexGrow: 1, paddingBottom: 10 },
  rootMessage: { paddingTop: 4 },
  replyDivider: {
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginTop: 8,
    paddingTop: 9,
  },
  replyDividerText: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: '600',
  },
});
