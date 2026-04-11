'use client';

import { use } from 'react';
import { PublicLayout } from '@/components/views/public-layout';
import { PublicViewPage } from '@/components/views/public-view-page';

export default function PublicViewRoute({
  params,
}: {
  params: Promise<{ orgSlug: string; viewId: string }>;
}) {
  const { orgSlug, viewId } = use(params);

  return (
    <PublicLayout orgSlug={orgSlug}>
      <PublicViewPage orgSlug={orgSlug} viewId={viewId} />
    </PublicLayout>
  );
}
