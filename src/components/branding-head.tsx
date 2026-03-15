'use client';

import { useEffect } from 'react';
import { useBranding } from '@/hooks/use-branding';

/**
 * Updates the document title to reflect the platform brand name.
 * Rendered once in the root layout — no visible output.
 */
export function BrandingHead() {
  const branding = useBranding();

  useEffect(() => {
    if (branding.name && branding.name !== 'Vector') {
      document.title = branding.name;
    }
  }, [branding.name]);

  return null;
}
