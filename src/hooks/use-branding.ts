'use client';

import { useQuery } from 'convex/react';
import { api } from '@/lib/convex';
import { DEFAULT_BRANDING, type Branding } from '@/lib/branding';

/**
 * Returns the platform branding. Falls back to defaults while loading
 * so consumers never see undefined.
 */
export function useBranding(): Branding {
  const result = useQuery(api.platformAdmin.queries.getBranding, {});
  return result ?? DEFAULT_BRANDING;
}
