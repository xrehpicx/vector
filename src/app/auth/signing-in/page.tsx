'use client';

import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';

function SigningInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userQuery = useQuery(api.users.currentUser);

  useEffect(() => {
    // Wait until the Convex session is established and the user record exists.
    // Without this, the root page may see user === null and bounce to /auth/login.
    if (userQuery.isPending || userQuery.data === null) return;

    const redirectTo = searchParams.get('redirectTo') || '/';
    router.push(redirectTo);
  }, [router, searchParams, userQuery.isPending, userQuery.data]);

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
