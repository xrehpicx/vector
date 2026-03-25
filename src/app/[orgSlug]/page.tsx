import { api } from '@/convex/_generated/api';
import { PublicLayout } from '@/components/views/public-layout';
import { PublicViewPage } from '@/components/views/public-view-page';
import { getConvexClient } from '@/lib/convex-server';
import { isAuthenticated } from '@/lib/auth-server';
import { redirect } from 'next/navigation';

interface OrgRootPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function OrgRootPage({ params }: OrgRootPageProps) {
  const { orgSlug } = await params;

  // Logged-in users go straight to the main app
  if (await isAuthenticated()) {
    redirect(`/${orgSlug}/issues`);
  }

  // Anonymous visitors see the public landing page if configured
  try {
    const publicProfile = await getConvexClient().query(
      api.organizations.queries.getPublicProfileBySlug,
      { orgSlug },
    );

    if (publicProfile?.publicLandingViewId) {
      return (
        <PublicLayout orgSlug={orgSlug}>
          <PublicViewPage
            orgSlug={orgSlug}
            viewId={publicProfile.publicLandingViewId}
          />
        </PublicLayout>
      );
    }
  } catch (error) {
    console.error('Failed to load org landing page', error);
  }

  redirect(`/${orgSlug}/issues`);
}
