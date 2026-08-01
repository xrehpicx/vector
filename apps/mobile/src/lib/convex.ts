import { ConvexReactClient } from 'convex/react';

export function createVectorConvexClient(convexUrl: string) {
  return new ConvexReactClient(convexUrl, {
    expectAuth: true,
    unsavedChangesWarning: false,
  });
}
