'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  OrgSettingsSidebar,
  OrgOptionsDropdown,
} from '@/components/organization';
import { api, useCachedQuery } from '@/lib/convex';
import { useParams, usePathname } from 'next/navigation';
import { Doc } from '@/convex/_generated/dataModel';
import { ArrowLeft, PanelLeft, Menu } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { buttonVariants } from '@/components/ui/button';

interface OrgSettingsLayoutProps {
  children: React.ReactNode;
}

function SidebarContent({
  orgSlug,
  userRole,
  orgName,
  orgLogo,
  organizations,
  onNavigate,
}: {
  orgSlug: string;
  userRole: string;
  orgName: string;
  orgLogo?: string | null;
  organizations: Doc<'organizations'>[];
  onNavigate?: () => void;
}) {
  return (
    <div className='flex h-full flex-col'>
      <div className='p-2'>
        <OrgOptionsDropdown
          currentOrgSlug={orgSlug}
          currentOrgName={orgName}
          currentOrgLogo={orgLogo}
          organizations={organizations}
        />
      </div>
      <div className='flex-1 overflow-y-auto'>
        <OrgSettingsSidebar
          orgSlug={orgSlug}
          userRole={userRole}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}

export default function OrgSettingsLayout({
  children,
}: OrgSettingsLayoutProps) {
  const params = useParams();
  const pathname = usePathname();
  const orgSlug = params.orgSlug as string;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useCachedQuery(api.users.currentUser);
  const members = useCachedQuery(
    api.organizations.queries.listMembersWithRoles,
    user?._id ? { orgSlug } : 'skip',
  );
  const organization = useCachedQuery(
    api.organizations.queries.getBySlug,
    user?._id ? { orgSlug } : 'skip',
  );
  const userOrganizations = useCachedQuery(
    api.users.getOrganizations,
    user?._id ? {} : 'skip',
  );
  const userRole = members?.find(m => m.userId === user?._id)?.role || 'member';

  // Redirect unauthenticated users to login with return URL
  useEffect(() => {
    if (user === null) {
      window.location.href = `/auth/login?redirectTo=${encodeURIComponent(pathname)}`;
    }
  }, [user, pathname]);

  // Don't render children until we have auth
  if (user === undefined || user === null) {
    return (
      <div className='bg-secondary flex h-screen'>
        <aside className='hidden w-56 lg:block'>
          <div className='flex h-full flex-col'>
            <div className='p-2'>
              <Skeleton className='h-9 w-full rounded-md' />
            </div>
            <div className='space-y-1 p-2 pt-0'>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className='h-8 w-full rounded-md' />
              ))}
            </div>
          </div>
        </aside>
        <main className='bg-background m-2 ml-0 flex-1 rounded-md border' />
      </div>
    );
  }

  const organizations =
    userOrganizations?.filter(
      (org): org is Doc<'organizations'> => org !== null,
    ) || [];

  const orgName = organization?.name ?? 'Organization';

  const sidebarProps = {
    orgSlug,
    userRole,
    orgName,
    orgLogo: organization?.logo,
    organizations,
  };

  return (
    <div className='bg-secondary flex h-screen'>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden overflow-hidden transition-[width] duration-200 lg:block',
          collapsed ? 'w-0' : 'w-56',
        )}
      >
        <div className='flex h-full w-56 flex-col'>
          <SidebarContent {...sidebarProps} />

          {/* Collapse toggle */}
          <div className='p-2'>
            <button
              onClick={() => setCollapsed(true)}
              className='text-muted-foreground hover:text-foreground hover:bg-foreground/10 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
            >
              <PanelLeft className='size-4 shrink-0' />
              <span>Collapse</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop expand button (when collapsed) */}
      {collapsed && (
        <div className='hidden items-start pt-3 pl-2 lg:flex'>
          <button
            onClick={() => setCollapsed(false)}
            className='hover:bg-foreground/10 flex size-7 items-center justify-center rounded-md transition-colors'
            aria-label='Expand sidebar'
          >
            <PanelLeft className='text-muted-foreground size-4 rotate-180' />
          </button>
        </div>
      )}

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side='left'
          showCloseButton={false}
          className='bg-secondary w-56 p-0 sm:max-w-56'
        >
          <SheetTitle className='sr-only'>Settings navigation</SheetTitle>
          <SidebarContent
            {...sidebarProps}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className='bg-background relative m-2 ml-0 flex flex-1 flex-col overflow-y-auto rounded-md border'>
        <div className='bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex items-center gap-1 border-b px-2 py-1.5 backdrop-blur'>
          <button
            onClick={() => setMobileOpen(true)}
            className='hover:bg-accent/80 flex size-7 items-center justify-center rounded-md transition-colors lg:hidden'
            aria-label='Open settings menu'
          >
            <Menu className='text-muted-foreground size-4' />
          </button>
          <Link
            href={`/${orgSlug}`}
            className={cn(
              buttonVariants({
                variant: 'ghost',
                size: 'sm',
              }),
              'text-muted-foreground hover:text-foreground h-7 px-2',
            )}
          >
            <ArrowLeft className='size-3.5' />
            <span>Back to workspace</span>
          </Link>
        </div>
        <div className='min-h-0 flex-1'>{children}</div>
      </main>
    </div>
  );
}
