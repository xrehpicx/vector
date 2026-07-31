import { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery } from 'convex/react';
import { SymbolView } from 'expo-symbols';

import { api } from '@vector/convex/_generated/api';
import type { Id } from '@vector/convex/_generated/dataModel';
import { Avatar } from '@/components/Avatar';
import type { RootStackParamList } from '@/navigation/types';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { colors } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChannelDetails'>;

export function ChannelDetailsScreen({ navigation, route }: Props) {
  const channelId = route.params.channelId as Id<'channels'>;
  const { currentUser, orgSlug } = useWorkspace();
  const details = useQuery(api.collaboration.channels.get, { channelId });
  const members = useQuery(api.collaboration.channels.listMembers, {
    channelId,
  });
  const orgMembers = useQuery(api.organizations.queries.searchMembers, {
    orgSlug,
    limit: 100,
  });
  const update = useMutation(api.collaboration.channels.update);
  const archive = useMutation(api.collaboration.channels.archive);
  const addMember = useMutation(api.collaboration.channels.addMember);
  const removeMember = useMutation(api.collaboration.channels.removeMember);
  const setPreferences = useMutation(api.collaboration.channels.setPreferences);
  const [name, setName] = useState(route.params.name);
  const [topic, setTopic] = useState(route.params.topic ?? '');
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [optimisticMode, setOptimisticMode] = useState<string | null>(null);

  const canManage =
    details?.membership?.role === 'owner' ||
    details?.membership?.role === 'moderator';
  const notificationMode =
    optimisticMode ?? details?.membership?.notificationMode ?? 'mentions';

  useEffect(() => {
    if (!details) return;
    setName(details.channel.name);
    setTopic(details.channel.topic ?? '');
  }, [details]);

  const availableMembers = useMemo(() => {
    const existing = new Set(
      (members ?? []).map(member => member.membership.userId),
    );
    const needle = search.trim().toLowerCase();
    return (orgMembers ?? [])
      .filter(member => member.user && !existing.has(member.user._id))
      .filter(
        member =>
          !needle ||
          [member.user?.name, member.user?.username, member.user?.email]
            .filter(Boolean)
            .some(value => value!.toLowerCase().includes(needle)),
      );
  }, [members, orgMembers, search]);

  async function save() {
    if (pending || !name.trim()) return;
    setPending(true);
    try {
      await update({
        channelId,
        name: name.trim(),
        topic: topic.trim() || null,
      });
      navigation.setParams({
        name: name.trim(),
        topic: topic.trim() || undefined,
      });
      setEditing(false);
    } finally {
      setPending(false);
    }
  }

  function chooseNotifications() {
    const modes = ['all', 'mentions', 'muted'] as const;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        cancelButtonIndex: 0,
        options: ['Cancel', 'Every message', 'Mentions only', 'Muted'],
        title: 'Channel notifications',
      },
      index => {
        const mode = modes[index - 1];
        if (!mode) return;
        setOptimisticMode(mode);
        void setPreferences({ channelId, notificationMode: mode }).finally(() =>
          setOptimisticMode(null),
        );
      },
    );
  }

  function memberActions(userId: string, label: string) {
    if (!canManage || userId === currentUser._id) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        cancelButtonIndex: 0,
        destructiveButtonIndex: 1,
        options: ['Cancel', `Remove ${label}`],
      },
      index => {
        if (index === 1)
          void removeMember({ channelId, userId: userId as Id<'users'> });
      },
    );
  }

  function confirmArchive() {
    Alert.alert(
      details?.channel.archivedAt ? 'Restore channel?' : 'Archive channel?',
      details?.channel.archivedAt
        ? 'The channel will return to conversation lists.'
        : 'Messages remain available, but new messages are disabled.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () =>
            void archive({
              channelId,
              archived: !details?.channel.archivedAt,
            }).then(() => navigation.goBack()),
          style: details?.channel.archivedAt ? 'default' : 'destructive',
          text: details?.channel.archivedAt ? 'Restore' : 'Archive',
        },
      ],
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.identity}>
        <View style={styles.channelIcon}>
          <SymbolView
            name={
              (route.params.kind === 'direct'
                ? 'bubble.left.fill'
                : route.params.kind === 'private'
                  ? 'lock.fill'
                  : 'number') as never
            }
            size={25}
            tintColor={colors.accent}
          />
        </View>
        {editing ? (
          <>
            <TextInput
              autoFocus
              onChangeText={setName}
              style={styles.nameField}
              value={name}
            />
            <TextInput
              multiline
              onChangeText={setTopic}
              placeholder='Add a topic'
              placeholderTextColor={colors.tertiaryLabel}
              style={styles.topicField}
              value={topic}
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={() => setEditing(false)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={pending || !name.trim()}
                onPress={() => void save()}
                style={[
                  styles.primaryButton,
                  (pending || !name.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.primaryButtonLabel}>Save</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.name}>
              {details?.channel.name ?? route.params.name}
            </Text>
            <Text style={styles.topic}>
              {details?.channel.topic ||
                (route.params.kind === 'direct'
                  ? 'Direct message'
                  : 'No topic yet')}
            </Text>
            {canManage && route.params.kind !== 'direct' ? (
              <Pressable
                onPress={() => setEditing(true)}
                style={styles.editButton}
              >
                <Text style={styles.editButtonLabel}>Edit details</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.group}>
        <Pressable onPress={chooseNotifications} style={styles.settingRow}>
          <SymbolView name='bell' size={19} tintColor={colors.secondaryLabel} />
          <Text style={styles.settingLabel}>Notifications</Text>
          <Text style={styles.settingValue}>
            {notificationMode === 'all'
              ? 'Every message'
              : notificationMode === 'muted'
                ? 'Muted'
                : 'Mentions'}
          </Text>
          <SymbolView
            name='chevron.right'
            size={12}
            tintColor={colors.tertiaryLabel}
          />
        </Pressable>
      </View>

      <View style={styles.memberHeader}>
        <Text style={styles.sectionTitle}>{members?.length ?? 0} members</Text>
        {canManage && route.params.kind !== 'direct' ? (
          <Pressable
            onPress={() => setMemberSheetOpen(true)}
            style={styles.addButton}
          >
            <SymbolView
              name='person.badge.plus'
              size={17}
              tintColor={colors.accent}
            />
            <Text style={styles.addButtonLabel}>Add</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={members ?? []}
        keyExtractor={member => member.membership._id}
        renderItem={({ item }) => {
          const label = item.user?.name ?? item.user?.email ?? 'Member';
          return (
            <Pressable
              onLongPress={() => memberActions(item.membership.userId, label)}
              style={styles.memberRow}
            >
              <Avatar image={item.user?.image} name={label} size={36} />
              <View style={styles.memberCopy}>
                <Text numberOfLines={1} style={styles.memberName}>
                  {label}
                  {item.membership.userId === currentUser._id ? ' · you' : ''}
                </Text>
                <Text style={styles.memberRole}>{item.membership.role}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      {canManage &&
      route.params.kind !== 'direct' &&
      !details?.channel.isDefault ? (
        <Pressable onPress={confirmArchive} style={styles.archiveButton}>
          <Text style={styles.archiveLabel}>
            {details?.channel.archivedAt
              ? 'Restore channel'
              : 'Archive channel'}
          </Text>
        </Pressable>
      ) : null}

      <Modal
        animationType='slide'
        onRequestClose={() => setMemberSheetOpen(false)}
        presentationStyle='pageSheet'
        visible={memberSheetOpen}
      >
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable
              onPress={() => setMemberSheetOpen(false)}
              style={styles.headerAction}
            >
              <Text style={styles.headerActionLabel}>Done</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>Add members</Text>
            <View style={styles.headerAction} />
          </View>
          <View style={styles.searchBox}>
            <SymbolView
              name='magnifyingglass'
              size={17}
              tintColor={colors.secondaryLabel}
            />
            <TextInput
              autoFocus
              onChangeText={setSearch}
              placeholder='Search teammates'
              placeholderTextColor={colors.tertiaryLabel}
              style={styles.searchInput}
              value={search}
            />
          </View>
          <FlatList
            data={availableMembers}
            keyExtractor={member => member.user!._id}
            keyboardShouldPersistTaps='handled'
            renderItem={({ item }) => {
              const user = item.user!;
              const label = user.name ?? user.username ?? user.email;
              return (
                <Pressable
                  onPress={() =>
                    void addMember({
                      channelId,
                      userId: user._id as Id<'users'>,
                    })
                  }
                  style={styles.memberRow}
                >
                  <Avatar image={user.image} name={label} size={36} />
                  <Text numberOfLines={1} style={styles.availableName}>
                    {label}
                  </Text>
                  <SymbolView
                    name='plus.circle'
                    size={21}
                    tintColor={colors.accent}
                  />
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.groupedBackground, flex: 1 },
  identity: {
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingBottom: 18,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  channelIcon: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  name: { color: colors.label, fontSize: 22, fontWeight: '700', marginTop: 10 },
  topic: {
    color: colors.secondaryLabel,
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  editButton: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 5 },
  editButtonLabel: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  nameField: {
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    color: colors.label,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 10,
    padding: 7,
    textAlign: 'center',
    width: '100%',
  },
  topicField: {
    color: colors.secondaryLabel,
    fontSize: 14,
    maxHeight: 82,
    minHeight: 42,
    padding: 7,
    textAlign: 'center',
    width: '100%',
  },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  secondaryButton: {
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryButtonLabel: {
    color: colors.secondaryLabel,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  primaryButtonLabel: { color: 'white', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  group: { backgroundColor: colors.background, marginTop: 12 },
  settingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  settingLabel: { color: colors.label, flex: 1, fontSize: 16 },
  settingValue: { color: colors.secondaryLabel, fontSize: 14 },
  memberHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 5,
    paddingTop: 17,
  },
  sectionTitle: {
    color: colors.secondaryLabel,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  addButton: { alignItems: 'center', flexDirection: 'row', gap: 5, padding: 5 },
  addButtonLabel: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  memberRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  memberCopy: { flex: 1, marginLeft: 10 },
  memberName: { color: colors.label, fontSize: 15, fontWeight: '600' },
  memberRole: {
    color: colors.secondaryLabel,
    fontSize: 12,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  archiveButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    marginTop: 12,
    paddingVertical: 14,
  },
  archiveLabel: { color: colors.destructive, fontSize: 15, fontWeight: '600' },
  sheet: { backgroundColor: colors.background, flex: 1 },
  sheetHeader: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 50,
    paddingHorizontal: 8,
  },
  sheetTitle: {
    color: colors.label,
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerAction: { alignItems: 'center', minWidth: 52, padding: 8 },
  headerActionLabel: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    flexDirection: 'row',
    margin: 12,
    paddingHorizontal: 11,
  },
  searchInput: {
    color: colors.label,
    flex: 1,
    fontSize: 16,
    height: 42,
    marginLeft: 8,
  },
  availableName: {
    color: colors.label,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
});
