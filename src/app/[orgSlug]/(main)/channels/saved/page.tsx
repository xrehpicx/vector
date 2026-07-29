import { CollaborationSmartView } from '@/components/collaboration/collaboration-smart-view';

export default async function SavedPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <CollaborationSmartView orgSlug={orgSlug} mode='saved' />;
}
