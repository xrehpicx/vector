'use client';

import { Users } from 'lucide-react';
import { MembersList } from '@/components/organization';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams } from 'next/navigation';
import { useRequirePermission } from '@/hooks/use-permission-boundary';
import { PERMISSIONS } from '@/convex/_shared/permissions';

interface MembersSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default function MembersSettingsPage({}: MembersSettingsPageProps) {
  const paramsObj = useParams();
  const orgSlug = paramsObj.orgSlug as string;

  // Require permission to manage members - will redirect to 403 if denied
  const { isLoading: permissionLoading } = useRequirePermission(
    orgSlug,
    PERMISSIONS.ORG_MANAGE_MEMBERS,
  );

  if (permissionLoading) {
    return (
      <div className='bg-background h-full'>
        <div className='border-b'>
          <div className='flex items-center p-1 pl-9 lg:pl-1'>
            <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
              <Users className='size-3.5' />
              Members
            </span>
          </div>
        </div>
        <div className='space-y-3 p-3'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='flex items-center gap-3 py-2'>
              <Skeleton className='size-6 rounded-full' />
              <div className='flex-1 space-y-1'>
                <Skeleton className='h-4 w-28' />
                <Skeleton className='h-3 w-40' />
              </div>
              <Skeleton className='h-5 w-14 rounded-full' />
              <Skeleton className='h-3 w-16' />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className='bg-background h-full'>
      <div className='border-b'>
        <div className='flex items-center p-1 pl-9 lg:pl-1'>
          <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
            <Users className='size-3.5' />
            Members & Access
          </span>
        </div>
      </div>

      <div className='p-3'>
        <MembersList orgSlug={orgSlug} />
      </div>
    </div>
  );
}
