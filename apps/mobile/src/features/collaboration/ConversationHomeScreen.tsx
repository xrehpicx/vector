import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from 'convex/react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { SymbolView } from 'expo-symbols';

import { api } from '@vector/convex/_generated/api';
import type { RootStackParamList } from '@/navigation/types';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { colors, metrics } from '@/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

type Props = { directOnly?: boolean };

export function ConversationHomeScreen({ directOnly = false }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { orgSlug, organizations } = useWorkspace();
  const channels = useQuery(api.collaboration.channels.list, {
    orgSlug,
    limit: 100,
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const activeOrganization = organizations.find(org => org.slug === orgSlug);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (channels ?? []).filter(item => {
      if (directOnly && !['direct', 'group_direct'].includes(item.channel.kind))
        return false;
      if (filter === 'unread' && item.unreadCount === 0) return false;
      if (!needle) return true;
      return [item.channel.name, item.channel.topic, item.channel.description]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(needle));
    });
  }, [channels, directOnly, filter, search]);

  function compose() {
    navigation.navigate('NewConversation', { mode: 'direct' });
  }

  return (
    <View style={styles.page}>
      <ScreenHeader
        title={directOnly ? 'Messages' : 'Inbox'}
        subtitle={activeOrganization?.name ?? 'Vector workspace'}
        onTrailingPress={compose}
      />
      <View style={styles.search}>
        <SymbolView
          name='magnifyingglass'
          size={18}
          tintColor={colors.secondaryLabel}
        />
        <TextInput
          onChangeText={setSearch}
          placeholder='Search or ask Vector'
          placeholderTextColor={colors.secondaryLabel}
          style={styles.searchInput}
          value={search}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.filterRail}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
      >
        {(['all', 'unread'] as const).map(value => (
          <Pressable
            accessibilityState={{ selected: filter === value }}
            key={value}
            onPress={() => setFilter(value)}
            style={({ pressed }) => [
              styles.filter,
              filter === value && styles.filterSelected,
              pressed && styles.filterPressed,
            ]}
          >
            <Text
              style={[
                styles.filterLabel,
                filter === value && styles.filterLabelSelected,
              ]}
            >
              {value === 'all' ? 'All' : 'Unread'}
            </Text>
          </Pressable>
        ))}
        {!directOnly
          ? (
              [
                ['at', 'Priority'],
                ['bubble.left.and.bubble.right', 'Threads'],
                ['bookmark', 'Saved'],
                ['cpu', 'Agents'],
              ] as const
            ).map(item => (
              <Pressable
                key={item[1]}
                onPress={() => {
                  if (item[1] === 'Agents') navigation.navigate('Agents');
                  else
                    navigation.navigate('MessageCollection', {
                      mode: item[1].toLowerCase() as
                        'priority' | 'threads' | 'saved',
                    });
                }}
                style={styles.shortcut}
              >
                <SymbolView
                  name={item[0] as never}
                  size={17}
                  tintColor={colors.secondaryLabel}
                />
                <Text style={styles.shortcutLabel}>{item[1]}</Text>
              </Pressable>
            ))
          : null}
      </ScrollView>

      <FlatList
        contentContainerStyle={
          visible.length === 0 ? styles.emptyList : styles.listContent
        }
        data={visible}
        keyExtractor={item => item.channel._id}
        ListEmptyComponent={
          channels !== undefined ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <SymbolView
                  name={
                    search || filter === 'unread'
                      ? 'line.3.horizontal.decrease'
                      : 'bubble.left.and.bubble.right'
                  }
                  size={22}
                  tintColor={colors.secondaryLabel}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {search
                  ? 'No matching conversations'
                  : filter === 'unread'
                    ? 'You’re all caught up'
                    : directOnly
                      ? 'No direct messages yet'
                      : 'No conversations yet'}
              </Text>
              <Text style={styles.emptyCopy}>
                {search
                  ? 'Try another name or keyword.'
                  : 'New messages will appear here.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isDirect = ['direct', 'group_direct'].includes(
            item.channel.kind,
          );
          return (
            <Pressable
              onPress={() =>
                navigation.navigate('Channel', {
                  channelId: item.channel._id,
                  kind: item.channel.kind,
                  name: item.channel.name,
                  topic: item.channel.topic,
                })
              }
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
            >
              {isDirect ? (
                <View style={styles.directAvatar}>
                  <Text style={styles.directAvatarLabel}>
                    {item.channel.name.trim().at(0)?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              ) : (
                <View style={styles.icon}>
                  <SymbolView
                    name={
                      (item.channel.kind === 'private'
                        ? 'lock.fill'
                        : 'number') as never
                    }
                    size={18}
                    tintColor={colors.secondaryLabel}
                  />
                </View>
              )}
              <View style={styles.rowBody}>
                <View style={styles.rowTitleLine}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {item.channel.name}
                  </Text>
                  <Text style={styles.rowTime}>
                    {formatActivity(
                      item.channel.lastMessageAt ?? item.channel.createdAt,
                    )}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.rowSubtitle}>
                  {isDirect
                    ? 'Direct message'
                    : (item.channel.topic ??
                      item.channel.description ??
                      'Channel')}
                </Text>
              </View>
              {item.unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>
                    {Math.min(99, item.unreadCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  search: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 13,
    flexDirection: 'row',
    height: 40,
    marginHorizontal: 16,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: colors.label,
    flex: 1,
    fontSize: 15,
    marginLeft: 8,
    paddingVertical: 0,
  },
  filterRail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterScroller: { flexGrow: 0 },
  filter: {
    borderColor: colors.separator,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 13,
  },
  filterSelected: { backgroundColor: colors.label, borderColor: colors.label },
  filterPressed: { opacity: 0.65 },
  filterLabel: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: '600',
  },
  filterLabelSelected: { color: colors.background },
  shortcut: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 11,
    flexDirection: 'row',
    gap: 7,
    height: 32,
    paddingHorizontal: 11,
  },
  shortcutLabel: { color: colors.label, fontSize: 14, fontWeight: '600' },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: metrics.rowHeight,
    paddingHorizontal: 16,
  },
  rowPressed: { backgroundColor: colors.fill },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  directAvatar: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  directAvatarLabel: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  rowBody: { flex: 1, marginLeft: 11, minWidth: 0, paddingVertical: 8 },
  rowTitleLine: { alignItems: 'baseline', flexDirection: 'row' },
  rowTitle: { color: colors.label, flex: 1, fontSize: 16, fontWeight: '600' },
  rowTime: { color: colors.tertiaryLabel, fontSize: 11, marginLeft: 8 },
  rowSubtitle: { color: colors.secondaryLabel, fontSize: 13, marginTop: 1 },
  badge: {
    alignItems: 'center',
    backgroundColor: '#0099c2',
    borderRadius: 12,
    justifyContent: 'center',
    marginLeft: 10,
    minHeight: 23,
    minWidth: 23,
    paddingHorizontal: 6,
  },
  badgeLabel: { color: 'white', fontSize: 12, fontWeight: '700' },
  listContent: { paddingBottom: 112 },
  emptyList: { flexGrow: 1, paddingBottom: 112 },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  emptyTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyCopy: {
    color: colors.secondaryLabel,
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
});

function formatActivity(value: number) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
