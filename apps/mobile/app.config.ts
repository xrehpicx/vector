import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Vector',
  slug: 'vector',
  scheme: 'vector',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: '../ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png',
  ios: {
    appleTeamId: 'R9QFK9NM3Y',
    bundleIdentifier: 'studio.imai.vector',
    buildNumber: '202607312351',
    supportsTablet: true,
    entitlements: {
      'aps-environment': '$(APS_ENVIRONMENT)',
    },
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Vector uses the microphone when you record a voice message.',
      NSPhotoLibraryUsageDescription:
        'Vector lets you share and annotate photos with your workspace.',
      NSPhotoLibraryAddUsageDescription:
        'Vector can save annotated images back to your photo library.',
      UIBackgroundModes: ['remote-notification'],
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyTracking: false,
    },
  },
  plugins: [
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '18.0',
        },
      },
    ],
    'expo-dev-client',
    'expo-audio',
    'expo-secure-store',
    'expo-notifications',
    [
      'expo-image-picker',
      {
        photosPermission:
          'Vector lets you share and annotate photos with your workspace.',
      },
    ],
  ],
  extra: {
    convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL ?? 'https://cloud.imai.tech',
    convexSiteUrl:
      process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
      'https://proficient-poodle-798.convex.site',
    appUrl: process.env.EXPO_PUBLIC_APP_URL ?? 'https://vector.imai.studio',
    orgSlug: process.env.EXPO_PUBLIC_ORG_SLUG,
  },
};

export default config;
