import { redirect } from "next/navigation";

interface PrioritiesSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function PrioritiesSettingsPage({
  params,
}: PrioritiesSettingsPageProps) {
  const { orgSlug } = await params;

  // Route deprecated – redirect to unified states page
  redirect(`/${orgSlug}/settings/states`);
}
