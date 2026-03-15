import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { DEFAULT_BRANDING, resolveBrandColor } from '@/lib/branding';

export async function getServerBranding() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return DEFAULT_BRANDING;
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const branding = await client.query(
      api.platformAdmin.queries.getBranding,
      {},
    );

    return {
      ...DEFAULT_BRANDING,
      ...branding,
      themeColor: resolveBrandColor(
        branding.themeColor,
        DEFAULT_BRANDING.themeColor,
      ),
      accentColor: resolveBrandColor(
        branding.accentColor,
        DEFAULT_BRANDING.accentColor,
      ),
    };
  } catch (error) {
    console.error('Failed to load branding for server render', error);
    return DEFAULT_BRANDING;
  }
}
