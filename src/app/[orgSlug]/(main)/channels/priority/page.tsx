import { CollaborationSmartView } from '@/components/collaboration/collaboration-smart-view';

export default async function PriorityPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <CollaborationSmartView orgSlug={orgSlug} mode='priority' />;
}
