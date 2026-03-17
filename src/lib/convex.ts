import { api } from '../../convex/_generated/api';
import { makeUseQueryWithStatus } from 'convex-helpers/react';
import {
  useQueries as useCachedQueries,
  useQuery as useCachedQuery,
  usePaginatedQuery as useCachedPaginatedQuery,
} from 'convex-helpers/react/cache';

// Re-export the API for convenience
export { api };

// Preserve the richer status-object hook shape while backing it with the client cache.
export const useQuery = makeUseQueryWithStatus(useCachedQueries);
export { useCachedQuery, useCachedPaginatedQuery };

// Export standard hooks for mutations, actions, and preloaded queries
export { useAction, useMutation, usePreloadedQuery } from 'convex/react';
