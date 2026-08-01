import { expoClient } from '@better-auth/expo/client';
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';
import type { BetterAuthClientPlugin } from 'better-auth';
import * as SecureStore from 'expo-secure-store';

export function createVectorAuthClient(appUrl: string) {
  return createAuthClient({
    baseURL: appUrl,
    plugins: [
      expoClient({
        scheme: 'vector',
        storagePrefix: 'vector',
        storage: SecureStore,
      }) as BetterAuthClientPlugin,
      usernameClient(),
      convexClient(),
    ],
  });
}

export type VectorAuthClient = ReturnType<typeof createVectorAuthClient>;
