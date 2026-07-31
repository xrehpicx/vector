import { useCallback, useState } from 'react';
import { ActionSheetIOS } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';

import type { OutboxAttachment } from '@/state/outbox';

function attachmentKind(contentType: string): OutboxAttachment['kind'] {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'file';
}

function fileSize(uri: string, provided?: number | null) {
  if (provided && provided > 0) return provided;
  const size = new File(uri).size;
  return typeof size === 'number' ? size : 0;
}

export function useAttachmentPicker() {
  const [attachments, setAttachments] = useState<OutboxAttachment[]>([]);

  const add = useCallback((next: OutboxAttachment[]) => {
    setAttachments(current => {
      const byUri = new Map(current.map(item => [item.localUri, item]));
      next.forEach(item => byUri.set(item.localUri, item));
      return [...byUri.values()].slice(0, 10);
    });
  }, []);

  const pickMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images', 'videos'],
      quality: 1,
      selectionLimit: 10,
    });
    if (result.canceled) return;
    add(
      result.assets.map(asset => {
        const contentType =
          asset.mimeType ??
          (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        return {
          localUri: asset.uri,
          name:
            asset.fileName ??
            `attachment-${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
          contentType,
          size: fileSize(asset.uri, asset.fileSize),
          kind: attachmentKind(contentType),
          width: asset.width || undefined,
          height: asset.height || undefined,
          duration: asset.duration ? asset.duration / 1000 : undefined,
        };
      }),
    );
  }, [add]);

  const pickFiles = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;
    add(
      result.assets.map(asset => {
        const contentType = asset.mimeType ?? 'application/octet-stream';
        return {
          localUri: asset.uri,
          name: asset.name,
          contentType,
          size: fileSize(asset.uri, asset.size),
          kind: attachmentKind(contentType),
        };
      }),
    );
  }, [add]);

  const pasteSticker = useCallback(async () => {
    const clipboardImage = await Clipboard.getImageAsync({ format: 'png' });
    if (!clipboardImage) return;
    const name = `sticker-${Date.now()}.png`;
    const file = new File(Paths.cache, name);
    file.write(clipboardImage.data.replace(/^data:image\/png;base64,/, ''), {
      encoding: 'base64',
    });
    add([
      {
        localUri: file.uri,
        name,
        contentType: 'image/png',
        size: typeof file.size === 'number' ? file.size : 0,
        kind: 'image',
        width: clipboardImage.size.width,
        height: clipboardImage.size.height,
      },
    ]);
  }, [add]);

  const choose = useCallback(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Photo or video', 'File', 'Paste sticker or image'],
        cancelButtonIndex: 0,
        title: 'Add to message',
      },
      index => {
        if (index === 1) void pickMedia();
        if (index === 2) void pickFiles();
        if (index === 3) void pasteSticker();
      },
    );
  }, [pasteSticker, pickFiles, pickMedia]);

  const remove = useCallback((localUri: string) => {
    setAttachments(current =>
      current.filter(item => item.localUri !== localUri),
    );
  }, []);

  const clear = useCallback(() => setAttachments([]), []);

  const addCaptured = useCallback(
    (attachment: OutboxAttachment) => add([attachment]),
    [add],
  );

  return { attachments, choose, remove, clear, addCaptured };
}
