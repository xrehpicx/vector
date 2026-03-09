'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useQuery } from '@/lib/convex';
import { api } from '@/lib/convex';

export function PlatformAdminSidebar() {
  const pathname = usePathname();
  const organizationsQuery = useQuery(api.users.getOrganizations);
  const firstOrganization = organizationsQuery.data?.[0];

  const handleBackClick = () => {
    if (firstOrganization?.slug) {
      window.location.href = `/${firstOrganization.slug}/issues`;
      return;
    }

    window.location.href = '/settings';
  };

  return (
    <nav className='space-y-1 p-2 pt-0'>
      <div className='mb-4'>
        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-foreground w-full justify-start gap-2 px-3 py-1.5 text-sm font-medium'
          onClick={handleBackClick}
        >
          <ArrowLeft className='size-4' />
          <span>
            {firstOrganization
              ? `Back to ${firstOrganization.name}`
              : 'Back to settings'}
          </span>
        </Button>
      </div>

      <div className='pb-2'>
        <h2 className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
          Platform Admin
        </h2>
      </div>

      <Link
        href='/admin'
        className={cn(
          'group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          'hover:bg-foreground/5 hover:text-foreground',
          pathname === '/admin'
            ? 'bg-foreground/5 text-foreground'
            : 'text-muted-foreground',
        )}
      >
        <Shield className='size-4 shrink-0' />
        <span className='truncate'>Signup Access</span>
      </Link>
    </nav>
  );
}
