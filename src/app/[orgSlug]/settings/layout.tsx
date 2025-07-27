import { OrgSettingsSidebar } from "@/components/organization";

interface OrgSettingsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgSettingsLayout({
  children,
  params,
}: OrgSettingsLayoutProps) {
  const { orgSlug } = await params;

  return (
    <div className="flex h-full min-h-screen">
      <OrgSettingsSidebar orgSlug={orgSlug} userRole={"member"} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
