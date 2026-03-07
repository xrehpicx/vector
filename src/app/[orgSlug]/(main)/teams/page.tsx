'use client';

import React, { Suspense } from 'react';
import { TeamsPageContent } from '@/components/teams/teams-page-content';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { PageSkeleton } from '@/components/ui/table-skeleton';

interface TeamsPageProps {
  params: Promise<{ orgSlug: string }>;
}

function TeamsPageInner({ orgSlug }: { orgSlug: string }) {
  const canCreateTeams = useQuery(api.permissions.queries.has, {
    orgSlug,
    permission: 'team:create',
  });

  if (canCreateTeams === undefined) {
    return (
      <PageSkeleton
        showTabs={true}
        tabCount={1}
        showCreateButton={false}
        tableRows={8}
        tableColumns={4}
      />
    );
  }

  return <TeamsPageContent orgSlug={orgSlug} canCreateTeams={canCreateTeams} />;
}

export default function TeamsPage({ params }: TeamsPageProps) {
  return <TeamsPageWrapper params={params} />;
}

function TeamsPageWrapper({ params }: TeamsPageProps) {
  const [orgSlug, setOrgSlug] = React.useState<string | null>(null);

  React.useEffect(() => {
    void params.then(({ orgSlug }) => setOrgSlug(orgSlug));
  }, [params]);

  if (!orgSlug) {
    return (
      <PageSkeleton
        showTabs={true}
        tabCount={1}
        showCreateButton={true}
        tableRows={8}
        tableColumns={4}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <PageSkeleton
          showTabs={true}
          tabCount={1}
          showCreateButton={true}
          tableRows={8}
          tableColumns={4}
        />
      }
    >
      <TeamsPageInner orgSlug={orgSlug} />
    </Suspense>
  );
}
