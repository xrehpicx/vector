import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

export function Avatar({
  image,
  name,
  size = 32,
  agent = false,
}: {
  image?: string | null;
  name?: string | null;
  size?: number;
  agent?: boolean;
}) {
  if (image) {
    return (
      <Image
        alt={name ?? 'Profile image'}
        source={{ uri: image }}
        style={{ borderRadius: size / 2, height: size, width: size }}
      />
    );
  }
  return (
    <View
      style={[
        styles.fallback,
        {
          backgroundColor: agent
            ? 'rgba(0,153,194,0.15)'
            : colors.secondaryBackground,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      <Text
        style={[
          styles.initial,
          {
            color: agent ? '#0099c2' : colors.secondaryLabel,
            fontSize: size * 0.38,
          },
        ]}
      >
        {agent ? '⌾' : (name?.trim().at(0)?.toUpperCase() ?? '?')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700' },
});
