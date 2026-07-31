import { useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { File } from 'expo-file-system';

import type { OutboxAttachment } from '@/state/outbox';
import type { MessageAttachmentData } from './MessageAttachment';

type DrawPath = { color: string; data: string };
const palette = ['#ffffff', '#00a3cc', '#ff3b30', '#ffcc00', '#34c759'];

export function ImageAnnotatorModal({
  attachment,
  onCancel,
  onSend,
  url,
  visible,
}: {
  attachment: MessageAttachmentData;
  onCancel: () => void;
  onSend: (attachment: OutboxAttachment) => void;
  url: string;
  visible: boolean;
}) {
  const window = useWindowDimensions();
  const captureTarget = useRef<View>(null);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [activePath, setActivePath] = useState<DrawPath | null>(null);
  const [color, setColor] = useState('#00a3cc');
  const [sending, setSending] = useState(false);
  const ratio =
    attachment.width && attachment.height
      ? attachment.width / attachment.height
      : 1;
  const canvasWidth = window.width;
  const canvasHeight = Math.min(window.height - 190, canvasWidth / ratio);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 2,
        onPanResponderGrant: event => {
          const { locationX, locationY } = event.nativeEvent;
          setActivePath({ color, data: `M ${locationX} ${locationY}` });
        },
        onPanResponderMove: event => {
          const { locationX, locationY } = event.nativeEvent;
          setActivePath(current =>
            current
              ? {
                  ...current,
                  data: `${current.data} L ${locationX} ${locationY}`,
                }
              : current,
          );
        },
        onPanResponderRelease: () => {
          setActivePath(current => {
            if (current) setPaths(existing => [...existing, current]);
            return null;
          });
        },
        onPanResponderTerminate: () => setActivePath(null),
      }),
    [color],
  );

  async function finish() {
    if (!captureTarget.current || sending) return;
    setSending(true);
    try {
      const uri = await captureRef(captureTarget, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const file = new File(uri);
      onSend({
        localUri: uri,
        name: `annotated-${attachment.name.replace(/\.[^.]+$/, '')}.png`,
        contentType: 'image/png',
        size: typeof file.size === 'number' ? file.size : 0,
        kind: 'image',
        width: Math.round(canvasWidth),
        height: Math.round(canvasHeight),
      });
      setPaths([]);
      onCancel();
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      animationType='slide'
      onRequestClose={onCancel}
      presentationStyle='fullScreen'
      visible={visible}
    >
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel='Cancel annotation'
            onPress={onCancel}
            style={styles.headerButton}
          >
            <SymbolView name='xmark' size={18} tintColor='white' />
          </Pressable>
          <Text style={styles.title}>Markup</Text>
          <Pressable
            accessibilityLabel='Send annotated image'
            disabled={sending}
            onPress={() => void finish()}
            style={[styles.sendButton, sending && styles.disabled]}
          >
            <SymbolView name='arrow.up' size={17} tintColor='white' />
            <Text style={styles.sendLabel}>Send</Text>
          </Pressable>
        </View>

        <View style={styles.stage}>
          <View
            collapsable={false}
            ref={captureTarget}
            style={{ height: canvasHeight, width: canvasWidth }}
          >
            <Image
              alt={attachment.name}
              contentFit='contain'
              source={url}
              style={StyleSheet.absoluteFill}
            />
            <View {...responder.panHandlers} style={StyleSheet.absoluteFill}>
              <Svg height='100%' width='100%'>
                {[...paths, ...(activePath ? [activePath] : [])].map(
                  (path, index) => (
                    <Path
                      d={path.data}
                      fill='none'
                      key={`${index}-${path.data.length}`}
                      stroke={path.color}
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={5}
                    />
                  ),
                )}
              </Svg>
            </View>
          </View>
        </View>

        <View style={styles.toolbar}>
          <Pressable
            accessibilityLabel='Undo stroke'
            disabled={!paths.length}
            onPress={() => setPaths(current => current.slice(0, -1))}
            style={styles.toolButton}
          >
            <SymbolView
              name='arrow.uturn.backward'
              size={20}
              tintColor={paths.length ? 'white' : '#636366'}
            />
          </Pressable>
          <View style={styles.palette}>
            {palette.map(value => (
              <Pressable
                accessibilityLabel={`Draw in ${value}`}
                key={value}
                onPress={() => setColor(value)}
                style={[
                  styles.swatchRing,
                  color === value && styles.swatchSelected,
                ]}
              >
                <View style={[styles.swatch, { backgroundColor: value }]} />
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityLabel='Clear drawing'
            disabled={!paths.length}
            onPress={() => setPaths([])}
            style={styles.toolButton}
          >
            <SymbolView
              name='trash'
              size={19}
              tintColor={paths.length ? '#ff453a' : '#636366'}
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
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
  headerButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  title: {
    color: 'white',
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#087ea4',
    borderRadius: 17,
    flexDirection: 'row',
    gap: 5,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  sendLabel: { color: 'white', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  stage: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  toolbar: {
    alignItems: 'center',
    borderTopColor: '#2c2c2e',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 72,
    paddingHorizontal: 12,
  },
  toolButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  palette: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 11,
    justifyContent: 'center',
  },
  swatchRing: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 16,
    borderWidth: 2,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  swatchSelected: { borderColor: '#8e8e93' },
  swatch: {
    borderColor: '#636366',
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    height: 22,
    width: 22,
  },
});
