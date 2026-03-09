'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery, api } from '@/lib/convex';
import { Skeleton } from '@/components/ui/skeleton';

// --- Post-login redirect logic -----------------------------------------------------------
export default function Home() {
  const router = useRouter();
  const userQuery = useQuery(api.users.currentUser);
  const userOrgsQuery = useQuery(api.users.getOrganizations);

  const user = userQuery.data;
  const userOrgs = userOrgsQuery.data;
  const hasOrganizations = userOrgs && userOrgs.length > 0;

  useEffect(() => {
    if (userQuery.isPending || userOrgsQuery.isPending) return;

    if (user === null) {
      router.replace('/auth/login');
      return;
    }

    // User already has orgs — go to first one
    if (hasOrganizations && userOrgs?.[0]?.slug) {
      router.replace(`/${userOrgs[0].slug}/issues`);
      return;
    }

    if (user?.role === 'platform_admin') {
      router.replace('/admin');
      return;
    }

    router.replace('/org-setup');
  }, [
    user,
    hasOrganizations,
    router,
    userOrgs,
    userQuery.isPending,
    userOrgsQuery.isPending,
  ]);

  return (
    <div className='flex h-screen w-full items-center justify-center'>
      <div className='flex flex-col items-center gap-3'>
        <Skeleton className='size-10 rounded-lg' />
        <Skeleton className='h-4 w-32' />
      </div>
    </div>
  );
}
