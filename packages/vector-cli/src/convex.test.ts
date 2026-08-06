import { makeFunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';
import { describe, expect, it, vi } from 'vitest';
import { createUnauthenticatedConvexClient, runQuery } from './convex';
import { VectorNetworkError } from './network';

describe('Convex CLI error annotation', () => {
  it('preserves backend ConvexError identity and data', async () => {
    const client = createUnauthenticatedConvexClient(
      'https://cloud.example.com',
    );
    const backendError = new ConvexError('PERMISSION_DENIED');
    vi.spyOn(client, 'query').mockRejectedValueOnce(backendError);

    const error = await runQuery(
      client,
      makeFunctionReference<'query'>('test:query'),
      {},
    ).catch(caught => caught);

    expect(error).toBe(backendError);
    expect(error).toBeInstanceOf(ConvexError);
    expect(error.data).toBe('PERMISSION_DENIED');
  });

  it('does not let a malformed function reference mask a network failure', async () => {
    const client = createUnauthenticatedConvexClient(
      'https://cloud.example.com',
    );
    const networkError = new VectorNetworkError({
      cause: Object.assign(new Error('unreachable'), { code: 'ENETUNREACH' }),
      endpoint: 'https://cloud.example.com/api/query',
      method: 'POST',
      operation: 'HTTP request',
    });
    vi.spyOn(client, 'query').mockRejectedValueOnce(networkError);

    const error = await runQuery(client, {} as never, {}).catch(
      caught => caught,
    );

    expect(error).toBeInstanceOf(VectorNetworkError);
    expect(error.message).toContain('Convex query unknown function failed');
    expect(error.message).toContain('ENETUNREACH');
  });
});
