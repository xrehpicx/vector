import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from 'convex/react';
import { SymbolView } from 'expo-symbols';

import { api } from '@vector/convex/_generated/api';
import { Avatar } from '@/components/Avatar';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { colors } from '@/theme';

export function AgentsScreen() {
  const { orgSlug } = useWorkspace();
  const [now] = useState(() => Date.now());
  const agents = useQuery(api.collaboration.agents.list, {
    orgSlug,
    now,
    limit: 100,
  });
  return (
    <View style={styles.page}>
      <FlatList
        contentContainerStyle={!agents?.length ? styles.emptyList : undefined}
        data={agents ?? []}
        keyExtractor={item => item.agent._id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <SymbolView name='cpu' size={30} tintColor={colors.tertiaryLabel} />
            <Text style={styles.emptyTitle}>No agents registered</Text>
            <Text style={styles.emptyCopy}>
              Register and connect an agent from Vector on the web or the Vector
              CLI.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Avatar
              agent
              image={item.agent.avatar}
              name={item.agent.name}
              size={40}
            />
            <View style={styles.copy}>
              <View style={styles.titleLine}>
                <Text numberOfLines={1} style={styles.name}>
                  {item.agent.name}
                </Text>
                <Text style={styles.handle}>@{item.agent.handle}</Text>
              </View>
              <Text numberOfLines={1} style={styles.description}>
                {item.agent.description ||
                  item.workspace?.label ||
                  item.agent.provider}
              </Text>
              <Text numberOfLines={1} style={styles.owner}>
                Owned by {item.owner?.name ?? item.owner?.email ?? 'a teammate'}
              </Text>
            </View>
            <View
              style={[styles.statusDot, item.connected && styles.connected]}
            />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: colors.fill },
  copy: { flex: 1, marginLeft: 11, minWidth: 0 },
  titleLine: { alignItems: 'center', flexDirection: 'row' },
  name: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '700',
    maxWidth: '58%',
  },
  handle: { color: colors.accent, fontSize: 12, marginLeft: 6 },
  description: { color: colors.secondaryLabel, fontSize: 13, marginTop: 2 },
  owner: { color: colors.tertiaryLabel, fontSize: 11, marginTop: 2 },
  statusDot: {
    backgroundColor: colors.tertiaryLabel,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  connected: { backgroundColor: '#20c57a' },
  emptyList: { flexGrow: 1 },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: colors.label,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyCopy: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
    textAlign: 'center',
  },
});
