'use client';

import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache';
import { ConvexReactClient } from 'convex/react';
import { ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexAuthProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      <ConvexQueryCacheProvider expiration={300_000} maxIdleEntries={300}>
        {children}
      </ConvexQueryCacheProvider>
    </ConvexBetterAuthProvider>
  );
}
