import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  FlatList,
  Pressable,
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
  const { orgSlug, organizations, setOrgSlug } = useWorkspace();
  const channels = useQuery(api.collaboration.channels.list, {
    orgSlug,
    limit: 100,
  });
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (channels ?? []).filter(item => {
      if (directOnly && !['direct', 'group_direct'].includes(item.channel.kind))
        return false;
      if (!needle) return true;
      return [item.channel.name, item.channel.topic, item.channel.description]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(needle));
    });
  }, [channels, directOnly, search]);

  function compose() {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'New message', 'New channel'],
        cancelButtonIndex: 0,
        title: 'Start a conversation',
      },
      index => {
        if (index === 1)
          navigation.navigate('NewConversation', { mode: 'direct' });
        if (index === 2)
          navigation.navigate('NewConversation', { mode: 'channel' });
      },
    );
  }

  function chooseWorkspace() {
    const options = ['Cancel', ...organizations.map(org => org.name)];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
        title: 'Switch workspace',
      },
      index => {
        const selected = organizations[index - 1];
        if (selected) setOrgSlug(selected.slug);
      },
    );
  }

  return (
    <View style={styles.page}>
      <ScreenHeader
        title={directOnly ? 'Direct messages' : 'Home'}
        onLeadingPress={chooseWorkspace}
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
          placeholder='Search conversations'
          placeholderTextColor={colors.secondaryLabel}
          style={styles.searchInput}
          value={search}
        />
      </View>

      {!directOnly ? (
        <FlatList
          contentContainerStyle={styles.shortcuts}
          data={
            [
              ['at', 'Priority'],
              ['bubble.left.and.bubble.right', 'Threads'],
              ['bookmark', 'Saved'],
              ['cpu', 'Agents'],
            ] as const
          }
          horizontal
          keyExtractor={item => item[1]}
          renderItem={({ item }) => (
            <Pressable
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
          )}
          showsHorizontalScrollIndicator={false}
          style={styles.shortcutRail}
        />
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={item => item.channel._id}
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
              <View style={[styles.icon, isDirect && styles.directIcon]}>
                <SymbolView
                  name={(isDirect ? 'bubble.left' : 'number') as never}
                  size={20}
                  tintColor={isDirect ? colors.accent : colors.secondaryLabel}
                />
              </View>
              <View style={styles.rowBody}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {item.channel.name}
                </Text>
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
              <SymbolView
                name='chevron.right'
                size={14}
                tintColor={colors.tertiaryLabel}
              />
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
    borderRadius: 14,
    flexDirection: 'row',
    height: 42,
    marginHorizontal: 16,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: colors.label,
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
    paddingVertical: 0,
  },
  shortcuts: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  shortcutRail: { flexGrow: 0 },
  shortcut: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 7,
    height: 40,
    paddingHorizontal: 12,
  },
  shortcutLabel: { color: colors.label, fontSize: 15, fontWeight: '600' },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: metrics.rowHeight,
    paddingHorizontal: 16,
  },
  rowPressed: { backgroundColor: colors.fill },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 11,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  directIcon: { backgroundColor: 'rgba(0,153,194,0.12)' },
  rowBody: { flex: 1, marginLeft: 12, minWidth: 0, paddingVertical: 9 },
  rowTitle: { color: colors.label, fontSize: 17, fontWeight: '600' },
  rowSubtitle: { color: colors.secondaryLabel, fontSize: 13, marginTop: 1 },
  badge: {
    alignItems: 'center',
    backgroundColor: '#0099c2',
    borderRadius: 12,
    justifyContent: 'center',
    marginRight: 10,
    minHeight: 23,
    minWidth: 23,
    paddingHorizontal: 6,
  },
  badgeLabel: { color: 'white', fontSize: 12, fontWeight: '700' },
});
