import { afterEach, describe, expect, it, vi } from 'vitest';

import { discoverServer, normalizeServerUrl } from './server';

afterEach(() => vi.unstubAllGlobals());

describe('Vector server discovery', () => {
  it('defaults domains to HTTPS and removes paths', () => {
    expect(normalizeServerUrl(' imai.tech/workspace?from=mobile ')).toBe(
      'https://imai.tech',
    );
  });

  it('allows HTTP only for loopback development', () => {
    expect(normalizeServerUrl('localhost:4200')).toBe('http://localhost:4200');
    expect(() => normalizeServerUrl('http://example.com')).toThrow('HTTPS');
  });

  it('discovers the canonical app origin and Convex deployment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          convexSiteUrl: 'https://auth.imai.tech',
          convexUrl: 'https://cloud.imai.tech',
        }),
        ok: true,
        status: 200,
        url: 'https://www.imai.tech/api/config',
      }),
    );

    await expect(discoverServer('imai.tech')).resolves.toEqual({
      appUrl: 'https://www.imai.tech',
      authUrl: 'https://auth.imai.tech',
      convexUrl: 'https://cloud.imai.tech',
      displayUrl: 'https://imai.tech',
    });
  });
});
