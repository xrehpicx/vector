'use client';

import {
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { api, useCachedQuery } from '@/lib/convex';
import type { Id } from '@/convex/_generated/dataModel';
import { UserAvatar } from '@/components/user-avatar';
import { Mail } from 'lucide-react';

type MentionPopoverState = {
  userId: string;
  rect: DOMRect;
} | null;

/**
 * Wraps editor content and intercepts clicks on `.mention-user` links,
 * showing a user profile popover instead of navigating.
 */
export function MentionClickHandler({ children }: { children: ReactNode }) {
  const [popover, setPopover] = useState<MentionPopoverState>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a') as HTMLAnchorElement | null;

    if (!anchor) {
      // Clicked elsewhere — close popover
      setPopover(null);
      return;
    }

    // Mention-user links → show profile popover
    if (anchor.classList.contains('mention-user')) {
      e.preventDefault();
      e.stopPropagation();

      const href = anchor.getAttribute('href') || '';
      const match = href.match(/\/people\/([^#?/]+)/);
      if (!match) return;

      const userId = match[1];
      const rect = anchor.getBoundingClientRect();

      setPopover(prev => (prev?.userId === userId ? null : { userId, rect }));
      return;
    }

    // Regular links → open in new tab
    const href = anchor.getAttribute('href');
    if (href) {
      e.preventDefault();
      e.stopPropagation();
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!popover) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (containerRef.current?.contains(target)) return;
      setPopover(null);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [popover]);

  // Close on scroll
  useEffect(() => {
    if (!popover) return;
    const onScroll = () => setPopover(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [popover]);

  return (
    <div ref={containerRef} onClickCapture={handleClick}>
      {children}
      {popover && (
        <MentionUserPopover
          ref={popoverRef}
          userId={popover.userId}
          anchorRect={popover.rect}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

interface MentionUserPopoverProps {
  userId: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

import { forwardRef } from 'react';

const MentionUserPopover = forwardRef<HTMLDivElement, MentionUserPopoverProps>(
  ({ userId, anchorRect }, ref) => {
    const user = useCachedQuery(api.users.getUser, {
      userId: userId as Id<'users'>,
    });

    // Position below the mention chip
    const top = anchorRect.bottom + 6;
    const left = anchorRect.left + anchorRect.width / 2;

    return (
      <div
        ref={ref}
        className='bg-popover text-popover-foreground ring-foreground/10 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 fixed z-50 w-56 rounded-lg p-3 shadow-md ring-1 duration-100'
        style={{
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translateX(-50%)',
        }}
      >
        {user === undefined ? (
          <div className='flex items-center gap-2.5'>
            <div className='bg-muted size-10 animate-pulse rounded-full' />
            <div className='flex-1 space-y-1.5'>
              <div className='bg-muted h-3.5 w-24 animate-pulse rounded' />
              <div className='bg-muted h-3 w-32 animate-pulse rounded' />
            </div>
          </div>
        ) : user === null ? (
          <p className='text-muted-foreground text-xs'>User not found</p>
        ) : (
          <div className='flex items-center gap-2.5'>
            <UserAvatar
              name={user.name}
              email={user.email}
              image={user.image}
              userId={user._id}
              size='lg'
              className='size-10 flex-shrink-0'
            />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-sm font-medium'>
                {user.name || 'Unknown user'}
              </p>
              {user.email && (
                <p className='text-muted-foreground flex items-center gap-1 truncate text-xs'>
                  <Mail className='size-3 flex-shrink-0' />
                  {user.email}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

MentionUserPopover.displayName = 'MentionUserPopover';
