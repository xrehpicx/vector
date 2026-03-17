'use client';

import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Lazy-load WebGL component — renders nothing on server
const Grainient = dynamic(
  () =>
    import('@/components/ui/grainient').then(m => ({ default: m.Grainient })),
  { ssr: false },
);

/**
 * Auth page wrapper — Grainient animated background + centered card container.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative flex min-h-dvh items-center justify-center px-4 py-12'>
      {/* Light mode background */}
      <div className='pointer-events-none absolute inset-0 overflow-hidden dark:hidden'>
        <Grainient
          color1='#c4b5fd'
          color2='#e0e7ff'
          color3='#a5f3fc'
          timeSpeed={0.15}
          grainAmount={0.1}
          contrast={1.4}
          saturation={1.0}
          warpAmplitude={60}
          warpSpeed={1.0}
        />
      </div>
      {/* Dark mode background */}
      <div className='pointer-events-none absolute inset-0 hidden overflow-hidden dark:block'>
        <Grainient
          color1='#1e1b4b'
          color2='#0f172a'
          color3='#164e63'
          timeSpeed={0.15}
          grainAmount={0.12}
          contrast={1.4}
          saturation={0.8}
          warpAmplitude={60}
          warpSpeed={1.0}
        />
      </div>

      <div className='relative w-full max-w-[400px]'>{children}</div>
    </div>
  );
}

/**
 * Logo lockup — mark + "Vector" text, used at top of auth cards.
 * Switches between black/white mark based on theme.
 */
export function AuthLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-1.5', className)}>
      <img
        src='/icons/vector-mark-black.svg'
        alt='Vector'
        className='size-5 dark:hidden'
      />
      <img
        src='/icons/vector-mark-white.svg'
        alt='Vector'
        className='hidden size-5 dark:block'
      />
      <span className='font-title text-foreground text-lg font-semibold tracking-tight'>
        Vector
      </span>
    </div>
  );
}
