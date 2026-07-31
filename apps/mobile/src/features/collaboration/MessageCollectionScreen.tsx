import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { SymbolView } from 'expo-symbols';

import { api } from '@vector/convex/_generated/api';
import type { RootStackParamList } from '@/navigation/types';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { colors } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MessageCollection'>;

export function MessageCollectionScreen({ navigation, route }: Props) {
  const { orgSlug } = useWorkspace();
  const mode = route.params.mode;
  const priority = useQuery(
    api.collaboration.messages.listPriorityInbox,
    mode === 'saved' ? 'skip' : { orgSlug, limit: 100 },
  );
  const saved = useQuery(
    api.collaboration.messages.listSaved,
    mode === 'saved' ? { orgSlug, limit: 100 } : 'skip',
  );
  const channels = useQuery(api.collaboration.channels.list, {
    orgSlug,
    limit: 100,
  });
  const channelById = useMemo(
    () =>
      new Map((channels ?? []).map(item => [item.channel._id, item.channel])),
    [channels],
  );
  const items =
    mode === 'saved'
      ? (saved ?? []).map(message => ({ message, reason: 'saved' }))
      : (priority ?? [])
          .filter(
            item =>
              mode !== 'threads' ||
              item.reason === 'thread_reply' ||
              item.reason === 'followed_thread',
          )
          .map(item => ({ message: item.message, reason: item.reason }));

  return (
    <View style={styles.page}>
      <FlatList
        contentContainerStyle={!items.length ? styles.emptyList : undefined}
        data={items}
        keyExtractor={item => item.message.message._id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <SymbolView
              name={
                (mode === 'saved'
                  ? 'bookmark'
                  : mode === 'threads'
                    ? 'bubble.left.and.bubble.right'
                    : 'at') as never
              }
              size={28}
              tintColor={colors.tertiaryLabel}
            />
            <Text style={styles.emptyTitle}>
              {mode === 'saved'
                ? 'No saved messages'
                : mode === 'threads'
                  ? 'No thread updates'
                  : 'You’re all caught up'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const view = item.message;
          const channel = channelById.get(view.message.channelId);
          const author =
            view.authorAgent?.name ??
            view.authorUser?.name ??
            view.authorUser?.email ??
            'Unknown';
          return (
            <Pressable
              onPress={() => {
                if (!channel) return;
                if (view.message.threadRootId) {
                  navigation.navigate('Thread', {
                    channelId: channel._id,
                    channelName: channel.name,
                    rootMessageId: view.message.threadRootId,
                  });
                } else {
                  navigation.navigate('Channel', {
                    channelId: channel._id,
                    kind: channel.kind,
                    name: channel.name,
                    topic: channel.topic,
                  });
                }
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <SymbolView
                  name={
                    (item.reason === 'mention'
                      ? 'at'
                      : item.reason === 'direct_message'
                        ? 'bubble.left'
                        : item.reason === 'saved'
                          ? 'bookmark.fill'
                          : 'bubble.left.and.bubble.right') as never
                  }
                  size={18}
                  tintColor={colors.accent}
                />
              </View>
              <View style={styles.copy}>
                <View style={styles.metadata}>
                  <Text numberOfLines={1} style={styles.author}>
                    {author}
                  </Text>
                  <Text numberOfLines={1} style={styles.channel}>
                    {channel ? `#${channel.name}` : ''}
                  </Text>
                  <Text style={styles.time}>
                    {new Date(view.message.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.body}>
                  {view.message.body || 'Shared an attachment'}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  row: {
    alignItems: 'flex-start',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  pressed: { backgroundColor: colors.fill },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: { flex: 1, marginLeft: 10, minWidth: 0 },
  metadata: { alignItems: 'center', flexDirection: 'row' },
  author: {
    color: colors.label,
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '42%',
  },
  channel: {
    color: colors.secondaryLabel,
    flex: 1,
    fontSize: 12,
    marginLeft: 6,
  },
  time: { color: colors.tertiaryLabel, fontSize: 11 },
  body: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 3,
  },
  emptyList: { flexGrow: 1 },
  empty: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  emptyTitle: {
    color: colors.secondaryLabel,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
});
