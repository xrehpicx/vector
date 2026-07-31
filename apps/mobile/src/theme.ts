import { DynamicColorIOS, PlatformColor } from 'react-native';

export const colors = {
  background: PlatformColor('systemBackground'),
  groupedBackground: PlatformColor('systemGroupedBackground'),
  secondaryBackground: PlatformColor('secondarySystemBackground'),
  tertiaryBackground: PlatformColor('tertiarySystemBackground'),
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  separator: PlatformColor('separator'),
  accent: DynamicColorIOS({ dark: '#27b4d6', light: '#0789aa' }),
  accentSoft: DynamicColorIOS({ dark: '#102f38', light: '#e2f4f8' }),
  destructive: PlatformColor('systemRed'),
  success: PlatformColor('systemGreen'),
  fill: PlatformColor('tertiarySystemFill'),
};

export const metrics = {
  pageInset: 16,
  rowHeight: 62,
  compactRadius: 12,
  controlHeight: 44,
  hairline: 0.5,
};
