import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Avatar } from './Avatar';
import { colors } from '@/theme';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import type { RootStackParamList } from '@/navigation/types';

export function ScreenHeader({
  title,
  subtitle,
  onLeadingPress,
  onTrailingPress,
  trailingSymbol = 'plus',
}: {
  title: string;
  subtitle?: string;
  onLeadingPress?: () => void;
  onTrailingPress?: () => void;
  trailingSymbol?: string;
}) {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { currentUser } = useWorkspace();

  function chooseWorkspace() {
    if (onLeadingPress) onLeadingPress();
    else navigation.navigate('WorkspaceSwitcher');
  }
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
        onPress={chooseWorkspace}
        style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
      >
        <Avatar
          image={currentUser.image}
          name={currentUser.name ?? currentUser.email}
          size={36}
        />
        <View style={styles.statusRing}>
          <View style={styles.statusDot} />
        </View>
      </Pressable>
      <View style={styles.titleCopy}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel='Compose'
        hitSlop={10}
        onPress={onTrailingPress}
        style={({ pressed }) => [styles.trailing, pressed && styles.pressed]}
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
    paddingHorizontal: 16,
  },
  identity: { height: 40, justifyContent: 'center', width: 42 },
  statusRing: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 7,
    bottom: 0,
    height: 14,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    width: 14,
  },
  statusDot: {
    backgroundColor: colors.success,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  titleCopy: { flex: 1, marginLeft: 8, minWidth: 0 },
  title: {
    color: colors.label,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  subtitle: { color: colors.secondaryLabel, fontSize: 11, marginTop: 1 },
  trailing: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  pressed: { opacity: 0.58, transform: [{ scale: 0.96 }] },
});
