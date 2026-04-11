import { api } from '@/convex/_generated/api';
import { PublicLandingHero } from '@/components/views/public-landing-hero';
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

    // If the admin enabled public submissions without choosing a landing
    // view, we still render a minimal hero so visitors have somewhere to
    // land the submit button on.
    if (publicProfile?.publicIssueSubmissionEnabled) {
      return (
        <PublicLayout orgSlug={orgSlug}>
          <PublicLandingHero
            orgSlug={orgSlug}
            orgName={publicProfile.name}
            publicDescription={publicProfile.publicDescription}
            publicIssueViewId={publicProfile.publicIssueViewId}
          />
        </PublicLayout>
      );
    }
  } catch (error) {
    console.error('Failed to load org landing page', error);
  }

  redirect(`/${orgSlug}/issues`);
}
