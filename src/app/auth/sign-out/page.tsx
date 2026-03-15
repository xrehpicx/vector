'use client';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { Loader2, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type SignOutState = 'pending' | 'error';

export default function SignOutPage() {
  const router = useRouter();
  const [state, setState] = useState<SignOutState>('pending');

  const attemptSignOut = useCallback(
    async (showPendingState = true) => {
      if (showPendingState) {
        setState('pending');
      }

      try {
        await authClient.signOut();
        router.push('/auth/login');
        setTimeout(() => router.refresh(), 100);
      } catch (error) {
        console.error('Failed to sign out', error);
        setState('error');
      }
    },
    [router],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void attemptSignOut(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [attemptSignOut]);

  return (
    <div className='flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center'>
      {state === 'pending' ? (
        <>
          <div className='flex items-center gap-2 text-sm font-medium'>
            <Loader2 className='text-muted-foreground h-4 w-4 animate-spin' />
            <span>Signing you out</span>
          </div>
          <p className='text-muted-foreground text-xs'>
            Ending your session securely.
          </p>
        </>
      ) : (
        <>
          <div className='text-destructive flex items-center gap-2 text-sm font-medium'>
            <LogOut className='h-4 w-4' />
            <span>Could not sign you out</span>
          </div>
          <p className='text-muted-foreground text-xs'>
            Something went wrong. Please try again.
          </p>
          <div className='flex gap-2'>
            <Button size='sm' onClick={() => void attemptSignOut()}>
              Try again
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => router.replace('/')}
            >
              Go back
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
