import { use } from 'react';
import { PublicLayout } from '@/components/views/public-layout';

export default function PublicProjectLayout({
  params,
  children,
}: {
  params: Promise<{ orgSlug: string }>;
  children: React.ReactNode;
}) {
  const { orgSlug } = use(params);

  return <PublicLayout orgSlug={orgSlug}>{children}</PublicLayout>;
}
