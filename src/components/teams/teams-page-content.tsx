'use client';

import { useState } from 'react';
import { CreateTeamButton, TeamsTable } from '@/components/teams';
import { Button } from '@/components/ui/button';

import { PageSkeleton } from '@/components/ui/table-skeleton';
import { MobileNavTrigger } from '@/app/[orgSlug]/(main)/layout';
import { useMutation } from 'convex/react';
import { api, useCachedPaginatedQuery, useCachedQuery } from '@/lib/convex';
import { Id } from '@/convex/_generated/dataModel';
import { cn } from '@/lib/utils';

type ScopeTab = 'mine' | 'all';

interface TeamsPageContentProps {
  orgSlug: string;
  canCreateTeams: boolean;
  orgName?: string;
}

export function TeamsPageContent({
  orgSlug,
  canCreateTeams,
}: TeamsPageContentProps) {
  const [scopeTab, setScopeTab] = useState<ScopeTab>('mine');

  const summary = useCachedQuery(api.teams.queries.getListSummary, {
    orgSlug,
  });
  const { results, status, loadMore } = useCachedPaginatedQuery(
    api.teams.queries.listPage,
    { orgSlug, scope: scopeTab },
    { initialNumItems: 20 },
  );
  const isLoading = summary === undefined || status === 'LoadingFirstPage';

  // Transform data
  const teams = results.map(team => ({
    id: team._id,
    name: team.name,
    description: team.description,
    key: team.key,
    icon: team.icon,
    color: team.color,
    createdAt: new Date(team._creationTime),
    lead: team.lead,
    memberCount: team.memberCount,
  }));

  // --------------------------------------------------
  // Team operations
  // --------------------------------------------------
  const deleteMutation = useMutation(api.teams.mutations.deleteTeam);

  const handleDelete = (teamId: string) => {
    void deleteMutation({ teamId: teamId as Id<'teams'> });
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  if (isLoading) {
    return (
      <PageSkeleton
        showTabs={true}
        tabCount={2}
        showCreateButton={canCreateTeams}
        tableRows={8}
        tableColumns={4}
      />
    );
  }

  return (
    <div className='bg-background h-full'>
      {/* Header with tabs */}
      <div className='border-b'>
        <div className='flex items-center justify-between p-1'>
          <div className='flex items-center gap-1'>
            <MobileNavTrigger />
            <Button
              variant={scopeTab === 'mine' ? 'secondary' : 'ghost'}
              size='sm'
              className={cn(
                'h-6 gap-2 rounded-xs px-3 text-xs font-normal',
                scopeTab === 'mine' && 'bg-secondary',
              )}
              onClick={() => {
                setScopeTab('mine');
              }}
            >
              <span>My teams</span>
              <span className='text-muted-foreground text-xs'>
                {summary?.mineCount ?? 0}
              </span>
            </Button>
            <Button
              variant={scopeTab === 'all' ? 'secondary' : 'ghost'}
              size='sm'
              className={cn(
                'h-6 gap-2 rounded-xs px-3 text-xs font-normal',
                scopeTab === 'all' && 'bg-secondary',
              )}
              onClick={() => {
                setScopeTab('all');
              }}
            >
              <span>All teams</span>
              <span className='text-muted-foreground text-xs'>
                {summary?.allCount ?? 0}
              </span>
            </Button>
          </div>
          {canCreateTeams && (
            <CreateTeamButton orgSlug={orgSlug} size='sm' className='h-6' />
          )}
        </div>
      </div>

      {/* Teams table */}
      <TeamsTable
        orgSlug={orgSlug}
        teams={teams}
        onDelete={handleDelete}
        deletePending={false}
      />

      {status === 'CanLoadMore' && (
        <div className='border-t px-3 py-2'>
          <Button
            variant='outline'
            size='sm'
            className='h-7 text-xs'
            onClick={() => loadMore(20)}
          >
            Load more teams
          </Button>
        </div>
      )}
    </div>
  );
}
