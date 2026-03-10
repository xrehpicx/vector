'use client';

import { useState } from 'react';
import {
  OrgSettingsSidebar,
  OrgOptionsDropdown,
} from '@/components/organization';
import { useQuery } from 'convex/react';
import { api } from '@/lib/convex';
import { useParams } from 'next/navigation';
import { Doc } from '@/convex/_generated/dataModel';
import { PanelLeft, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

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
  const orgSlug = params.orgSlug as string;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = useQuery(api.users.currentUser);
  const members = useQuery(api.organizations.queries.listMembersWithRoles, {
    orgSlug,
  });
  const organization = useQuery(api.organizations.queries.getBySlug, {
    orgSlug,
  });
  const userOrganizations = useQuery(api.users.getOrganizations);
  const userRole = members?.find(m => m.userId === user?._id)?.role || 'member';

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
      <main className='bg-background relative m-2 ml-0 flex-1 overflow-y-auto rounded-md border pb-24 lg:pb-28'>
        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(true)}
          className='hover:bg-accent/80 absolute top-1.5 left-1.5 z-10 flex size-7 items-center justify-center rounded-md transition-colors lg:hidden'
          aria-label='Open settings menu'
        >
          <Menu className='text-muted-foreground size-4' />
        </button>
        {children}
      </main>
    </div>
  );
}
