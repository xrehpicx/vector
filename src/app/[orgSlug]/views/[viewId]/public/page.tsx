'use client';

import { use } from 'react';
import { PublicViewPage } from '@/components/views/public-view-page';

// The parent `layout.tsx` already wraps this route in `PublicLayout`, so
// rendering it here too would stack two top action bars.
export default function PublicViewRoute({
  params,
}: {
  params: Promise<{ orgSlug: string; viewId: string }>;
}) {
  const { orgSlug, viewId } = use(params);

  return <PublicViewPage orgSlug={orgSlug} viewId={viewId} />;
}
