import { CollaborationSmartView } from '@/components/collaboration/collaboration-smart-view';

export default async function ThreadsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <CollaborationSmartView orgSlug={orgSlug} mode='threads' />;
}
