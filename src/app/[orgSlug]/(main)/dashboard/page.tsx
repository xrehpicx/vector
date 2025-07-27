import DashboardClient from "./dashboard-client";

interface DashboardPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { orgSlug } = await params;

  return <DashboardClient orgSlug={orgSlug} />;
}
