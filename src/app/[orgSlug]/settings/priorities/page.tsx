'use client';

import { Settings2 } from 'lucide-react';
import { PrioritiesPageContent } from './priorities-page-content';
import { api, useCachedQuery } from '@/lib/convex';
import { useParams } from 'next/navigation';
import { notFound } from 'next/navigation';

interface PrioritiesSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default function PrioritiesSettingsPage({}: PrioritiesSettingsPageProps) {
  const paramsObj = useParams();
  const orgSlug = paramsObj.orgSlug as string;

  const user = useCachedQuery(api.users.currentUser);
  const members = useCachedQuery(
    api.organizations.queries.listMembersWithRoles,
    {
      orgSlug,
    },
  );

  const userRole = members?.find(m => m.userId === user?._id)?.role || 'member';
  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin' || isOwner;

  // Only admins can access priorities management
  if (user !== undefined && members !== undefined && !isAdmin) {
    notFound();
  }

  return (
    <div className='bg-background h-full'>
      <div className='border-b'>
        <div className='flex items-center p-1 pl-9 lg:pl-1'>
          <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
            <Settings2 className='size-3.5' />
            Issue Priorities
          </span>
        </div>
      </div>

      <div className='p-3'>
        <PrioritiesPageContent orgSlug={orgSlug} />
      </div>
    </div>
  );
}
