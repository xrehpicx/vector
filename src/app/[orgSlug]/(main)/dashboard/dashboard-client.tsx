'use client';

import { useCachedQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { PageSkeleton } from '@/components/ui/table-skeleton';
import { Users, FolderOpen, GitBranch, Bug } from 'lucide-react';
import { MobileNavTrigger } from '../layout';

interface DashboardClientProps {
  orgSlug: string;
}

export default function DashboardClient({ orgSlug }: DashboardClientProps) {
  const orgStats = useCachedQuery(
    api.organizations.queries.getOrganizationStats,
    {
      orgSlug,
    },
  );

  if (orgStats === undefined) {
    return <PageSkeleton />;
  }

  if (orgStats === null) {
    return (
      <div className='flex items-center justify-center py-8'>
        <p className='text-muted-foreground text-sm'>Organization not found</p>
      </div>
    );
  }

  const { memberCount, teamCount, projectCount, issueCount } = orgStats;

  const stats = [
    { label: 'Members', value: memberCount, icon: Users },
    { label: 'Teams', value: teamCount, icon: GitBranch },
    { label: 'Projects', value: projectCount, icon: FolderOpen },
    { label: 'Issues', value: issueCount, icon: Bug },
  ];

  return (
    <div className='bg-background h-full'>
      {/* Header - matches the dense style of issues/projects/teams */}
      <div className='border-b'>
        <div className='flex items-center justify-between p-1'>
          <div className='flex items-center gap-1'>
            <MobileNavTrigger />
            <span className='px-3 text-xs font-medium'>Dashboard</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className='bg-border grid grid-cols-2 gap-px border-b lg:grid-cols-4'>
        {stats.map(stat => (
          <div
            key={stat.label}
            className='bg-background flex items-center gap-3 px-4 py-3'
          >
            <stat.icon className='text-muted-foreground size-4 flex-shrink-0' />
            <div className='min-w-0'>
              <p className='text-muted-foreground text-xs'>{stat.label}</p>
              <p className='text-lg font-semibold tabular-nums'>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
