import { ConvexReactClient } from 'convex/react';

import { runtime } from './runtime';

export const convex = new ConvexReactClient(runtime.convexUrl, {
  expectAuth: true,
  unsavedChangesWarning: false,
});
