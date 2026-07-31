import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useQuery } from 'convex/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ScreenHeader } from '@/components/ScreenHeader';
import { colors } from '@/theme';
import { api } from '@vector/convex/_generated/api';
import type { RootStackParamList } from '@/navigation/types';
import { useWorkspace } from '@/providers/WorkspaceProvider';

export function SearchScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { orgSlug } = useWorkspace();
  const [query, setQuery] = useState('');
  const results = useQuery(
    api.collaboration.messages.search,
    query.trim().length >= 2
      ? { orgSlug, query: query.trim(), limit: 50 }
      : 'skip',
  );
  return (
    <View style={styles.page}>
      <ScreenHeader title='Search' trailingSymbol='slider.horizontal.3' />
      <View style={styles.search}>
        <SymbolView
          name='magnifyingglass'
          size={19}
          tintColor={colors.secondaryLabel}
        />
        <TextInput
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder='Search messages and files'
          placeholderTextColor={colors.secondaryLabel}
          style={styles.input}
          value={query}
        />
      </View>
      <FlatList
        data={results ?? []}
        keyExtractor={item => item.message.message._id}
        keyboardShouldPersistTaps='handled'
        renderItem={({ item }) => {
          const author =
            item.message.authorAgent?.name ??
            item.message.authorUser?.name ??
            item.message.authorUser?.email ??
            'Unknown';
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
                styles.result,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.resultHeader}>
                <Text numberOfLines={1} style={styles.author}>
                  {author}
                </Text>
                <Text numberOfLines={1} style={styles.channel}>
                  #{item.channel.name}
                </Text>
              </View>
              <Text numberOfLines={2} style={styles.body}>
                {item.message.message.body ||
                  item.message.attachments[0]?.name ||
                  'Attachment'}
              </Text>
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
    height: 44,
    marginHorizontal: 16,
    paddingHorizontal: 12,
  },
  input: { color: colors.label, flex: 1, fontSize: 17, marginLeft: 8 },
  result: {
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: colors.fill },
  resultHeader: { alignItems: 'center', flexDirection: 'row' },
  author: {
    color: colors.label,
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '55%',
  },
  channel: { color: colors.accent, fontSize: 12, marginLeft: 7 },
  body: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 3,
  },
});
