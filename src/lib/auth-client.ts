'use client';

import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import {
  usernameClient,
  emailOTPClient,
  deviceAuthorizationClient,
} from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    emailOTPClient(),
    deviceAuthorizationClient(),
    convexClient(),
  ],
});
