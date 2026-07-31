import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery } from 'convex/react';
import { SymbolView } from 'expo-symbols';

import { api } from '@vector/convex/_generated/api';
import type { Id } from '@vector/convex/_generated/dataModel';
import type { RootStackParamList } from '@/navigation/types';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { colors } from '@/theme';
import { Avatar } from '@/components/Avatar';

type Props = NativeStackScreenProps<RootStackParamList, 'NewConversation'>;

export function NewConversationScreen({ navigation, route }: Props) {
  const { orgSlug } = useWorkspace();
  const currentUser = useQuery(api.users.currentUser);
  const members = useQuery(api.organizations.queries.searchMembers, {
    orgSlug,
    limit: 100,
  });
  const createChannel = useMutation(api.collaboration.channels.create);
  const [mode, setMode] = useState<'direct' | 'channel'>(
    route.params?.mode ?? 'direct',
  );
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (members ?? [])
      .filter(member => member.user && member.user._id !== currentUser?._id)
      .filter(member => {
        if (!needle) return true;
        return [member.user?.name, member.user?.username, member.user?.email]
          .filter(Boolean)
          .some(value => value!.toLowerCase().includes(needle));
      });
  }, [currentUser?._id, members, search]);

  const selectedPerson = people.find(
    member => member.user?._id === selectedUserId,
  )?.user;
  const canCreate =
    mode === 'direct' ? Boolean(selectedPerson) : Boolean(name.trim());

  useEffect(() => {
    navigation.setOptions({
      title: mode === 'direct' ? 'New message' : 'New channel',
    });
  }, [mode, navigation]);

  async function submit() {
    if (!canCreate || pending) return;
    setPending(true);
    setError(null);
    try {
      const kind =
        mode === 'direct' ? 'direct' : isPrivate ? 'private' : 'public';
      const channelName =
        mode === 'direct'
          ? (selectedPerson?.name ??
            selectedPerson?.username ??
            selectedPerson?.email ??
            'Direct message')
          : name.trim();
      const channelId = await createChannel({
        orgSlug,
        kind,
        name: channelName,
        topic: mode === 'channel' && topic.trim() ? topic.trim() : undefined,
        memberUserIds:
          mode === 'direct' && selectedPerson
            ? [selectedPerson._id as Id<'users'>]
            : undefined,
      });
      navigation.replace('Channel', {
        channelId,
        kind,
        name: channelName,
        topic: mode === 'channel' && topic.trim() ? topic.trim() : undefined,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Vector could not create this conversation.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.page}
    >
      {mode === 'direct' ? (
        <>
          <Pressable
            accessibilityRole='button'
            onPress={() => setMode('channel')}
            style={({ pressed }) => [
              styles.newChannelRow,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.actionIcon}>
              <SymbolView name='number' size={18} tintColor={colors.accent} />
            </View>
            <View style={styles.personCopy}>
              <Text style={styles.personName}>New channel</Text>
              <Text style={styles.personEmail}>
                Create a shared space for your team
              </Text>
            </View>
            <SymbolView
              name='chevron.right'
              size={14}
              tintColor={colors.tertiaryLabel}
            />
          </Pressable>
          <View style={styles.searchBox}>
            <SymbolView
              name='magnifyingglass'
              size={17}
              tintColor={colors.secondaryLabel}
            />
            <TextInput
              autoFocus
              onChangeText={setSearch}
              placeholder='Find a teammate'
              placeholderTextColor={colors.tertiaryLabel}
              style={styles.searchInput}
              value={search}
            />
          </View>
          <FlatList
            data={people}
            keyExtractor={member => member.user!._id}
            keyboardShouldPersistTaps='handled'
            renderItem={({ item }) => {
              const user = item.user!;
              const selected = user._id === selectedUserId;
              return (
                <Pressable
                  onPress={() => setSelectedUserId(user._id)}
                  style={styles.personRow}
                >
                  <Avatar
                    image={user.image}
                    name={user.name ?? user.email}
                    size={38}
                  />
                  <View style={styles.personCopy}>
                    <Text numberOfLines={1} style={styles.personName}>
                      {user.name ?? user.username ?? user.email}
                    </Text>
                    <Text numberOfLines={1} style={styles.personEmail}>
                      {user.email}
                    </Text>
                  </View>
                  {selected ? (
                    <SymbolView
                      name='checkmark.circle.fill'
                      size={22}
                      tintColor={colors.accent}
                    />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </>
      ) : (
        <View style={styles.channelForm}>
          <Pressable
            accessibilityRole='button'
            onPress={() => setMode('direct')}
            style={({ pressed }) => [
              styles.backToPeople,
              pressed && styles.rowPressed,
            ]}
          >
            <SymbolView
              name='chevron.left'
              size={14}
              tintColor={colors.accent}
            />
            <Text style={styles.backToPeopleLabel}>New message</Text>
          </Pressable>
          <Text style={styles.label}>Channel name</Text>
          <TextInput
            autoCapitalize='none'
            autoFocus
            onChangeText={setName}
            placeholder='design-systems'
            placeholderTextColor={colors.tertiaryLabel}
            style={styles.field}
            value={name}
          />
          <Text style={styles.label}>Topic</Text>
          <TextInput
            multiline
            onChangeText={setTopic}
            placeholder='What belongs in this channel?'
            placeholderTextColor={colors.tertiaryLabel}
            style={[styles.field, styles.topicField]}
            value={topic}
          />
          <View style={styles.visibilityRow}>
            <SymbolView
              name={(isPrivate ? 'lock.fill' : 'number') as never}
              size={18}
              tintColor={colors.secondaryLabel}
            />
            <View style={styles.personCopy}>
              <Text style={styles.personName}>
                {isPrivate ? 'Private channel' : 'Public channel'}
              </Text>
              <Text style={styles.personEmail}>
                {isPrivate
                  ? 'Invite-only'
                  : 'Visible to everyone in the workspace'}
              </Text>
            </View>
            <Switch
              accessibilityLabel='Private channel'
              onValueChange={setIsPrivate}
              trackColor={{ true: colors.accent }}
              value={isPrivate}
            />
          </View>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.footer}>
        <Pressable
          disabled={!canCreate || pending}
          onPress={submit}
          style={[
            styles.createButton,
            (!canCreate || pending) && styles.createButtonDisabled,
          ]}
        >
          {pending ? (
            <ActivityIndicator color='white' />
          ) : (
            <Text style={styles.createButtonLabel}>
              {mode === 'direct' ? 'Message' : 'Create channel'}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  newChannelRow: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 16,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowPressed: { backgroundColor: colors.fill },
  searchBox: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  searchInput: {
    color: colors.label,
    flex: 1,
    fontSize: 16,
    height: 48,
    marginLeft: 9,
  },
  personRow: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 16,
  },
  personCopy: { flex: 1, marginLeft: 11, minWidth: 0 },
  personName: { color: colors.label, fontSize: 16, fontWeight: '600' },
  personEmail: { color: colors.secondaryLabel, fontSize: 13, marginTop: 2 },
  channelForm: { gap: 8, padding: 16 },
  backToPeople: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
    marginLeft: -6,
    minHeight: 32,
    paddingHorizontal: 6,
  },
  backToPeopleLabel: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  label: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 7,
  },
  field: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    color: colors.label,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  topicField: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  visibilityRow: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    flexDirection: 'row',
    marginTop: 6,
    minHeight: 58,
    paddingHorizontal: 13,
  },
  error: {
    color: colors.destructive,
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 'auto',
    padding: 16,
  },
  createButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
  },
  createButtonDisabled: { opacity: 0.4 },
  createButtonLabel: { color: 'white', fontSize: 16, fontWeight: '700' },
});
