'use client';

import { redirect } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@/lib/convex';
import { api } from '@/lib/convex';
import { Skeleton } from '@/components/ui/skeleton';

// --- Post-login redirect logic -----------------------------------------------------------
export default function Home() {
  const userQuery = useQuery(api.users.currentUser);
  const userOrgsQuery = useQuery(api.users.getOrganizations);

  const user = userQuery.data;
  const userOrgs = userOrgsQuery.data;
  const hasOrganizations = userOrgs && userOrgs.length > 0;

  useEffect(() => {
    if (userQuery.isPending) {
      // Still loading, don't redirect yet
      return;
    }

    if (user === null) {
      // Not authenticated
      redirect('/auth/login');
    } else {
      // Authenticated
      if (hasOrganizations && userOrgs?.[0]?.slug) {
        redirect(`/${userOrgs[0].slug}/issues`);
      } else if (user?.role === 'platform_admin') {
        redirect('/admin');
      } else {
        redirect('/org-setup');
      }
    }
  }, [user, hasOrganizations, userOrgs, userQuery.isPending]);

  return (
    <div className='flex h-screen w-full items-center justify-center'>
      <div className='flex flex-col items-center gap-3'>
        <Skeleton className='size-10 rounded-lg' />
        <Skeleton className='h-4 w-32' />
      </div>
    </div>
  );
}
