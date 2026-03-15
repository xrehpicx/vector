'use client';

import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function SigningInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const redirectTo = searchParams.get('redirectTo');

    if (redirectTo) {
      router.push(redirectTo);
      return;
    }

    // Default: redirect to root (which resolves to org)
    router.push('/');
  }, [router, searchParams]);

  return (
    <div className='flex min-h-dvh flex-col items-center justify-center gap-2 text-center'>
      <div className='flex items-center gap-2 text-sm font-medium'>
        <Loader2 className='text-muted-foreground h-4 w-4 animate-spin' />
        <span>Logging you in</span>
      </div>
      <p className='text-muted-foreground text-xs'>
        Hang tight while we set up your session.
      </p>
    </div>
  );
}

function SigningInFallback() {
  return (
    <div className='flex min-h-dvh flex-col items-center justify-center gap-2 text-center'>
      <div className='flex items-center gap-2 text-sm font-medium'>
        <Loader2 className='text-muted-foreground h-4 w-4 animate-spin' />
        <span>Logging you in</span>
      </div>
      <p className='text-muted-foreground text-xs'>
        Hang tight while we set up your session.
      </p>
    </div>
  );
}

export default function SigningInPage() {
  return (
    <Suspense fallback={<SigningInFallback />}>
      <SigningInContent />
    </Suspense>
  );
}
