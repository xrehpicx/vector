import { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  type NativeSyntheticEvent,
  type NativeTouchEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { colors } from '@/theme';
import type { OutboxAttachment } from '@/state/outbox';

type MentionOption = {
  id: string;
  label: string;
  kind: 'user' | 'agent';
};

export function MessageComposer({
  channelName,
  mentionOptions,
  onSend,
  onCancelReply,
  replyToLabel,
  attachments = [],
  onAddAttachment,
  onRemoveAttachment,
  onAddCapturedAttachment,
}: {
  channelName: string;
  mentionOptions: MentionOption[];
  onSend: (
    body: string,
    mentions: MentionOption[],
    attachments: OutboxAttachment[],
  ) => void;
  onCancelReply?: () => void;
  replyToLabel?: string;
  attachments?: OutboxAttachment[];
  onAddAttachment?: () => void;
  onRemoveAttachment?: (localUri: string) => void;
  onAddCapturedAttachment?: (attachment: OutboxAttachment) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const [body, setBody] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<MentionOption[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [recordingMode, setRecordingMode] = useState<'hold' | 'locked' | null>(
    null,
  );
  const recordingModeRef = useRef<'hold' | 'locked' | null>(null);
  const longPressTriggered = useRef(false);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const holdingMic = useRef(false);
  const recordingStarted = useRef(false);
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 100);

  const mentionQuery = useMemo(() => {
    const match = body.match(/(?:^|\s)@([\w-]*)$/);
    return match?.[1]?.toLowerCase() ?? null;
  }, [body]);
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return mentionOptions
      .filter(option => option.label.toLowerCase().includes(mentionQuery))
      .slice(0, 5);
  }, [mentionOptions, mentionQuery]);

  function insertMention(option: MentionOption) {
    setBody(current => current.replace(/@([\w-]*)$/, `@${option.label} `));
    setSelectedMentions(current => [
      ...current.filter(item => item.id !== option.id),
      option,
    ]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function submit() {
    const cleanBody = body.trim();
    if (!cleanBody && attachments.length === 0) return;
    onSend(cleanBody, selectedMentions, attachments);
    setBody('');
    setSelectedMentions([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function startVoiceRecording(mode: 'hold' | 'locked') {
    recordingModeRef.current = mode;
    setRecordingMode(mode);
    holdingMic.current = mode === 'hold';
    setVoiceError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted || recordingModeRef.current === null) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      if (recordingModeRef.current === null) return;
      recorder.record();
      recordingStarted.current = true;
    } catch (caught) {
      setVoiceError(
        caught instanceof Error
          ? caught.message
          : 'Voice recording is unavailable.',
      );
      recordingStarted.current = false;
    }
  }

  async function finishVoiceRecording(attach = true) {
    holdingMic.current = false;
    recordingModeRef.current = null;
    setRecordingMode(null);
    if (!recordingStarted.current) return;
    recordingStarted.current = false;
    const durationMillis = recorderState.durationMillis;
    try {
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const uri = recorder.uri;
      if (!attach || !uri || durationMillis < 350) {
        if (uri) {
          const discarded = new File(uri);
          if (discarded.exists) discarded.delete();
        }
        return;
      }
      const name = `voice-message-${Date.now()}.m4a`;
      const source = new File(uri);
      const file = new File(Paths.document, name);
      source.copy(file);
      onAddCapturedAttachment?.({
        localUri: file.uri,
        name,
        contentType: 'audio/mp4',
        size: typeof file.size === 'number' ? file.size : 0,
        kind: 'audio',
        duration: durationMillis / 1000,
      });
    } catch (caught) {
      setVoiceError(
        caught instanceof Error
          ? caught.message
          : 'Vector could not finish this recording.',
      );
    }
  }

  function handleMicPress() {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (recordingModeRef.current === 'locked') {
      void finishVoiceRecording();
      return;
    }
    void startVoiceRecording('locked');
  }

  function handleMicLongPress() {
    longPressTriggered.current = true;
    void startVoiceRecording('hold');
  }

  function handleTouchStart(event: NativeSyntheticEvent<NativeTouchEvent>) {
    touchOrigin.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
  }

  function handleTouchMove(event: NativeSyntheticEvent<NativeTouchEvent>) {
    if (recordingModeRef.current !== 'hold' || !touchOrigin.current) return;
    const deltaX = event.nativeEvent.pageX - touchOrigin.current.x;
    const deltaY = event.nativeEvent.pageY - touchOrigin.current.y;
    if (deltaX < -82) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      void finishVoiceRecording(false);
      return;
    }
    if (deltaY < -68) {
      holdingMic.current = false;
      recordingModeRef.current = 'locked';
      setRecordingMode('locked');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }

  return (
    <View style={styles.wrapper}>
      {replyToLabel ? (
        <View style={styles.replyContext}>
          <View style={styles.replyAccent} />
          <View style={styles.replyCopy}>
            <Text style={styles.replyEyebrow}>Replying to</Text>
            <Text numberOfLines={1} style={styles.replyLabel}>
              {replyToLabel}
            </Text>
          </View>
          <Pressable
            accessibilityLabel='Cancel reply'
            hitSlop={8}
            onPress={onCancelReply}
            style={styles.iconButton}
          >
            <SymbolView
              name='xmark'
              size={14}
              tintColor={colors.secondaryLabel}
            />
          </Pressable>
        </View>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map(option => (
            <Pressable
              key={`${option.kind}-${option.id}`}
              onPress={() => insertMention(option)}
              style={styles.suggestion}
            >
              <SymbolView
                name={
                  (option.kind === 'agent'
                    ? 'cpu'
                    : 'person.crop.circle') as never
                }
                size={18}
                tintColor={
                  option.kind === 'agent'
                    ? colors.accent
                    : colors.secondaryLabel
                }
              />
              <Text style={styles.suggestionLabel}>{option.label}</Text>
              {option.kind === 'agent' ? (
                <Text style={styles.agentLabel}>AGENT</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {attachments.length > 0 ? (
        <View style={styles.attachmentTray}>
          {attachments.map(attachment =>
            attachment.kind === 'audio' ? (
              <AudioDraftChip
                attachment={attachment}
                key={attachment.localUri}
                onRemove={() => onRemoveAttachment?.(attachment.localUri)}
              />
            ) : (
              <View key={attachment.localUri} style={styles.attachmentChip}>
                <SymbolView
                  name={
                    (attachment.kind === 'image'
                      ? 'photo'
                      : attachment.kind === 'video'
                        ? 'video'
                        : 'doc') as never
                  }
                  size={15}
                  tintColor={colors.secondaryLabel}
                />
                <Text numberOfLines={1} style={styles.attachmentName}>
                  {attachment.name}
                </Text>
                <Pressable
                  accessibilityLabel={`Remove ${attachment.name}`}
                  hitSlop={6}
                  onPress={() => onRemoveAttachment?.(attachment.localUri)}
                >
                  <SymbolView
                    name='xmark.circle.fill'
                    size={17}
                    tintColor={colors.tertiaryLabel}
                  />
                </Pressable>
              </View>
            ),
          )}
        </View>
      ) : null}
      {recorderState.isRecording ? (
        <View accessibilityLiveRegion='polite' style={styles.recordingBar}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingTime}>
            {formatDuration(recorderState.durationMillis)}
          </Text>
          <View style={styles.waveform}>
            {Array.from({ length: 18 }, (_, index) => (
              <View
                key={index}
                style={[styles.waveBar, { height: 5 + ((index * 7) % 13) }]}
              />
            ))}
          </View>
          {recordingMode === 'locked' ? (
            <>
              <Pressable
                accessibilityLabel='Delete recording'
                onPress={() => void finishVoiceRecording(false)}
                style={styles.recordingButton}
              >
                <SymbolView
                  name='trash'
                  size={17}
                  tintColor={colors.destructive}
                />
              </Pressable>
              <Pressable
                accessibilityLabel='Finish recording'
                onPress={() => void finishVoiceRecording()}
                style={styles.stopButton}
              >
                <SymbolView name='stop.fill' size={13} tintColor='white' />
              </Pressable>
            </>
          ) : (
            <Text style={styles.recordingHint}>
              Slide left to cancel · up to lock
            </Text>
          )}
        </View>
      ) : null}
      {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}
      <View style={styles.composer}>
        <Pressable
          accessibilityLabel='Add to message'
          hitSlop={8}
          onPress={onAddAttachment}
          style={styles.iconButton}
        >
          <SymbolView name='plus' size={23} tintColor={colors.accent} />
        </Pressable>
        <TextInput
          accessibilityLabel={`Message ${channelName}`}
          autoFocus
          blurOnSubmit={false}
          multiline
          onChangeText={setBody}
          onFocus={() => undefined}
          placeholder={`Message #${channelName}`}
          placeholderTextColor={colors.tertiaryLabel}
          ref={inputRef}
          returnKeyType='default'
          style={styles.input}
          value={body}
        />
        <Pressable
          accessibilityLabel='Formatting'
          hitSlop={8}
          onPress={Keyboard.dismiss}
          style={styles.iconButton}
        >
          <Text style={styles.formatLabel}>Aa</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={
            body.trim() || attachments.length
              ? 'Send message'
              : 'Record voice message'
          }
          hitSlop={8}
          onLongPress={
            body.trim() || attachments.length ? undefined : handleMicLongPress
          }
          onPress={body.trim() || attachments.length ? submit : handleMicPress}
          onPressOut={
            body.trim() || attachments.length
              ? undefined
              : () => {
                  if (recordingModeRef.current === 'hold')
                    void finishVoiceRecording();
                }
          }
          onTouchMove={
            body.trim() || attachments.length ? undefined : handleTouchMove
          }
          onTouchStart={
            body.trim() || attachments.length ? undefined : handleTouchStart
          }
          delayLongPress={220}
          style={[
            styles.iconButton,
            body.trim() || attachments.length ? styles.sendButton : null,
          ]}
        >
          <SymbolView
            name={
              (body.trim() || attachments.length
                ? 'arrow.up'
                : 'mic.fill') as never
            }
            size={19}
            tintColor={
              body.trim() || attachments.length
                ? 'white'
                : colors.secondaryLabel
            }
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 6,
    paddingTop: 7,
  },
  composer: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 3,
  },
  input: {
    color: colors.label,
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    maxHeight: 108,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  iconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sendButton: { backgroundColor: '#0099c2', borderRadius: 18 },
  formatLabel: {
    color: colors.secondaryLabel,
    fontSize: 18,
    fontWeight: '500',
  },
  suggestions: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 14,
    marginBottom: 4,
    overflow: 'hidden',
  },
  suggestion: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  suggestionLabel: {
    color: colors.label,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  agentLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  replyContext: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 42,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  replyAccent: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: 1,
    width: 2,
  },
  replyCopy: { flex: 1, marginLeft: 10, minWidth: 0 },
  replyEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  replyLabel: { color: colors.secondaryLabel, fontSize: 13, marginTop: 1 },
  attachmentTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  attachmentChip: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
    minHeight: 34,
    paddingHorizontal: 9,
  },
  attachmentName: {
    color: colors.label,
    flexShrink: 1,
    fontSize: 13,
    maxWidth: 230,
  },
  recordingBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 8,
  },
  recordingDot: {
    backgroundColor: colors.destructive,
    borderRadius: 5,
    height: 8,
    width: 8,
  },
  recordingTime: {
    color: colors.label,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  waveform: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 2,
    height: 22,
  },
  waveBar: {
    backgroundColor: colors.accent,
    borderRadius: 1,
    opacity: 0.72,
    width: 2,
  },
  recordingHint: { color: colors.secondaryLabel, fontSize: 12 },
  recordingButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  stopButton: {
    alignItems: 'center',
    backgroundColor: colors.destructive,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  voiceError: {
    color: colors.destructive,
    fontSize: 12,
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  audioDraft: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 13,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 8,
    width: 250,
  },
  audioDraftPlay: {
    alignItems: 'center',
    backgroundColor: colors.tertiaryBackground,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  audioDraftWave: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 2,
    height: 22,
  },
  audioDraftTime: {
    color: colors.secondaryLabel,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function AudioDraftChip({
  attachment,
  onRemove,
}: {
  attachment: OutboxAttachment;
  onRemove: () => void;
}) {
  const player = useAudioPlayer(attachment.localUri);
  const status = useAudioPlayerStatus(player);
  return (
    <View style={styles.audioDraft}>
      <Pressable
        accessibilityLabel={
          status.playing ? 'Pause voice draft' : 'Play voice draft'
        }
        onPress={() => (status.playing ? player.pause() : player.play())}
        style={styles.audioDraftPlay}
      >
        <SymbolView
          name={(status.playing ? 'pause.fill' : 'play.fill') as never}
          size={14}
          tintColor={colors.label}
        />
      </Pressable>
      <View style={styles.audioDraftWave}>
        {Array.from({ length: 18 }, (_, index) => (
          <View
            key={index}
            style={[styles.waveBar, { height: 5 + ((index * 7) % 13) }]}
          />
        ))}
      </View>
      <Text style={styles.audioDraftTime}>
        {formatDuration((attachment.duration ?? 0) * 1000)}
      </Text>
      <Pressable
        accessibilityLabel='Delete voice draft'
        hitSlop={6}
        onPress={onRemove}
      >
        <SymbolView
          name='xmark.circle.fill'
          size={18}
          tintColor={colors.tertiaryLabel}
        />
      </Pressable>
    </View>
  );
}
