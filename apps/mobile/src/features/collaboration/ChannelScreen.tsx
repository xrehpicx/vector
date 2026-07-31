import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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

type Props = NativeStackScreenProps<RootStackParamList, 'Channel'>;

export function ChannelScreen({ navigation, route }: Props) {
  const { currentUser } = useWorkspace();
  const channelId = route.params.channelId as Id<'channels'>;
  const listRef = useRef<FlatList<TimelineMessage>>(null);
  const members = useQuery(api.collaboration.channels.listMembers, {
    channelId,
  });
  const agents = useQuery(api.collaboration.agents.listChannelMemberships, {
    channelId,
  });
  const { results } = usePaginatedQuery(
    api.collaboration.messages.listChannel,
    { channelId },
    { initialNumItems: 50 },
  );
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
          !message.threadRootId,
      ),
    [currentUser._id, messages, route.params.channelId],
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
    return (
      results.find(result => result.message._id === replyToMessageId) ?? null
    );
  }, [replyToMessageId, results]);

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
    navigation.setOptions({
      title: route.params.name,
      headerRight: () => (
        <Pressable
          accessibilityLabel='Conversation details'
          hitSlop={10}
          onPress={() =>
            navigation.navigate('ChannelDetails', {
              channelId: route.params.channelId,
              kind: route.params.kind,
              name: route.params.name,
              topic: route.params.topic,
            })
          }
          style={styles.headerButton}
        >
          <SymbolView name='info.circle' size={22} tintColor={colors.accent} />
        </Pressable>
      ),
    });
  }, [
    navigation,
    route.params.channelId,
    route.params.kind,
    route.params.name,
    route.params.topic,
  ]);

  return (
    <View
      style={[
        styles.page,
        keyboardInset ? { paddingBottom: keyboardInset } : null,
      ]}
    >
      {route.params.topic ? (
        <View style={styles.topicBar}>
          <Text numberOfLines={1} style={styles.topic}>
            {route.params.topic}
          </Text>
        </View>
      ) : null}
      <FlatList
        contentContainerStyle={timeline.length ? styles.list : styles.emptyList}
        data={timeline}
        keyExtractor={item =>
          item.kind === 'server'
            ? item.value.message._id
            : item.value.clientMessageId
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptySubtitle}>
              Share an update, attach a file, or mention an agent.
            </Text>
          </View>
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
            onReply={messageId => setReplyToMessageId(messageId)}
            onThread={messageId =>
              navigation.navigate('Thread', {
                channelId: route.params.channelId,
                channelName: route.params.name,
                rootMessageId: messageId,
              })
            }
            onRetry={clientMessageId => {
              markQueued(clientMessageId);
            }}
            onSave={async messageId => {
              await toggleSaved({
                messageId: messageId as Id<'channelMessages'>,
              });
            }}
            onSendAttachment={attachment => send('', [], [attachment])}
          />
        )}
      />
      <MessageComposer
        channelName={route.params.name}
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
  topicBar: {
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  topic: { color: colors.secondaryLabel, fontSize: 13 },
  list: { paddingBottom: 10, paddingTop: 6 },
  emptyList: { flexGrow: 1 },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 34,
  },
  emptyTitle: { color: colors.label, fontSize: 20, fontWeight: '700' },
  emptySubtitle: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  headerButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
