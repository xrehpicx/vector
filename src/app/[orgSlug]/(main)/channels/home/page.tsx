import { MobileConversationHub } from '@/components/collaboration/mobile-conversation-hub';

export default async function ChannelHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <MobileConversationHub orgSlug={orgSlug} mode='all' />;
}
