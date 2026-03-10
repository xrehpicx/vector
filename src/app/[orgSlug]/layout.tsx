import { OrgAssistantDock } from '@/components/assistant/org-assistant-dock';

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  return (
    <>
      {children}
      <OrgAssistantDock orgSlug={orgSlug} />
    </>
  );
}
