'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Shield,
  RefreshCw,
  MailCheck,
  ShieldBan,
  Globe2,
  Lock,
  Menu,
} from 'lucide-react';
import { useAction, useMutation, useQuery, api } from '@/lib/convex';
import { UserMenu } from '@/components/user-menu';
import { PlatformAdminSidebar } from './platform-admin-sidebar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { GradientWaveText } from '@/components/gradient-wave-text';

const PLATFORM_ADMIN_ROLE = 'platform_admin';

function parseDomainInput(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map(entry => entry.trim())
    .filter(Boolean);
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return 'Never';
  }

  return new Date(timestamp).toLocaleString();
}

function AdminPageSkeleton() {
  return (
    <div className='bg-secondary flex h-screen'>
      <aside className='hidden w-56 lg:block'>
        <div className='flex h-full flex-col'>
          <div className='flex-1 overflow-y-auto'>
            <div className='space-y-4 p-2 pt-0'>
              <Skeleton className='h-8 w-full rounded-md' />
              <div className='space-y-2'>
                <Skeleton className='h-4 w-28' />
                <Skeleton className='h-8 w-full rounded-md' />
              </div>
            </div>
          </div>
          <div className='border-border border-t p-2'>
            <div className='flex items-center gap-2 p-2'>
              <Skeleton className='size-8 rounded-full' />
              <Skeleton className='h-4 w-28' />
            </div>
          </div>
        </div>
      </aside>

      <main className='bg-background m-2 ml-0 flex-1 overflow-y-auto rounded-md border'>
        <div className='border-b'>
          <div className='flex items-center p-1 pl-8 lg:pl-1'>
            <Skeleton className='h-5 w-32' />
          </div>
        </div>

        <div className='space-y-4 p-3'>
          <div className='space-y-2'>
            <Skeleton className='h-7 w-48' />
            <Skeleton className='h-4 w-80' />
          </div>

          <div className='grid gap-2 md:grid-cols-3'>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className='rounded-md border p-3'>
                <Skeleton className='h-3 w-20' />
                <Skeleton className='mt-2 h-5 w-16' />
              </div>
            ))}
          </div>

          <div className='rounded-md border p-3'>
            <Skeleton className='h-4 w-36' />
            <Skeleton className='mt-3 h-28 w-full rounded-md' />
            <Skeleton className='mt-3 h-9 w-28 rounded-md' />
          </div>
        </div>
      </main>
    </div>
  );
}

export function PlatformAdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [blockedInput, setBlockedInput] = useState('');
  const [allowedInput, setAllowedInput] = useState('');
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const userQuery = useQuery(api.users.currentUser);
  const user = userQuery.data;
  const policyQuery = useQuery(
    api.platformAdmin.queries.getSignupPolicy,
    user?.role === PLATFORM_ADMIN_ROLE ? {} : 'skip',
  );

  const updatePolicy = useMutation(
    api.platformAdmin.mutations.updateSignupEmailDomainPolicy,
  );
  const runSync = useAction(
    api.platformAdmin.actions.runDisposableDomainSyncNow,
  );

  useEffect(() => {
    if (userQuery.isPending) {
      return;
    }

    if (user === null) {
      router.replace(`/auth/login?redirectTo=${encodeURIComponent(pathname)}`);
      return;
    }

    if (user?.role !== PLATFORM_ADMIN_ROLE) {
      router.replace('/403');
    }
  }, [pathname, router, user, userQuery.isPending]);

  useEffect(() => {
    if (!policyQuery.data || hasLocalEdits) {
      return;
    }

    setBlockedInput(policyQuery.data.blockedDomains.join('\n'));
    setAllowedInput(policyQuery.data.allowedDomains.join('\n'));
  }, [hasLocalEdits, policyQuery.data]);

  if (
    userQuery.isPending ||
    (user?.role === PLATFORM_ADMIN_ROLE && policyQuery.isPending)
  ) {
    return <AdminPageSkeleton />;
  }

  if (userQuery.isError) {
    return (
      <div className='bg-secondary flex h-screen items-center justify-center p-4'>
        <div className='bg-background w-full max-w-md rounded-md border p-4'>
          <div className='text-sm font-medium'>
            Unable to load platform admin
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>
            {userQuery.error?.message ??
              'The current user could not be loaded.'}
          </p>
        </div>
      </div>
    );
  }

  if (user?.role !== PLATFORM_ADMIN_ROLE) {
    return null;
  }

  if (policyQuery.isError) {
    return (
      <div className='bg-secondary flex h-screen items-center justify-center p-4'>
        <div className='bg-background w-full max-w-md rounded-md border p-4'>
          <div className='text-sm font-medium'>
            Unable to load signup policy
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>
            {policyQuery.error?.message ??
              'The policy data could not be loaded.'}
          </p>
        </div>
      </div>
    );
  }

  const policy = policyQuery.data;
  if (!policy) {
    return <AdminPageSkeleton />;
  }

  const syncStats = policy.sync;
  const isDirty =
    blockedInput !== policy.blockedDomains.join('\n') ||
    allowedInput !== policy.allowedDomains.join('\n');

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await updatePolicy({
        blockedDomains: parseDomainInput(blockedInput),
        allowedDomains: parseDomainInput(allowedInput),
      });

      setHasLocalEdits(false);
      toast.success('Signup policy saved');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save policy',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);

    try {
      const result = await runSync({});
      toast.success(`Synced ${result.totalRulesCount} disposable domains`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to sync upstream domains',
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const blockedCount = policy.blockedDomains.length;
  const allowedCount = policy.allowedDomains.length;

  return (
    <div className='bg-secondary flex h-screen'>
      <aside className='hidden w-56 lg:block'>
        <div className='flex h-full flex-col'>
          <div className='flex-1 overflow-y-auto'>
            <PlatformAdminSidebar />
          </div>
          <div className='border-border border-t p-2'>
            <UserMenu />
          </div>
        </div>
      </aside>

      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent
          side='left'
          showCloseButton={false}
          className='bg-secondary w-56 p-0 sm:max-w-56'
        >
          <SheetTitle className='sr-only'>Platform admin navigation</SheetTitle>
          <div className='flex h-full flex-col'>
            <div className='flex-1 overflow-y-auto'>
              <PlatformAdminSidebar />
            </div>
            <div className='border-border border-t p-2'>
              <UserMenu />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main className='bg-background relative m-2 ml-0 flex-1 overflow-y-auto rounded-md border'>
        <button
          onClick={() => setIsMobileOpen(true)}
          className='hover:bg-accent/80 absolute top-1.5 left-1.5 z-10 flex size-7 items-center justify-center rounded-md transition-colors lg:hidden'
          aria-label='Open platform admin menu'
        >
          <Menu className='text-muted-foreground size-4' />
        </button>

        <div className='border-b'>
          <div className='flex items-center p-1 pl-8 lg:pl-1'>
            <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
              <Shield className='size-3.5' />
              Platform Admin
            </span>
          </div>
        </div>

        <div className='space-y-4 p-3'>
          <div className='space-y-1'>
            <h1 className='text-lg font-semibold tracking-tight'>
              Signup access and disposable-domain policy
            </h1>
            <p className='text-muted-foreground text-sm'>
              Control who can create accounts on this Vector instance and keep a
              synced blacklist of temporary email providers.
            </p>
          </div>

          <div className='grid gap-2 xl:grid-cols-4'>
            <div className='rounded-md border px-3 py-2'>
              <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <ShieldBan className='size-3.5' />
                Manual blocked
              </div>
              <div className='mt-1 text-sm font-semibold'>{blockedCount}</div>
            </div>
            <div className='rounded-md border px-3 py-2'>
              <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <Lock className='size-3.5' />
                Allowed domains
              </div>
              <div className='mt-1 text-sm font-semibold'>{allowedCount}</div>
            </div>
            <div className='rounded-md border px-3 py-2'>
              <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <MailCheck className='size-3.5' />
                Upstream blacklist
              </div>
              <div className='mt-1 text-sm font-semibold'>
                {syncStats.totalRulesCount}
              </div>
            </div>
            <div className='rounded-md border px-3 py-2'>
              <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <Globe2 className='size-3.5' />
                Last sync
              </div>
              <div className='mt-1 text-sm font-semibold'>
                {formatTimestamp(syncStats.lastSyncedAt)}
              </div>
            </div>
          </div>

          <div className='rounded-md border'>
            <div className='border-b px-3 py-2'>
              <div className='text-sm font-medium'>Manual signup policy</div>
              <p className='text-muted-foreground mt-1 text-xs'>
                If the allowed list has any entries, only those domains can sign
                up. Allowed domains override blocked and upstream disposable
                rules.
              </p>
            </div>

            <div className='grid gap-3 p-3 xl:grid-cols-2'>
              <div className='space-y-2'>
                <div className='text-xs font-medium'>Allowed domains</div>
                <Textarea
                  value={allowedInput}
                  onChange={event => {
                    setAllowedInput(event.target.value);
                    setHasLocalEdits(true);
                  }}
                  rows={12}
                  placeholder={'example.com\ncompany.io'}
                  className='min-h-52 resize-y text-sm'
                />
                <p className='text-muted-foreground text-xs'>
                  Use this to turn signup into an allowlist. Subdomains are
                  matched automatically.
                </p>
              </div>

              <div className='space-y-2'>
                <div className='text-xs font-medium'>
                  Manual blocked domains
                </div>
                <Textarea
                  value={blockedInput}
                  onChange={event => {
                    setBlockedInput(event.target.value);
                    setHasLocalEdits(true);
                  }}
                  rows={12}
                  placeholder={'mailinator.com\nyopmail.com'}
                  className='min-h-52 resize-y text-sm'
                />
                <p className='text-muted-foreground text-xs'>
                  Use one domain per line or comma-separated values for
                  permanent local blocks.
                </p>
              </div>
            </div>

            <div className='border-t px-3 py-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  className='h-8'
                  disabled={isSaving || !isDirty}
                  onClick={handleSave}
                >
                  {isSaving ? (
                    <RefreshCw className='mr-2 size-3.5 animate-spin' />
                  ) : null}
                  Save policy
                </Button>
                <div className='text-muted-foreground text-xs'>
                  Changes apply to email/password signups immediately.
                </div>
              </div>
            </div>
          </div>

          <div className='rounded-md border'>
            <div className='border-b px-3 py-2'>
              <div className='text-sm font-medium'>
                Disposable blacklist sync
              </div>
              <p className='text-muted-foreground mt-1 text-xs'>
                Syncs the upstream disposable-email-domains feed into indexed
                rows so temporary inbox providers are blocked without manual
                maintenance.
              </p>
            </div>

            <div className='grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3'>
              <div className='rounded-md border px-3 py-2'>
                <div className='text-muted-foreground text-xs'>
                  Fetched last run
                </div>
                <div className='mt-1 text-sm font-semibold'>
                  {syncStats.fetchedCount}
                </div>
              </div>
              <div className='rounded-md border px-3 py-2'>
                <div className='text-muted-foreground text-xs'>
                  Inserted / updated
                </div>
                <div className='mt-1 text-sm font-semibold'>
                  {syncStats.insertedCount} / {syncStats.updatedCount}
                </div>
              </div>
              <div className='rounded-md border px-3 py-2'>
                <div className='text-muted-foreground text-xs'>
                  Deleted / skipped
                </div>
                <div className='mt-1 text-sm font-semibold'>
                  {syncStats.deletedCount} / {syncStats.skippedCount}
                </div>
              </div>
            </div>

            <div className='border-t px-3 py-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  variant='outline'
                  className='h-8'
                  disabled={isSyncing}
                  onClick={handleSync}
                >
                  <RefreshCw
                    className={`mr-2 size-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  Sync upstream now
                </Button>
                <div className='text-muted-foreground text-xs'>
                  Nightly cron runs at 03:00 UTC.
                </div>
              </div>

              <GradientWaveText className='text-muted-foreground mt-3 justify-center text-xs'>
                Upstream sync keeps disposable domains current without bloating
                the site settings document.
              </GradientWaveText>

              {syncStats.lastFailureMessage ? (
                <div className='mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700'>
                  Last failure at {formatTimestamp(syncStats.lastFailureAt)}:{' '}
                  {syncStats.lastFailureMessage}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
