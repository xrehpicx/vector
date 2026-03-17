'use client';

import { Github } from 'lucide-react';
import { GitHubIntegrationSettings } from '@/components/organization/github-integration-settings';
import { api, useCachedQuery } from '@/lib/convex';
import { useParams } from 'next/navigation';
import { notFound } from 'next/navigation';

export default function GitHubIntegrationPage() {
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

  if (user !== undefined && members !== undefined && !isAdmin) {
    notFound();
  }

  return (
    <div className='bg-background h-full'>
      <div className='border-b'>
        <div className='flex items-center p-1 pl-9 lg:pl-1'>
          <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
            <Github className='size-3.5' />
            GitHub Integration
          </span>
        </div>
      </div>

      <div className='p-3'>
        <GitHubIntegrationSettings orgSlug={orgSlug} />
      </div>
    </div>
  );
}
