import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { colors } from '@/theme';

export function ScreenHeader({
  title,
  onLeadingPress,
  onTrailingPress,
  trailingSymbol = 'square.and.pencil',
}: {
  title: string;
  onLeadingPress?: () => void;
  onTrailingPress?: () => void;
  trailingSymbol?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { height: insets.top + 48, paddingTop: insets.top },
      ]}
    >
      <Pressable
        accessibilityLabel='Workspace'
        hitSlop={10}
        onPress={onLeadingPress}
      >
        <Avatar name='D' size={38} />
      </Pressable>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <Pressable
        accessibilityLabel='Compose'
        hitSlop={10}
        onPress={onTrailingPress}
        style={styles.trailing}
      >
        <SymbolView
          name={trailingSymbol as never}
          size={23}
          tintColor={colors.accent}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: {
    color: colors.label,
    fontSize: 17,
    fontWeight: '700',
    maxWidth: '60%',
  },
  trailing: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
});
