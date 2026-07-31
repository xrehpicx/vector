import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { authClient } from '@/lib/auth-client';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors } from '@/theme';

const rows = [
  ['person.crop.circle', 'Profile'],
  ['bell', 'Notifications'],
  ['briefcase', 'Work'],
  ['checklist', 'Issues'],
  ['doc.text', 'Documents'],
  ['gearshape', 'Settings'],
] as const;

export function MoreScreen() {
  return (
    <View style={styles.page}>
      <ScreenHeader title='More' trailingSymbol='gearshape' />
      <View style={styles.list}>
        {rows.map(([symbol, label]) => (
          <Pressable
            key={label}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <SymbolView
              name={symbol as never}
              size={20}
              tintColor={colors.secondaryLabel}
            />
            <Text style={styles.label}>{label}</Text>
            <SymbolView
              name='chevron.right'
              size={13}
              tintColor={colors.tertiaryLabel}
            />
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={() => void authClient.signOut()}
        style={styles.signOut}
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.groupedBackground, flex: 1 },
  list: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  pressed: { backgroundColor: colors.fill },
  label: { color: colors.label, flex: 1, fontSize: 16 },
  signOut: {
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 14,
  },
  signOutLabel: { color: colors.destructive, fontSize: 16, fontWeight: '600' },
});
