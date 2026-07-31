import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import {
  Platform,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainTabParamList } from './types';
import { colors } from '@/theme';

const symbols: Record<
  keyof MainTabParamList,
  { default: string; selected: string }
> = {
  Home: { default: 'house', selected: 'house.fill' },
  DMs: {
    default: 'bubble.left.and.bubble.right',
    selected: 'bubble.left.and.bubble.right.fill',
  },
  Activity: { default: 'bell', selected: 'bell.fill' },
  Search: { default: 'magnifyingglass', selected: 'magnifyingglass' },
  More: { default: 'ellipsis', selected: 'ellipsis' },
};

export function LiquidTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const supportsLiquidGlass =
    Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  const Surface = supportsLiquidGlass ? GlassView : View;

  return (
    <View
      pointerEvents='box-none'
      style={[styles.safeArea, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <Surface
        {...(supportsLiquidGlass
          ? { glassEffectStyle: 'regular' as const, isInteractive: true }
          : {})}
        style={[styles.surface, !supportsLiquidGlass && styles.fallbackSurface]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key].options;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const icon = symbols[route.name as keyof MainTabParamList];

          return (
            <Pressable
              accessibilityLabel={options.tabBarAccessibilityLabel}
              accessibilityRole='tab'
              accessibilityState={focused ? { selected: true } : {}}
              key={route.key}
              onLongPress={() =>
                navigation.emit({ target: route.key, type: 'tabLongPress' })
              }
              onPress={() => {
                const event = navigation.emit({
                  canPreventDefault: true,
                  target: route.key,
                  type: 'tabPress',
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={({ pressed }) => [
                styles.item,
                focused && styles.itemSelected,
                pressed && styles.itemPressed,
              ]}
              testID={options.tabBarButtonTestID}
            >
              <SymbolView
                name={icon[focused ? 'selected' : 'default'] as never}
                size={21}
                tintColor={focused ? colors.accent : colors.secondaryLabel}
              />
              <Text
                numberOfLines={1}
                style={[styles.label, focused && styles.labelSelected]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: 'transparent',
    paddingHorizontal: 11,
    paddingTop: 6,
  },
  surface: {
    alignItems: 'center',
    borderColor: PlatformColor('separator'),
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 58,
    overflow: 'hidden',
    padding: 4,
  },
  fallbackSurface: {
    backgroundColor: PlatformColor('secondarySystemBackground'),
  },
  item: {
    alignItems: 'center',
    borderRadius: 24,
    flex: 1,
    gap: 2,
    height: 48,
    justifyContent: 'center',
    minWidth: 0,
  },
  itemSelected: { backgroundColor: colors.accentSoft },
  itemPressed: { backgroundColor: colors.fill },
  label: {
    color: colors.secondaryLabel,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  labelSelected: { color: colors.accent, fontWeight: '700' },
});
