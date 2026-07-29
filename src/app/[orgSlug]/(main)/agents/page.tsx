import { AgentManagementPage } from '@/components/collaboration/agent-management-page';

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <AgentManagementPage orgSlug={orgSlug} />;
}
