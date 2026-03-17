import { api } from '../../convex/_generated/api';

// Re-export the API for convenience
export { api };

// Export richer useQuery from convex-helpers for better status states
export { useQuery } from 'convex-helpers/react';

// Export standard hooks for mutations, actions, and preloaded queries
export { useAction, useMutation, usePreloadedQuery } from 'convex/react';
