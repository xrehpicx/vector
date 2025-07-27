import OrgSettingsPageClient from "./settings-client";

interface OrgSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgSettingsPage({
  params,
}: OrgSettingsPageProps) {
  const { orgSlug } = await params;

  return <OrgSettingsPageClient orgSlug={orgSlug} />;
}
