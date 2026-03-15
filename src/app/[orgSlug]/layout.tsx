export default async function OrgLayout({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  return <>{children}</>;
}
