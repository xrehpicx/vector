import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';

import type { RootStackParamList } from '@/navigation/types';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { colors } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkspaceSwitcher'>;

export function WorkspaceSwitcherScreen({ navigation }: Props) {
  const { organizations, orgSlug, setOrgSlug } = useWorkspace();

  return (
    <View style={styles.page}>
      <Text style={styles.helper}>
        Choose where you want to read and send messages.
      </Text>
      <View>
        {organizations.map(organization => {
          const selected = organization.slug === orgSlug;
          return (
            <Pressable
              accessibilityRole='button'
              accessibilityState={{ selected }}
              key={organization.slug}
              onPress={() => {
                setOrgSlug(organization.slug);
                navigation.goBack();
              }}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.mark}>
                <Text style={styles.markLabel}>
                  {organization.name.trim().at(0)?.toUpperCase() ?? 'V'}
                </Text>
              </View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.name}>
                  {organization.name}
                </Text>
                <Text numberOfLines={1} style={styles.slug}>
                  {organization.slug}
                </Text>
              </View>
              {selected ? (
                <SymbolView
                  name='checkmark.circle.fill'
                  size={22}
                  tintColor={colors.accent}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background },
  helper: {
    color: colors.secondaryLabel,
    fontSize: 13,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 18,
  },
  rowPressed: { backgroundColor: colors.fill },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  markLabel: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  copy: { flex: 1, marginLeft: 12, minWidth: 0 },
  name: { color: colors.label, fontSize: 16, fontWeight: '600' },
  slug: { color: colors.secondaryLabel, fontSize: 12, marginTop: 2 },
});
