import { useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';

import type { MessageAttachmentData } from './MessageAttachment';
import type { OutboxAttachment } from '@/state/outbox';
import { ImageAnnotatorModal } from './ImageAnnotatorModal';

export function MediaViewer({
  attachment,
  onClose,
  onSendAnnotation,
  url,
  visible,
}: {
  attachment: MessageAttachmentData;
  onClose: () => void;
  onSendAnnotation?: (attachment: OutboxAttachment) => void;
  url: string;
  visible: boolean;
}) {
  const [annotating, setAnnotating] = useState(false);
  return (
    <>
      <Modal
        animationType='fade'
        onRequestClose={onClose}
        presentationStyle='fullScreen'
        statusBarTranslucent
        visible={visible}
      >
        <SafeAreaView style={styles.page}>
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text numberOfLines={1} style={styles.title}>
                {attachment.name}
              </Text>
              <Text style={styles.meta}>{formatBytes(attachment.size)}</Text>
            </View>
            {attachment.kind === 'image' && onSendAnnotation ? (
              <Pressable
                accessibilityLabel='Annotate image'
                hitSlop={8}
                onPress={() => setAnnotating(true)}
                style={styles.headerButton}
              >
                <SymbolView name='pencil.tip' size={19} tintColor='white' />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel='Open in another app'
              hitSlop={8}
              onPress={() => void Linking.openURL(url)}
              style={styles.headerButton}
            >
              <SymbolView
                name='arrow.up.forward.app'
                size={19}
                tintColor='white'
              />
            </Pressable>
            <Pressable
              accessibilityLabel='Close viewer'
              hitSlop={8}
              onPress={onClose}
              style={styles.headerButton}
            >
              <SymbolView name='xmark' size={18} tintColor='white' />
            </Pressable>
          </View>
          <ViewerBody attachment={attachment} url={url} />
        </SafeAreaView>
      </Modal>
      {attachment.kind === 'image' && onSendAnnotation ? (
        <ImageAnnotatorModal
          attachment={attachment}
          onCancel={() => setAnnotating(false)}
          onSend={onSendAnnotation}
          url={url}
          visible={annotating}
        />
      ) : null}
    </>
  );
}

function ViewerBody({
  attachment,
  url,
}: {
  attachment: MessageAttachmentData;
  url: string;
}) {
  if (attachment.kind === 'image')
    return <ZoomableImage attachment={attachment} url={url} />;
  if (attachment.kind === 'video') return <FullscreenVideo url={url} />;
  if (
    attachment.contentType === 'application/pdf' ||
    attachment.contentType.startsWith('text/')
  ) {
    return <DocumentPreview url={url} />;
  }
  return (
    <View style={styles.unsupported}>
      <View style={styles.documentIcon}>
        <SymbolView name='doc' size={34} tintColor='white' />
      </View>
      <Text numberOfLines={2} style={styles.unsupportedTitle}>
        {attachment.name}
      </Text>
      <Text style={styles.unsupportedMeta}>
        {attachment.contentType} · {formatBytes(attachment.size)}
      </Text>
      <Pressable
        onPress={() => void Linking.openURL(url)}
        style={styles.openButton}
      >
        <Text style={styles.openButtonLabel}>Open in another app</Text>
      </Pressable>
    </View>
  );
}

function ZoomableImage({
  attachment,
  url,
}: {
  attachment: MessageAttachmentData;
  url: string;
}) {
  const window = useWindowDimensions();
  const ratio =
    attachment.width && attachment.height
      ? attachment.width / attachment.height
      : 1;
  const width = window.width;
  const height = Math.min(window.height - 110, width / ratio);
  return (
    <ScrollView
      bouncesZoom
      centerContent
      contentContainerStyle={styles.zoomContent}
      maximumZoomScale={5}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      style={styles.viewerBody}
    >
      <Image
        accessibilityLabel={attachment.name}
        alt={attachment.name}
        contentFit='contain'
        source={url}
        style={{ height, width }}
        transition={180}
      />
    </ScrollView>
  );
}

function FullscreenVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, instance => {
    instance.play();
  });
  return (
    <View style={styles.videoBody}>
      <VideoView
        fullscreenOptions={{ enable: true }}
        nativeControls
        player={player}
        style={styles.fullVideo}
      />
    </View>
  );
}

function DocumentPreview({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={styles.documentBody}>
      {!loaded ? <View style={styles.documentSkeleton} /> : null}
      <WebView
        allowsLinkPreview
        onLoadEnd={() => setLoaded(true)}
        originWhitelist={['https://*']}
        source={{ uri: url }}
        style={[styles.webView, !loaded && styles.hidden]}
      />
    </View>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#050505', flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomColor: '#2c2c2e',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 10,
  },
  titleBlock: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  title: { color: 'white', fontSize: 14, fontWeight: '600' },
  meta: { color: '#8e8e93', fontSize: 11, marginTop: 1 },
  headerButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginLeft: 4,
    width: 36,
  },
  viewerBody: { flex: 1 },
  zoomContent: { alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  videoBody: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  fullVideo: { aspectRatio: 16 / 9, backgroundColor: 'black', width: '100%' },
  documentBody: { backgroundColor: '#161618', flex: 1 },
  documentSkeleton: {
    backgroundColor: '#242426',
    borderRadius: 8,
    bottom: 20,
    left: 14,
    position: 'absolute',
    right: 14,
    top: 14,
  },
  webView: { backgroundColor: '#161618', flex: 1 },
  hidden: { opacity: 0 },
  unsupported: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 34,
  },
  documentIcon: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  unsupportedTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 18,
    textAlign: 'center',
  },
  unsupportedMeta: {
    color: '#8e8e93',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  openButton: {
    backgroundColor: '#087ea4',
    borderRadius: 12,
    marginTop: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  openButtonLabel: { color: 'white', fontSize: 15, fontWeight: '700' },
});
