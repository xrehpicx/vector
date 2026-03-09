'use client';

import { redirect } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { useQuery } from '@/lib/convex';
import { api } from '@/lib/convex';
import { usePathname } from 'next/navigation';
import { UserSettingsSidebar } from '@/components/settings/user-settings-sidebar';
import { UserMenu } from '@/components/user-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const userQuery = useQuery(api.users.currentUser);
  const user = userQuery.data;
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (userQuery.isError) {
      console.error('Error loading user:', userQuery.error);
      return;
    }

    if (!userQuery.isPending && user === null) {
      redirect(`/auth/login?redirectTo=${encodeURIComponent(pathname)}`);
    }
  }, [user, userQuery.isPending, userQuery.isError, userQuery.error, pathname]);

  if (userQuery.isPending) {
    return (
      <div className='bg-secondary flex h-screen'>
        <aside className='hidden w-56 lg:block'>
          <div className='flex h-full flex-col'>
            <div className='flex-1 overflow-y-auto'>
              <div className='space-y-4 p-2 pt-0'>
                <div className='space-y-2'>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className='flex h-8 items-center gap-2 rounded-md px-2 py-1'
                    >
                      <Skeleton className='size-4 rounded' />
                      <Skeleton className='h-4 w-24' />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className='border-border border-t p-2'>
              <div className='flex w-full justify-start gap-2 p-2'>
                <Skeleton className='size-8 rounded-full' />
                <div className='flex flex-col items-start gap-1'>
                  <Skeleton className='h-3.5 w-20' />
                  <Skeleton className='h-3 w-28' />
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className='bg-background m-2 ml-0 flex-1 overflow-y-auto rounded-md border'>
          <div className='space-y-3 p-3'>
            <Skeleton className='h-4 w-32' />
            <div className='space-y-2'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (userQuery.isError) {
    return (
      <div className='bg-secondary flex h-screen'>
        <aside className='hidden w-56 lg:block'>
          <div className='flex h-full flex-col'>
            <div className='flex-1 overflow-y-auto'>
              <div className='space-y-4 p-2 pt-0'>
                <div className='space-y-1'>
                  <div className='flex h-8 items-center gap-2 rounded-md px-2 py-1 text-sm font-medium'>
                    <span>Error</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className='bg-background m-2 ml-0 flex-1 overflow-y-auto rounded-md border'>
          <div className='flex h-full items-center justify-center'>
            <div className='text-destructive text-lg font-medium'>
              Error loading settings: {userQuery.error?.message}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (user === null) {
    return null; // Redirect will handle this
  }

  return (
    <div className='bg-secondary flex h-screen'>
      {/* Desktop Settings Sidebar */}
      <aside className='hidden w-56 lg:block'>
        <div className='flex h-full flex-col'>
          {/* Settings Navigation */}
          <div className='flex-1 overflow-y-auto'>
            <UserSettingsSidebar />
          </div>

          {/* User menu at bottom */}
          <div className='border-border border-t p-2'>
            <UserMenu />
          </div>
        </div>
      </aside>

      {/* Mobile sheet */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent
          side='left'
          showCloseButton={false}
          className='bg-secondary w-56 p-0 sm:max-w-56'
        >
          <SheetTitle className='sr-only'>Settings navigation</SheetTitle>
          <div className='flex h-full flex-col'>
            <div className='flex-1 overflow-y-auto'>
              <UserSettingsSidebar />
            </div>
            <div className='border-border border-t p-2'>
              <UserMenu />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className='bg-background relative m-2 ml-0 flex-1 overflow-y-auto rounded-md border'>
        {/* Mobile menu button */}
        <button
          onClick={() => setIsMobileOpen(true)}
          className='hover:bg-accent/80 absolute top-1.5 left-1.5 z-10 flex size-7 items-center justify-center rounded-md transition-colors lg:hidden'
          aria-label='Open settings menu'
        >
          <Menu className='text-muted-foreground size-4' />
        </button>
        <div className='h-full'>{children}</div>
      </main>
    </div>
  );
}
