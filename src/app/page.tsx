'use client';

import { useRouter } from 'nextjs-toploader/app';
import { useEffect } from 'react';
import { api, useQuery } from '@/lib/convex';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function SidebarNavSkeleton({
  rows,
  className,
}: {
  rows: Array<'short' | 'medium' | 'long'>;
  className?: string;
}) {
  const widths = {
    short: 'w-20',
    medium: 'w-28',
    long: 'w-40',
  } as const;

  return (
    <div className={cn('space-y-1.5', className)}>
      {rows.map((width, index) => (
        <div key={`${width}-${index}`} className='flex h-7 items-center gap-2'>
          <Skeleton className='size-3.5 shrink-0 rounded-sm' />
          <Skeleton className={cn('h-3.5', widths[width])} />
        </div>
      ))}
    </div>
  );
}

function InitialWorkspaceSkeleton() {
  return (
    <main
      className='bg-background text-foreground flex min-h-screen w-full overflow-hidden'
      role='status'
      aria-label='Preparing workspace'
    >
      <aside className='border-border/70 bg-sidebar hidden w-[284px] shrink-0 flex-col border-r md:flex'>
        <div className='border-border/70 flex h-12 items-center gap-2 border-b px-3'>
          <Skeleton className='size-6 rounded-md' />
          <Skeleton className='h-4 w-20' />
          <Skeleton className='ml-auto size-6 rounded-md' />
        </div>

        <div className='flex-1 space-y-6 px-3 py-4'>
          <div className='space-y-2'>
            <Skeleton className='h-3 w-16' />
            <SidebarNavSkeleton rows={['medium']} />
          </div>

          <div className='space-y-2'>
            <Skeleton className='h-3 w-20' />
            <SidebarNavSkeleton rows={['medium', 'short']} />
          </div>

          <div className='space-y-2'>
            <Skeleton className='h-3 w-24' />
            <SidebarNavSkeleton rows={['medium', 'long', 'medium']} />
          </div>

          <div className='space-y-2'>
            <Skeleton className='h-3 w-14' />
            <SidebarNavSkeleton rows={['long', 'medium', 'short']} />
          </div>
        </div>

        <div className='border-border/70 flex h-14 items-center gap-2 border-t px-3'>
          <Skeleton className='size-8 rounded-full' />
          <div className='min-w-0 flex-1 space-y-1.5'>
            <Skeleton className='h-3.5 w-20' />
            <Skeleton className='h-3 w-14' />
          </div>
          <Skeleton className='size-7 rounded-md' />
        </div>
      </aside>

      <section className='flex min-w-0 flex-1 flex-col'>
        <div className='border-border/70 flex h-12 items-center gap-2 border-b px-3 md:hidden'>
          <Skeleton className='size-6 rounded-md' />
          <Skeleton className='h-4 w-20' />
          <Skeleton className='ml-auto size-7 rounded-md' />
        </div>

        <div className='border-border/70 flex h-12 items-center gap-2 border-b px-4'>
          <Skeleton className='size-6 rounded-md' />
          <Skeleton className='h-4 w-36' />
          <div className='ml-auto hidden items-center gap-2 sm:flex'>
            <Skeleton className='h-7 w-28 rounded-md' />
            <Skeleton className='h-7 w-8 rounded-md' />
          </div>
        </div>

        <div className='mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5'>
          <div className='flex flex-wrap items-center gap-2'>
            <Skeleton className='h-8 w-44 rounded-md' />
            <Skeleton className='h-8 w-28 rounded-md' />
            <Skeleton className='h-8 w-24 rounded-md' />
            <Skeleton className='ml-auto hidden h-8 w-24 rounded-md sm:block' />
          </div>

          <div className='mt-5 rounded-lg border'>
            <div className='border-border/70 flex h-9 items-center gap-3 border-b px-3'>
              <Skeleton className='h-3 w-10' />
              <Skeleton className='h-3 w-24' />
              <Skeleton className='hidden h-3 w-20 sm:block' />
              <Skeleton className='ml-auto h-3 w-14' />
            </div>

            <div className='divide-border/70 divide-y'>
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className='flex h-12 items-center gap-3 px-3'>
                  <Skeleton className='size-3.5 shrink-0 rounded-sm' />
                  <div className='min-w-0 flex-1 space-y-1.5'>
                    <Skeleton
                      className={cn(
                        'h-3.5',
                        index % 3 === 0
                          ? 'w-3/5'
                          : index % 3 === 1
                            ? 'w-4/5'
                            : 'w-1/2',
                      )}
                    />
                    <Skeleton className='h-3 w-28 sm:hidden' />
                  </div>
                  <Skeleton className='hidden h-5 w-16 rounded-full sm:block' />
                  <Skeleton className='hidden size-6 rounded-full sm:block' />
                  <Skeleton className='h-5 w-14 rounded-full' />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// --- Post-login redirect logic -----------------------------------------------------------
export default function Home() {
  const router = useRouter();
  const brandingQuery = useQuery(api.platformAdmin.queries.getBranding, {});
  const userQuery = useQuery(api.users.currentUser);
  const userOrgsQuery = useQuery(api.users.getOrganizations);

  const branding = brandingQuery.data;
  const user = userQuery.data;
  const userOrgs = userOrgsQuery.data;
  const hasOrganizations = userOrgs && userOrgs.length > 0;

  useEffect(() => {
    if (
      brandingQuery.isPending ||
      userQuery.isPending ||
      userOrgsQuery.isPending
    ) {
      return;
    }

    if (user === null) {
      if (branding?.defaultOrgSlug) {
        router.replace(`/${branding.defaultOrgSlug}`);
        return;
      }

      router.replace('/auth/login');
      return;
    }

    // Authenticated users only go to workspaces they are members of.
    if (hasOrganizations && userOrgs?.[0]?.slug) {
      router.replace(`/${userOrgs[0].slug}/channels`);
      return;
    }

    if (user?.role === 'platform_admin') {
      router.replace('/admin');
      return;
    }

    router.replace('/org-setup');
  }, [
    user,
    branding?.defaultOrgSlug,
    brandingQuery.isPending,
    hasOrganizations,
    router,
    userOrgs,
    userQuery.isPending,
    userOrgsQuery.isPending,
  ]);

  return <InitialWorkspaceSkeleton />;
}
