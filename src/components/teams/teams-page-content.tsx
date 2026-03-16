'use client';

import { useState } from 'react';
import { CreateTeamButton, TeamsTable } from '@/components/teams';
import { Button } from '@/components/ui/button';

import { PageSkeleton } from '@/components/ui/table-skeleton';
import { MobileNavTrigger } from '@/app/[orgSlug]/(main)/layout';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/lib/convex';
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

  const allTeamsData = useQuery(api.teams.queries.list, { orgSlug });
  const myTeamsData = useQuery(api.teams.queries.listMyTeams, { orgSlug });
  const isLoading = allTeamsData === undefined || myTeamsData === undefined;

  // Transform data
  const transformTeams = (data: typeof allTeamsData | typeof myTeamsData) =>
    (data ?? []).map(team => ({
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

  const allTeams = transformTeams(allTeamsData);
  const myTeams = transformTeams(myTeamsData);
  const teams = scopeTab === 'mine' ? myTeams : allTeams;

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
  if (isLoading && allTeams.length === 0) {
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
                setPage(1);
              }}
            >
              <span>My teams</span>
              <span className='text-muted-foreground text-xs'>
                {myTeams.length}
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
                setPage(1);
              }}
            >
              <span>All teams</span>
              <span className='text-muted-foreground text-xs'>
                {allTeams.length}
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
    </div>
  );
}
