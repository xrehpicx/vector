import Constants from 'expo-constants';

type VectorExtra = {
  appUrl?: string;
  convexSiteUrl?: string;
  convexUrl?: string;
  orgSlug?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as VectorExtra;

export const runtime = {
  appUrl: extra.appUrl ?? 'https://vector.imai.studio',
  convexSiteUrl:
    extra.convexSiteUrl ?? 'https://proficient-poodle-798.convex.site',
  convexUrl: extra.convexUrl ?? 'https://cloud.imai.tech',
  orgSlug: extra.orgSlug,
};
