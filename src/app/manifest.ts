import type { MetadataRoute } from 'next';
import { getServerBranding } from '@/lib/branding.server';

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getServerBranding();
  const brandedIcon = branding.logoStorageId
    ? `/api/files/${branding.logoStorageId}`
    : null;

  return {
    name: branding.name,
    short_name: branding.name,
    description: branding.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f7fb',
    theme_color: branding.themeColor,
    icons: brandedIcon
      ? [
          {
            src: brandedIcon,
            purpose: 'any',
          },
          {
            src: brandedIcon,
            purpose: 'maskable',
          },
        ]
      : [
          {
            src: '/icons/vector-app-icon.svg',
            type: 'image/svg+xml',
            sizes: 'any',
            purpose: 'any',
          },
          {
            src: '/icons/vector-app-maskable.svg',
            type: 'image/svg+xml',
            sizes: 'any',
            purpose: 'maskable',
          },
          {
            src: '/icons/vector-logo-192.png',
            type: 'image/png',
            sizes: '192x192',
            purpose: 'any',
          },
          {
            src: '/icons/vector-logo-512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'any',
          },
          {
            src: '/icons/vector-logo-384.png',
            type: 'image/png',
            sizes: '384x384',
            purpose: 'maskable',
          },
        ],
  };
}
