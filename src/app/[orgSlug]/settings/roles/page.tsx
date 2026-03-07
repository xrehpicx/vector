'use client';

import { Shield } from 'lucide-react';
import { RolesPageContent } from '@/components/organization/roles-page-content';
import { useParams } from 'next/navigation';
import { PermissionBoundary } from '@/hooks/use-permission-boundary';
import { PERMISSIONS } from '@/convex/_shared/permissions';

interface RolesSettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default function RolesSettingsPage({}: RolesSettingsPageProps) {
  const paramsObj = useParams();
  const orgSlug = paramsObj.orgSlug as string;

  return (
    <PermissionBoundary
      orgSlug={orgSlug}
      permission={PERMISSIONS.ORG_MANAGE_ROLES}
    >
      <div className='bg-background h-full'>
        <div className='border-b'>
          <div className='flex items-center p-1'>
            <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
              <Shield className='size-3.5' />
              Roles & Permissions
            </span>
          </div>
        </div>

        <div className='p-3'>
          <RolesPageContent orgSlug={orgSlug} />
        </div>
      </div>
    </PermissionBoundary>
  );
}
