import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { api } from '@vector/convex/_generated/api';
import type { Id } from '@vector/convex/_generated/dataModel';
import { colors } from '@/theme';
import type { OutboxAttachment } from '@/state/outbox';
import { MediaViewer } from './MediaViewer';

export type MessageAttachmentData = {
  _id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  name: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
};

export function MessageAttachment({
  attachment,
  onSendAnnotation,
}: {
  attachment: MessageAttachmentData;
  onSendAnnotation?: (attachment: OutboxAttachment) => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const resolved = useQuery(api.collaboration.messages.getAttachmentUrl, {
    attachmentId: attachment._id as Id<'messageAttachments'>,
  });

  if (resolved === undefined) return <View style={styles.placeholder} />;
  if (!resolved) return null;

  if (attachment.kind === 'image') {
    const ratio =
      attachment.width && attachment.height
        ? Math.max(0.7, Math.min(1.8, attachment.width / attachment.height))
        : 1.2;
    return (
      <Pressable
        accessibilityHint='Opens image viewer'
        onPress={() => setViewerOpen(true)}
        style={styles.mediaBlock}
      >
        <Image
          accessibilityLabel={attachment.name}
          alt={attachment.name}
          contentFit='cover'
          source={resolved.url}
          style={[styles.image, { aspectRatio: ratio }]}
          transition={160}
        />
        <Text numberOfLines={1} style={styles.caption}>
          {attachment.name}
        </Text>
        <MediaViewer
          attachment={attachment}
          onClose={() => setViewerOpen(false)}
          onSendAnnotation={onSendAnnotation}
          url={resolved.url}
          visible={viewerOpen}
        />
      </Pressable>
    );
  }

  if (attachment.kind === 'video') {
    return <VideoAttachment attachment={attachment} url={resolved.url} />;
  }

  if (attachment.kind === 'audio') {
    return <AudioAttachment attachment={attachment} url={resolved.url} />;
  }

  return (
    <Pressable
      accessibilityHint='Opens document viewer'
      accessibilityLabel={`${attachment.name}, ${formatBytes(attachment.size)}`}
      onPress={() => setViewerOpen(true)}
      style={styles.fileCard}
    >
      <View style={styles.fileIcon}>
        <SymbolView name='doc' size={22} tintColor={colors.label} />
      </View>
      <View style={styles.fileCopy}>
        <Text numberOfLines={1} style={styles.fileName}>
          {attachment.name}
        </Text>
        <Text style={styles.fileMeta}>{formatBytes(attachment.size)}</Text>
      </View>
      <SymbolView
        name='chevron.right'
        size={12}
        tintColor={colors.tertiaryLabel}
      />
      <MediaViewer
        attachment={attachment}
        onClose={() => setViewerOpen(false)}
        url={resolved.url}
        visible={viewerOpen}
      />
    </Pressable>
  );
}

function VideoAttachment({
  attachment,
  url,
}: {
  attachment: MessageAttachmentData;
  url: string;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const player = useVideoPlayer(url);
  const ratio =
    attachment.width && attachment.height
      ? Math.max(0.65, Math.min(1.85, attachment.width / attachment.height))
      : 16 / 9;
  return (
    <View style={styles.mediaBlock}>
      <VideoView
        accessibilityLabel={`Video, ${attachment.name}`}
        fullscreenOptions={{ enable: true }}
        nativeControls
        player={player}
        style={[styles.video, { aspectRatio: ratio }]}
      />
      <Pressable
        accessibilityLabel='Open video viewer'
        onPress={() => setViewerOpen(true)}
        style={styles.expandButton}
      >
        <SymbolView
          name='arrow.up.left.and.arrow.down.right'
          size={14}
          tintColor='white'
        />
      </Pressable>
      <Text numberOfLines={1} style={styles.caption}>
        {attachment.name}
      </Text>
      <MediaViewer
        attachment={attachment}
        onClose={() => setViewerOpen(false)}
        url={url}
        visible={viewerOpen}
      />
    </View>
  );
}

function AudioAttachment({
  attachment,
  url,
}: {
  attachment: MessageAttachmentData;
  url: string;
}) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  return (
    <View style={styles.audioCard}>
      <Pressable
        accessibilityLabel={
          status.playing ? 'Pause voice message' : 'Play voice message'
        }
        onPress={() => (status.playing ? player.pause() : player.play())}
        style={styles.audioPlay}
      >
        <SymbolView
          name={(status.playing ? 'pause.fill' : 'play.fill') as never}
          size={17}
          tintColor={colors.label}
        />
      </Pressable>
      <View style={styles.audioBody}>
        <View style={styles.audioWaveform}>
          {Array.from({ length: 30 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.audioBar,
                { height: 5 + ((index * 11) % 14) },
                status.duration > 0 &&
                  index / 30 <= status.currentTime / status.duration &&
                  styles.audioBarPlayed,
              ]}
            />
          ))}
        </View>
        <Text style={styles.audioMeta}>
          {formatSeconds(status.currentTime)} ·{' '}
          {formatSeconds(status.duration || attachment.duration || 0)}
        </Text>
      </View>
    </View>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSeconds(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 13,
    height: 118,
    marginTop: 7,
    width: 210,
  },
  mediaBlock: { marginTop: 7, maxWidth: '100%', width: 250 },
  image: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  video: {
    backgroundColor: '#111111',
    borderColor: colors.separator,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '100%',
  },
  expandButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    top: 7,
    width: 30,
  },
  caption: { color: colors.secondaryLabel, fontSize: 12, marginTop: 4 },
  fileCard: {
    alignItems: 'center',
    borderColor: colors.separator,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: 7,
    maxWidth: '100%',
    minHeight: 62,
    padding: 9,
    width: 280,
  },
  fileIcon: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 10,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  fileCopy: { flex: 1, marginLeft: 10, minWidth: 0 },
  fileName: { color: colors.label, fontSize: 14, fontWeight: '600' },
  fileMeta: { color: colors.secondaryLabel, fontSize: 12, marginTop: 2 },
  audioCard: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 14,
    flexDirection: 'row',
    marginTop: 7,
    maxWidth: '100%',
    minHeight: 62,
    padding: 9,
    width: 280,
  },
  audioPlay: {
    alignItems: 'center',
    backgroundColor: colors.tertiaryBackground,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  audioBody: { flex: 1, marginLeft: 10 },
  audioWaveform: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    height: 22,
  },
  audioBar: {
    backgroundColor: colors.tertiaryLabel,
    borderRadius: 1,
    width: 2,
  },
  audioBarPlayed: { backgroundColor: colors.accent },
  audioMeta: { color: colors.secondaryLabel, fontSize: 11, marginTop: 2 },
});
