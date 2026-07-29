import { ChannelPageClient } from './channel-page-client';

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; channelSlug: string }>;
}) {
  const { orgSlug, channelSlug } = await params;
  return <ChannelPageClient orgSlug={orgSlug} channelSlug={channelSlug} />;
}
