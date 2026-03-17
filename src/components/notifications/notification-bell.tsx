'use client';

import { useState } from 'react';
import { api, useCachedQuery } from '@/lib/convex';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NotificationsSheet } from './notifications-sheet';

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const unreadCount = useCachedQuery(api.notifications.queries.unreadCount);
  const count = unreadCount ?? 0;

  return (
    <>
      <Button
        variant='outline'
        size='icon-sm'
        className={cn('relative', className)}
        onClick={() => setOpen(true)}
        aria-label='Open notifications'
      >
        <Bell className='size-4' />
        {count > 0 ? (
          <span className='bg-primary text-primary-foreground absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-medium'>
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </Button>
      <NotificationsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
