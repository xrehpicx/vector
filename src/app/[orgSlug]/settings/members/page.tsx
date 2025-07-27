import MembersSettingsPageClient from "./members-client";

interface MembersSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function MembersSettingsPage({
  params,
}: MembersSettingsPageProps) {
  const { orgSlug } = await params;
  return <MembersSettingsPageClient orgSlug={orgSlug} />;
}
