import { expoClient } from '@better-auth/expo/client';
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';
import type { BetterAuthClientPlugin } from 'better-auth';
import * as SecureStore from 'expo-secure-store';

import { runtime } from './runtime';

export const authClient = createAuthClient({
  baseURL: runtime.convexSiteUrl,
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
