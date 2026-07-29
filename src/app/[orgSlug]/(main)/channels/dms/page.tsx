import { MobileConversationHub } from '@/components/collaboration/mobile-conversation-hub';

export default async function DirectMessagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <MobileConversationHub orgSlug={orgSlug} mode='direct' />;
}
