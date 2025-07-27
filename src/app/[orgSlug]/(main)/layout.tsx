import { OrgSidebar } from "@/components/organization/org-sidebar";

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { orgSlug } = await params;

  return (
    <div className="flex h-full min-h-screen">
      <OrgSidebar orgSlug={orgSlug} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
