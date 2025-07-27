import { StatesPageContent } from "./states-page-content";

interface StatesSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function StatesSettingsPage({
  params,
}: StatesSettingsPageProps) {
  const { orgSlug } = await params;

  return <StatesPageContent orgSlug={orgSlug} />;
}
