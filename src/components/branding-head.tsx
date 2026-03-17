'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useBranding } from '@/hooks/use-branding';

/**
 * Updates the document title and theme-color meta tag to reflect
 * the platform brand and current shadcn theme.
 * Rendered once in the root layout — no visible output.
 */
export function BrandingHead() {
  const branding = useBranding();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (branding.name && branding.name !== 'Vector') {
      document.title = branding.name;
    }
  }, [branding.name]);

  useEffect(() => {
    const color = getComputedStyle(document.body).backgroundColor;
    if (!color) return;
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [resolvedTheme]);

  // Switch favicon based on resolved theme (class-based, not prefers-color-scheme)
  useEffect(() => {
    const isDark = resolvedTheme === 'dark';
    const svgHref = isDark
      ? '/icons/vector-mark-gradient.svg'
      : '/icons/vector-mark-dark.svg';

    let link = document.querySelector<HTMLLinkElement>(
      'link[rel="icon"][type="image/svg+xml"]',
    );
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }
    link.href = svgHref;
  }, [resolvedTheme]);

  return null;
}
