'use client';

import { cn } from '@/lib/utils';

/**
 * Auth page wrapper — subtle background + centered card container.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative flex min-h-dvh items-center justify-center px-4 py-12'>
      {/* Subtle radial glow behind center */}
      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,_rgba(68,218,255,0.04)_0%,_transparent_60%)] dark:bg-[radial-gradient(ellipse_at_50%_40%,_rgba(68,218,255,0.06)_0%,_transparent_60%)]' />

      <div className='relative w-full max-w-[400px]'>{children}</div>
    </div>
  );
}

/**
 * Logo lockup — icon + "Vector" text, used at top of auth cards.
 */
export function AuthLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2.5', className)}>
      {/* Black mark for light mode, white mark for dark mode */}
      <img
        src='/icons/vector-mark-black.svg'
        alt='Vector'
        className='size-9 dark:hidden'
      />
      <img
        src='/icons/vector-mark-white.svg'
        alt='Vector'
        className='hidden size-9 dark:block'
      />
      <span className='font-title text-foreground text-xl font-semibold tracking-tight'>
        Vector
      </span>
    </div>
  );
}
