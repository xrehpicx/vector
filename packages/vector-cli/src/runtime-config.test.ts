import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./network', () => ({
  vectorFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    globalThis.fetch(input, init),
}));

import {
  APP_CONFIG_CACHE_TTL_MS,
  APP_CONFIG_FETCH_TIMEOUT_MS,
  LOCAL_CONVEX_URL,
  fetchAppConfig,
  resolveConvexRuntime,
} from './runtime-config';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAppConfig', () => {
  it('normalizes a successful app config response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          convexUrl: '  https://cloud.example.com  ',
          tunnelHost: '  tunnel.example.com  ',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAppConfig('https://app.example.com')).resolves.toEqual({
      convexUrl: 'https://cloud.example.com',
      tunnelHost: 'tunnel.example.com',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.com/api/config',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(APP_CONFIG_FETCH_TIMEOUT_MS).toBe(5_000);
  });

  it.each([
    [
      'a non-OK response',
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    ],
    [
      'malformed JSON',
      vi.fn().mockResolvedValue(new Response('{', { status: 200 })),
    ],
    ['a network failure', vi.fn().mockRejectedValue(new Error('offline'))],
  ])('returns an empty config for %s', async (_label, fetchMock) => {
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAppConfig('https://app.example.com')).resolves.toEqual(
      {},
    );
  });
});

describe('resolveConvexRuntime', () => {
  it('refreshes a legacy cached deployment from app config', async () => {
    const fetchConfig = vi.fn().mockResolvedValue({
      convexUrl: 'https://cloud.example.com',
    });

    await expect(
      resolveConvexRuntime({
        appUrl: 'https://app.example.com',
        explicitAppUrl: false,
        cachedConvexUrl: 'https://old-deployment.convex.cloud',
        now: 10_000,
        fetchConfig,
      }),
    ).resolves.toEqual({
      convexUrl: 'https://cloud.example.com',
      source: 'app_config',
      appConfigFetchedAt: 10_000,
    });
    expect(fetchConfig).toHaveBeenCalledOnce();
  });

  it('uses a recent app-config result without refetching', async () => {
    const fetchConfig = vi.fn();

    await expect(
      resolveConvexRuntime({
        appUrl: 'https://app.example.com',
        explicitAppUrl: false,
        cachedConvexUrl: 'https://cloud.example.com',
        appConfigFetchedAt: 10_000,
        now: 10_000 + APP_CONFIG_CACHE_TTL_MS - 1,
        fetchConfig,
      }),
    ).resolves.toEqual({
      convexUrl: 'https://cloud.example.com',
      source: 'session',
    });
    expect(fetchConfig).not.toHaveBeenCalled();
  });

  it('falls back to a stale cached deployment while offline', async () => {
    await expect(
      resolveConvexRuntime({
        appUrl: 'https://app.example.com',
        explicitAppUrl: false,
        cachedConvexUrl: 'https://cached.convex.cloud',
        appConfigFetchedAt: 1,
        now: APP_CONFIG_CACHE_TTL_MS + 2,
        fetchConfig: vi.fn().mockResolvedValue({}),
      }),
    ).resolves.toEqual({
      convexUrl: 'https://cached.convex.cloud',
      source: 'session',
    });
  });

  it('does not pair an explicit app URL with another profile cache', async () => {
    await expect(
      resolveConvexRuntime({
        appUrl: 'https://another.example.com',
        explicitAppUrl: true,
        cachedConvexUrl: 'https://wrong.convex.cloud',
        appConfigFetchedAt: Date.now(),
        fetchConfig: vi.fn().mockResolvedValue({}),
      }),
    ).resolves.toEqual({ convexUrl: LOCAL_CONVEX_URL, source: 'local' });
  });

  it('always honors an explicit Convex URL', async () => {
    const fetchConfig = vi.fn();

    await expect(
      resolveConvexRuntime({
        appUrl: 'https://app.example.com',
        explicitAppUrl: false,
        explicitConvexUrl: 'https://override.convex.cloud',
        cachedConvexUrl: 'https://cached.convex.cloud',
        fetchConfig,
      }),
    ).resolves.toEqual({
      convexUrl: 'https://override.convex.cloud',
      source: 'explicit',
    });
    expect(fetchConfig).not.toHaveBeenCalled();
  });

  it('uses the environment fallback when discovery and cache are unavailable', async () => {
    await expect(
      resolveConvexRuntime({
        appUrl: 'https://app.example.com',
        explicitAppUrl: false,
        environmentConvexUrl: 'https://environment.convex.cloud',
        fetchConfig: vi.fn().mockResolvedValue({}),
      }),
    ).resolves.toEqual({
      convexUrl: 'https://environment.convex.cloud',
      source: 'environment',
    });
  });
});
