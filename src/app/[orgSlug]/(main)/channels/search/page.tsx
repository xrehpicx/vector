import { CollaborationSmartView } from '@/components/collaboration/collaboration-smart-view';

export default async function SearchPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <CollaborationSmartView orgSlug={orgSlug} mode='search' />;
}
