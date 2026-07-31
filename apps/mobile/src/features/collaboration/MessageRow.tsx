import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Avatar } from '@/components/Avatar';
import { colors } from '@/theme';
import type { OutboxAttachment, OutboxMessage } from '@/state/outbox';
import {
  MessageAttachment,
  type MessageAttachmentData,
} from './MessageAttachment';

type ServerMessage = {
  message: {
    _id: string;
    body: string;
    clientMessageId?: string;
    createdAt: number;
    deletedAt?: number;
    editedAt?: number;
    replyCount: number;
  };
  authorUser: {
    _id: string;
    name?: string;
    email?: string;
    image?: string;
  } | null;
  authorAgent: {
    _id: string;
    name: string;
    avatar?: string;
    ownerUserId: string;
  } | null;
  reactions: Array<{ _id: string; emoji: string; userId: string }>;
  attachments: MessageAttachmentData[];
  saved: boolean;
};

export type TimelineMessage =
  | { kind: 'server'; value: ServerMessage }
  | { kind: 'outbox'; value: OutboxMessage };

export function MessageRow({
  item,
  onReact,
  onReply,
  onRetry,
  onSave,
  onSendAttachment,
  onThread,
}: {
  item: TimelineMessage;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (messageId: string) => void;
  onRetry: (clientMessageId: string) => void;
  onSave: (messageId: string) => Promise<void>;
  onSendAttachment: (attachment: OutboxAttachment) => void;
  onThread: (messageId: string) => void;
}) {
  const serverSaved = item.kind === 'server' ? item.value.saved : false;
  const [saved, setSaved] = useState(serverSaved);
  const [saving, setSaving] = useState(false);
  const [reminding, setReminding] = useState(false);
  const swipeableRef = useRef<SwipeableMethods>(null);

  useEffect(() => setSaved(serverSaved), [serverSaved]);

  if (item.kind === 'outbox') {
    const failed = item.value.status === 'failed';
    return (
      <Pressable
        onPress={failed ? () => onRetry(item.value.clientMessageId) : undefined}
        style={({ pressed }) => [
          styles.row,
          styles.pending,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.authorLine}>
          <Avatar name='You' size={27} />
          <Text style={styles.author}>You</Text>
          <Text style={styles.time}>
            {new Date(item.value.createdAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        </View>
        {item.value.body ? (
          <Text selectable style={styles.body}>
            {item.value.body}
          </Text>
        ) : null}
        {item.value.attachments.length > 0 ? (
          <View style={styles.attachments}>
            {item.value.attachments.map(attachment => (
              <View key={attachment.localUri} style={styles.pendingAttachment}>
                <SymbolView
                  name={
                    (attachment.kind === 'image'
                      ? 'photo'
                      : attachment.kind === 'video'
                        ? 'video'
                        : attachment.kind === 'audio'
                          ? 'waveform'
                          : 'doc') as never
                  }
                  size={17}
                  tintColor={colors.secondaryLabel}
                />
                <Text numberOfLines={1} style={styles.pendingAttachmentName}>
                  {attachment.name}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {failed ? (
          <View style={styles.delivery}>
            <SymbolView
              name='exclamationmark.circle'
              size={13}
              tintColor={colors.destructive}
            />
            <Text style={styles.failureText}>Not sent · Tap to retry</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  const message = item.value;
  const authorName =
    message.authorAgent?.name ??
    message.authorUser?.name ??
    message.authorUser?.email ??
    'Unknown';
  const isAgent = Boolean(message.authorAgent);

  async function toggleSaved() {
    if (saving) return;
    swipeableRef.current?.close();
    setSaving(true);
    setSaved(current => !current);
    void Haptics.selectionAsync();
    try {
      await onSave(message.message._id);
    } catch {
      setSaved(serverSaved);
    } finally {
      setSaving(false);
    }
  }

  function reactionsMenu() {
    swipeableRef.current?.close();
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          'Cancel',
          '👍  Like',
          '❤️  Love',
          '😂  Laugh',
          '🎉  Celebrate',
          '✅  Done',
        ],
        cancelButtonIndex: 0,
        title: 'React to message',
      },
      index => {
        const emoji = ['', '👍', '❤️', '😂', '🎉', '✅'][index];
        if (emoji) {
          void Haptics.selectionAsync();
          onReact(message.message._id, emoji);
        }
      },
    );
  }

  function reminderMenu() {
    swipeableRef.current?.close();
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'In 20 minutes', 'In 1 hour', 'Tomorrow morning'],
        cancelButtonIndex: 0,
        title: 'Remind me about this message',
      },
      index => {
        if (index === 0) return;
        const now = new Date();
        const date =
          index === 1
            ? new Date(now.getTime() + 20 * 60_000)
            : index === 2
              ? new Date(now.getTime() + 60 * 60_000)
              : tomorrowAtNine(now);
        void scheduleReminder(date);
      },
    );
  }

  async function scheduleReminder(date: Date) {
    if (reminding) return;
    setReminding(true);
    try {
      const current = await Notifications.getPermissionsAsync();
      const permission = current.granted
        ? current
        : await Notifications.requestPermissionsAsync();
      if (!permission.granted) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Message from ${authorName}`,
          body: message.message.body || 'Shared an attachment',
          data: { messageId: message.message._id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setReminding(false);
    }
  }

  function moreMenu() {
    swipeableRef.current?.close();
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          'Cancel',
          'Reply',
          'Open thread',
          saved ? 'Remove from saved' : 'Save for later',
          'Remind me',
          'React',
        ],
        cancelButtonIndex: 0,
      },
      index => {
        if (index === 1) onReply(message.message._id);
        if (index === 2) onThread(message.message._id);
        if (index === 3) void toggleSaved();
        if (index === 4) reminderMenu();
        if (index === 5) reactionsMenu();
      },
    );
  }

  function actions() {
    moreMenu();
  }

  const reactions = Object.entries(
    message.reactions.reduce<Record<string, number>>((counts, reaction) => {
      counts[reaction.emoji] = (counts[reaction.emoji] ?? 0) + 1;
      return counts;
    }, {}),
  );

  return (
    <ReanimatedSwipeable
      childrenContainerStyle={styles.messageSurface}
      friction={1.7}
      leftThreshold={62}
      onSwipeableOpen={direction => {
        if (direction === 'left') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onReply(message.message._id);
          swipeableRef.current?.close();
        }
      }}
      overshootFriction={8}
      overshootLeft={false}
      overshootRight={false}
      ref={swipeableRef}
      renderLeftActions={() => (
        <View style={[styles.swipeAction, styles.replyAction]}>
          <SymbolView
            name='arrowshape.turn.up.left.fill'
            size={20}
            tintColor='white'
          />
          <Text style={styles.swipeLabel}>Reply</Text>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.rightActions}>
          <SwipeAction
            label='React'
            onPress={reactionsMenu}
            symbol='face.smiling'
            tone='accent'
          />
          <SwipeAction
            label={saved ? 'Saved' : 'Save'}
            onPress={() => void toggleSaved()}
            selected={saved}
            symbol={saved ? 'bookmark.fill' : 'bookmark'}
          />
          <SwipeAction
            disabled={reminding}
            label='Remind'
            onPress={reminderMenu}
            symbol='bell.badge'
            tone='accent'
          />
          <SwipeAction label='More' onPress={moreMenu} symbol='ellipsis' />
        </View>
      )}
    >
      <Pressable
        accessibilityHint='Long press or swipe for message actions'
        onLongPress={actions}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.authorLine}>
          <Avatar
            agent={isAgent}
            image={message.authorAgent?.avatar ?? message.authorUser?.image}
            name={authorName}
            size={27}
          />
          <Text numberOfLines={1} style={styles.author}>
            {authorName}
          </Text>
          {isAgent ? <Text style={styles.agentLabel}>AGENT</Text> : null}
          {message.authorAgent ? (
            <Text style={styles.owner}>by owner</Text>
          ) : null}
          <Text style={styles.time}>
            {new Date(message.message.createdAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        </View>
        {message.message.deletedAt ? (
          <Text style={styles.deleted}>This message was deleted.</Text>
        ) : message.message.body ? (
          <Text selectable style={styles.body}>
            {message.message.body}
          </Text>
        ) : null}
        {message.attachments.length > 0 ? (
          <View style={styles.attachments}>
            {message.attachments.map(attachment => (
              <MessageAttachment
                attachment={attachment}
                key={attachment._id}
                onSendAnnotation={onSendAttachment}
              />
            ))}
          </View>
        ) : null}
        {reactions.length > 0 ? (
          <View style={styles.reactions}>
            {reactions.map(([emoji, count]) => (
              <Pressable
                key={emoji}
                onPress={() => onReact(message.message._id, emoji)}
                style={styles.reaction}
              >
                <Text style={styles.reactionText}>
                  {emoji} {count}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {message.message.replyCount > 0 ? (
          <Pressable
            onPress={() => onThread(message.message._id)}
            style={styles.threadLink}
          >
            <SymbolView
              name='bubble.left'
              size={14}
              tintColor={colors.accent}
            />
            <Text style={styles.threadText}>
              {message.message.replyCount}{' '}
              {message.message.replyCount === 1 ? 'reply' : 'replies'}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

function SwipeAction({
  disabled,
  label,
  onPress,
  selected,
  symbol,
  tone,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected?: boolean;
  symbol: string;
  tone?: 'accent';
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.swipeAction,
        tone === 'accent' && styles.accentAction,
        selected && styles.selectedAction,
        pressed && styles.swipePressed,
      ]}
    >
      <SymbolView name={symbol as never} size={19} tintColor='white' />
      <Text numberOfLines={1} style={styles.swipeLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function tomorrowAtNine(now: Date) {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow;
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 9 },
  messageSurface: { backgroundColor: colors.background },
  pending: { opacity: 0.5 },
  pressed: { backgroundColor: colors.fill },
  authorLine: { alignItems: 'center', flexDirection: 'row', minWidth: 0 },
  author: {
    color: colors.label,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
    maxWidth: '55%',
  },
  agentLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 7,
  },
  owner: { color: colors.secondaryLabel, fontSize: 12, marginLeft: 6 },
  time: { color: colors.tertiaryLabel, fontSize: 12, marginLeft: 'auto' },
  body: {
    color: colors.label,
    fontSize: 17,
    lineHeight: 23,
    marginLeft: 35,
    marginTop: 2,
  },
  deleted: {
    color: colors.secondaryLabel,
    fontSize: 16,
    fontStyle: 'italic',
    marginLeft: 35,
    marginTop: 3,
  },
  delivery: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginLeft: 35,
    marginTop: 5,
  },
  failureText: { color: colors.destructive, fontSize: 12 },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginLeft: 35,
    marginTop: 7,
  },
  reaction: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionText: { color: colors.label, fontSize: 13 },
  threadLink: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginLeft: 35,
    marginTop: 7,
  },
  threadText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  attachments: { marginLeft: 35 },
  pendingAttachment: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 7,
    marginTop: 6,
    maxWidth: '100%',
    minHeight: 38,
    paddingHorizontal: 10,
    width: 260,
  },
  pendingAttachmentName: { color: colors.label, flex: 1, fontSize: 13 },
  rightActions: { backgroundColor: '#1c252a', flexDirection: 'row' },
  swipeAction: {
    alignItems: 'center',
    backgroundColor: '#2c3439',
    gap: 3,
    justifyContent: 'center',
    width: 62,
  },
  replyAction: { backgroundColor: '#087ea4', width: 76 },
  accentAction: { backgroundColor: '#0b536a' },
  selectedAction: { backgroundColor: '#087ea4' },
  swipePressed: { opacity: 0.72 },
  swipeLabel: { color: 'white', fontSize: 10, fontWeight: '700' },
});
