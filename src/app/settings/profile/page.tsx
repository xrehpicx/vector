'use client';

import { ProfileForm } from '@/components/profile-form';
import { redirect } from 'next/navigation';
import { useEffect } from 'react';
import { api, useQuery } from '@/lib/convex';
import { User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const header = (
  <div className='border-b'>
    <div className='flex items-center p-1 pl-8 lg:pl-1'>
      <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
        <User className='size-3.5' />
        Profile
      </span>
    </div>
  </div>
);

export default function ProfilePage() {
  const userQuery = useQuery(api.users.currentUser);
  const user = userQuery.data;

  useEffect(() => {
    if (userQuery.isError) {
      console.error('Error loading user:', userQuery.error);
      return;
    }

    if (!userQuery.isPending && user === null) {
      redirect('/auth/login');
    }
  }, [user, userQuery.isPending, userQuery.isError, userQuery.error]);

  if (userQuery.isPending) {
    return (
      <div className='bg-background h-full'>
        {header}
        <div className='space-y-4 p-3'>
          <div className='space-y-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-10 w-full max-w-md' />
          </div>
          <div className='space-y-2'>
            <Skeleton className='h-4 w-20' />
            <Skeleton className='h-10 w-full max-w-md' />
          </div>
          <div className='space-y-2'>
            <Skeleton className='h-4 w-12' />
            <Skeleton className='h-10 w-full max-w-md' />
          </div>
          <Skeleton className='h-9 w-20' />
        </div>
      </div>
    );
  }

  if (userQuery.isError) {
    return (
      <div className='bg-background h-full'>
        {header}
        <div className='text-destructive p-3 text-sm'>
          Error loading profile: {userQuery.error?.message}
        </div>
      </div>
    );
  }

  if (user === null) {
    return null;
  }

  return (
    <div className='bg-background h-full'>
      {header}

      <div className='p-3'>
        <ProfileForm />
      </div>
    </div>
  );
}
