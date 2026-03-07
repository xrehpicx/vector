'use client';

import { ProfileForm } from '@/components/profile-form';
import { redirect } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@/lib/convex';
import { api } from '@/lib/convex';
import { User } from 'lucide-react';

const header = (
  <div className='border-b'>
    <div className='flex items-center p-1'>
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
        <div className='text-muted-foreground p-3 text-sm'>Loading...</div>
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
