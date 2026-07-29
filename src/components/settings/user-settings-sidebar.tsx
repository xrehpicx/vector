'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  User,
  Mail,
  Bell,
  Settings,
  Monitor,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, useQuery } from '@/lib/convex';
import {
  readLastWorkspaceNavigation,
  type LastWorkspaceNavigation,
} from '@/lib/workspace-navigation';

interface SettingsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export function UserSettingsSidebar() {
  const pathname = usePathname();
  const userOrgsQuery = useQuery(api.users.getOrganizations);
  const [lastWorkspace, setLastWorkspace] =
    useState<LastWorkspaceNavigation | null>(null);

  useEffect(() => {
    setLastWorkspace(readLastWorkspaceNavigation());
  }, []);

  const settingsItems: SettingsNavItem[] = [
    {
      label: 'General',
      href: '/settings',
      icon: Settings,
      description: 'Account settings and preferences',
    },
    {
      label: 'Profile',
      href: '/settings/profile',
      icon: User,
      description: 'Personal information and preferences',
    },
    {
      label: 'Invites',
      href: '/settings/invites',
      icon: Mail,
      description: 'Pending organization invitations',
    },
    {
      label: 'Notifications',
      href: '/settings/notifications',
      icon: Bell,
      description: 'Notification preferences and push devices',
    },
    {
      label: 'Devices',
      href: '/settings/devices',
      icon: Monitor,
      description: 'Manage connected devices and sessions',
    },
  ];

  const firstOrg = userOrgsQuery.data?.[0];
  const workspace = useMemo<LastWorkspaceNavigation | null>(() => {
    if (lastWorkspace) {
      if (!userOrgsQuery.data) return lastWorkspace;

      const matchingOrg = userOrgsQuery.data.find(
        org => org?.slug === lastWorkspace.slug,
      );
      if (matchingOrg) {
        return {
          name: matchingOrg.name,
          slug: matchingOrg.slug,
        };
      }
    }

    if (!firstOrg) return null;

    return {
      name: firstOrg.name,
      slug: firstOrg.slug,
    };
  }, [firstOrg, lastWorkspace, userOrgsQuery.data]);

  return (
    <>
      {workspace && (
        <div className='p-2'>
          <Link
            href={`/${workspace.slug}/channels`}
            aria-label={`Back to ${workspace.name} workspace`}
            className='bg-background hover:bg-accent/50 focus-visible:ring-ring group flex w-full items-center justify-between rounded-md border p-1 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none'
          >
            <div className='flex min-w-0 flex-1 items-center gap-2'>
              <ChevronLeft className='text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors' />
              <span className='truncate text-sm font-medium'>
                Back to workspace
              </span>
            </div>
            <span className='text-muted-foreground max-w-20 truncate text-xs'>
              {workspace.name}
            </span>
          </Link>
        </div>
      )}

      <nav className='space-y-1 p-2 pt-0'>
        <div className='pb-2'>
          <h2 className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
            User Settings
          </h2>
        </div>

        {settingsItems.map(item => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/settings' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'hover:bg-foreground/5 hover:text-foreground',
                isActive
                  ? 'bg-foreground/5 text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <item.icon className='size-4 shrink-0' />
              <span className='truncate'>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
