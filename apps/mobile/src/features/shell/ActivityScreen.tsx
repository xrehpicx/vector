import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from 'convex/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';

import { ScreenHeader } from '@/components/ScreenHeader';
import { colors } from '@/theme';
import { api } from '@vector/convex/_generated/api';
import type { RootStackParamList } from '@/navigation/types';
import { useWorkspace } from '@/providers/WorkspaceProvider';

export function ActivityScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { orgSlug } = useWorkspace();
  const items = useQuery(api.collaboration.messages.listPriorityInbox, {
    orgSlug,
    limit: 100,
  });
  return (
    <View style={styles.page}>
      <ScreenHeader
        title='Activity'
        trailingSymbol='line.3.horizontal.decrease'
      />
      <FlatList
        contentContainerStyle={!items?.length ? styles.emptyList : undefined}
        data={items ?? []}
        keyExtractor={item => item.message.message._id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.title}>You’re all caught up</Text>
            <Text style={styles.subtitle}>
              Mentions and replies will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const author =
            item.message.authorAgent?.name ??
            item.message.authorUser?.name ??
            item.message.authorUser?.email ??
            'Unknown';
          return (
            <Pressable
              onPress={() =>
                item.message.message.threadRootId
                  ? navigation.navigate('Thread', {
                      channelId: item.channel._id,
                      channelName: item.channel.name,
                      rootMessageId: item.message.message.threadRootId,
                    })
                  : navigation.navigate('Channel', {
                      channelId: item.channel._id,
                      kind: item.channel.kind,
                      name: item.channel.name,
                      topic: item.channel.topic,
                    })
              }
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <SymbolView
                  name={
                    (item.reason === 'mention'
                      ? 'at'
                      : item.reason === 'direct_message'
                        ? 'bubble.left'
                        : 'bubble.left.and.bubble.right') as never
                  }
                  size={18}
                  tintColor={colors.accent}
                />
              </View>
              <View style={styles.copy}>
                <Text style={styles.eyebrow}>
                  {item.reason.replaceAll('_', ' ')} · #{item.channel.name}
                </Text>
                <Text numberOfLines={1} style={styles.author}>
                  {author}
                </Text>
                <Text numberOfLines={2} style={styles.body}>
                  {item.message.message.body || 'Shared an attachment'}
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
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyList: { flexGrow: 1 },
  title: { color: colors.label, fontSize: 20, fontWeight: '700' },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  row: {
    alignItems: 'flex-start',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 80,
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
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  author: {
    color: colors.label,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  body: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
});
