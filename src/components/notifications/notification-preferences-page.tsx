'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Bell, Laptop, Send, Smartphone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/convex';
import {
  isPushSupported,
  subscribeCurrentBrowserToPush,
  unsubscribeCurrentBrowserPush,
} from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  updateNotificationPreference,
  updateQuery,
} from '@/lib/optimistic-updates';

type Preferences = NonNullable<
  ReturnType<typeof useQuery<typeof api.notifications.queries.getPreferences>>
>;

const channelConfig = [
  { key: 'inAppEnabled', label: 'In-app', icon: Bell },
  { key: 'emailEnabled', label: 'Email', icon: Send },
  { key: 'pushEnabled', label: 'Push', icon: Smartphone },
] as const;

const categoryLabels: Record<string, { title: string; description: string }> = {
  invites: {
    title: 'Invitations',
    description: 'Organization invites and membership prompts.',
  },
  assignments: {
    title: 'Assignments',
    description: 'New issue assignments and direct reassignments.',
  },
  mentions: {
    title: 'Mentions',
    description: 'Comments that explicitly call you into the conversation.',
  },
  comments: {
    title: 'Comments',
    description: 'New comments on work already assigned to you.',
  },
};

export function NotificationPreferencesPage() {
  const preferences = useQuery(api.notifications.queries.getPreferences);
  const subscriptions = useQuery(
    api.notifications.queries.listPushSubscriptions,
  );
  const updatePreferences = useMutation(
    api.notifications.mutations.updatePreferences,
  ).withOptimisticUpdate((store, args) => {
    updateQuery(store, api.notifications.queries.getPreferences, {}, current =>
      updateNotificationPreference(current, args.category, preference => ({
        ...preference,
        inAppEnabled: args.inAppEnabled,
        emailEnabled: args.emailEnabled,
        pushEnabled: args.pushEnabled,
      })),
    );
  });
  const upsertPushSubscription = useMutation(
    api.notifications.mutations.upsertPushSubscription,
  );
  const removePushSubscription = useMutation(
    api.notifications.mutations.removePushSubscription,
  );
  const displayPreferences = preferences ?? [];
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported');
  const [isSyncingPush, setIsSyncingPush] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setPermission('unsupported');
      return;
    }

    setPermission(Notification.permission);
  }, []);

  const activeSubscriptions = useMemo(
    () => subscriptions?.filter(subscription => !subscription.disabledAt) ?? [],
    [subscriptions],
  );

  const handleToggle = async (
    category: Preferences[number]['category'],
    key: (typeof channelConfig)[number]['key'],
  ) => {
    const nextPreferences = displayPreferences.map(preference =>
      preference.category === category
        ? {
            ...preference,
            [key]: !preference[key],
          }
        : preference,
    );

    const next = nextPreferences.find(
      preference => preference.category === category,
    );
    if (!next) {
      return;
    }

    try {
      await updatePreferences({
        category,
        inAppEnabled: next.inAppEnabled,
        emailEnabled: next.emailEnabled,
        pushEnabled: next.pushEnabled,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update preference',
      );
    }
  };

  const handleEnablePush = async () => {
    try {
      setIsSyncingPush(true);
      const subscription = await subscribeCurrentBrowserToPush();
      await upsertPushSubscription({
        ...subscription,
        deviceLabel: 'Current browser',
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      setPermission(Notification.permission);
      toast.success('Push notifications enabled for this browser.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to enable push',
      );
    } finally {
      setIsSyncingPush(false);
    }
  };

  const handleDisablePush = async () => {
    try {
      setIsSyncingPush(true);
      const endpoint = await unsubscribeCurrentBrowserPush();
      const current = activeSubscriptions.find(
        subscription => subscription.endpoint === endpoint,
      );
      if (current) {
        await removePushSubscription({ subscriptionId: current._id });
      }
      toast.success('Push notifications disabled for this browser.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to disable push',
      );
    } finally {
      setIsSyncingPush(false);
    }
  };

  if (preferences === undefined || subscriptions === undefined) {
    return (
      <div className='bg-background h-full'>
        <div className='border-b'>
          <div className='flex items-center gap-1.5 p-1 pl-8 lg:pl-1'>
            <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
              <Bell className='size-3.5' />
              Notifications
            </span>
          </div>
        </div>
        <div className='space-y-6 p-3'>
          <div className='space-y-2'>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className='flex items-center gap-3 rounded-md border px-3 py-2.5'
              >
                <div className='min-w-0 flex-1 space-y-1'>
                  <Skeleton className='h-4 w-32' />
                  <Skeleton className='h-3 w-64' />
                </div>
                <div className='flex gap-1'>
                  {Array.from({ length: 3 }).map((__, channelIndex) => (
                    <Skeleton
                      key={channelIndex}
                      className='h-7 w-20 rounded-md'
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Skeleton className='h-36 rounded-lg' />
        </div>
      </div>
    );
  }

  return (
    <div className='bg-background h-full'>
      <div className='border-b'>
        <div className='flex items-center gap-1.5 p-1 pl-8 lg:pl-1'>
          <span className='flex items-center gap-1.5 px-3 text-xs font-medium'>
            <Bell className='size-3.5' />
            Notifications
          </span>
        </div>
      </div>

      <div className='space-y-6 p-3'>
        <section className='space-y-2'>
          <div className='px-1'>
            <p className='text-sm font-medium'>Notification matrix</p>
            <p className='text-muted-foreground text-xs'>
              Channel changes apply instantly and stay inline with the rest of
              Vector&apos;s dense controls.
            </p>
          </div>

          <div className='space-y-2'>
            {displayPreferences.map(preference => (
              <div
                key={preference.category}
                className='flex flex-col gap-3 rounded-md border px-3 py-2.5 sm:flex-row sm:items-center'
              >
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-medium'>
                    {categoryLabels[preference.category]?.title ??
                      preference.category}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    {categoryLabels[preference.category]?.description}
                  </p>
                </div>
                <div className='flex flex-wrap gap-1'>
                  {channelConfig.map(channel => {
                    const Icon = channel.icon;
                    const enabled = preference[channel.key];
                    return (
                      <Button
                        key={channel.key}
                        variant={enabled ? 'secondary' : 'outline'}
                        size='sm'
                        className={cn('h-7', enabled && 'shadow-sm')}
                        onClick={() =>
                          void handleToggle(preference.category, channel.key)
                        }
                      >
                        <Icon className='size-3.5' />
                        {channel.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className='space-y-2 rounded-md border p-3'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='flex items-center gap-1.5 text-sm font-medium'>
                <Sparkles className='size-3.5' />
                Push on this device
              </p>
              <p className='text-muted-foreground mt-1 text-xs'>
                Browser permission: {permission}
              </p>
              <p className='text-muted-foreground text-xs'>
                Active subscriptions: {activeSubscriptions.length}
              </p>
            </div>
            <div className='flex gap-1'>
              <Button
                size='sm'
                className='h-7'
                disabled={isSyncingPush || !isPushSupported()}
                onClick={() => void handleEnablePush()}
              >
                Enable push
              </Button>
              <Button
                size='sm'
                variant='outline'
                className='h-7'
                disabled={isSyncingPush || activeSubscriptions.length === 0}
                onClick={() => void handleDisablePush()}
              >
                Disable
              </Button>
            </div>
          </div>

          <div className='divide-y rounded-md border'>
            {activeSubscriptions.length === 0 ? (
              <div className='text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs'>
                <Laptop className='size-3.5' />
                No active push-enabled browsers yet.
              </div>
            ) : (
              activeSubscriptions.map(subscription => (
                <div
                  key={subscription._id}
                  className='flex items-center justify-between gap-3 px-3 py-2'
                >
                  <div className='min-w-0'>
                    <p className='text-sm font-medium'>
                      {subscription.deviceLabel ?? 'Browser subscription'}
                    </p>
                    <p className='text-muted-foreground truncate text-xs'>
                      {subscription.userAgent ?? subscription.endpoint}
                    </p>
                  </div>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7'
                    onClick={() =>
                      void removePushSubscription({
                        subscriptionId: subscription._id,
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
