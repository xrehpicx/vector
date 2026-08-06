import { createServer, type Server } from 'node:http';
import type { LookupFunction } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { Dispatcher } from 'undici';
import {
  FAMILY_ATTEMPT_TIMEOUT_MS,
  DEFAULT_NETWORK_TIMEOUT_MS,
  VectorNetworkError,
  annotateNetworkError,
  createVectorDispatcher,
  fetchWithDispatcher,
} from './network';

describe('CLI network transport', () => {
  let server: Server | undefined;
  const dispatchers: Dispatcher[] = [];

  afterEach(async () => {
    await Promise.all(dispatchers.map(dispatcher => dispatcher.close()));
    dispatchers.length = 0;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close(error => (error ? reject(error) : resolve()));
      });
      server = undefined;
    }
  });

  it('falls back from an unusable IPv6 result to IPv4', async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
    await new Promise<void>((resolve, reject) => {
      server!.listen(0, '127.0.0.1', () => resolve());
      server!.once('error', reject);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not expose a TCP port');
    }

    const lookup: LookupFunction = (_hostname, options, callback) => {
      if (typeof options === 'object' && options.all) {
        callback(null, [
          { address: '::1', family: 6 },
          { address: '127.0.0.1', family: 4 },
        ]);
        return;
      }
      callback(null, '::1', 6);
    };
    const dispatcher = createVectorDispatcher({ connect: { lookup } });
    dispatchers.push(dispatcher);

    const startedAt = Date.now();
    const response = await fetchWithDispatcher(
      `http://dual-stack.vector.test:${address.port}/health`,
      undefined,
      'network fallback test',
      dispatcher,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(FAMILY_ATTEMPT_TIMEOUT_MS).toBe(250);
    expect(DEFAULT_NETWORK_TIMEOUT_MS).toBe(30_000);
  });

  it('bounds a request that accepts a connection but never responds', async () => {
    server = createServer(() => {
      // Intentionally leave the response open to simulate a stalled route.
    });
    await new Promise<void>((resolve, reject) => {
      server!.listen(0, '127.0.0.1', () => resolve());
      server!.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not expose a TCP port');
    }
    const dispatcher = createVectorDispatcher();
    dispatchers.push(dispatcher);

    const error = await fetchWithDispatcher(
      `http://127.0.0.1:${address.port}/stalled`,
      undefined,
      'poll bridge commands',
      dispatcher,
      50,
    ).catch(caught => caught);

    expect(error).toBeInstanceOf(VectorNetworkError);
    expect(error.message).toContain('poll bridge commands failed');
    expect(error.message).toContain('TimeoutError');
  });

  it('preserves caller cancellation instead of reporting a network outage', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelled', 'AbortError');
    controller.abort(reason);
    const dispatcher = createVectorDispatcher();
    dispatchers.push(dispatcher);

    const error = await fetchWithDispatcher(
      'https://example.com/cancelled',
      { signal: controller.signal },
      'cancelled request',
      dispatcher,
    ).catch(caught => caught);

    expect(error).not.toBeInstanceOf(VectorNetworkError);
    expect(error).toBe(reason);
  });

  it('preserves cancellation while a request is in flight', async () => {
    server = createServer(() => {
      // Keep the request open until the caller aborts it.
    });
    await new Promise<void>((resolve, reject) => {
      server!.listen(0, '127.0.0.1', () => resolve());
      server!.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not expose a TCP port');
    }
    const dispatcher = createVectorDispatcher();
    dispatchers.push(dispatcher);
    const controller = new AbortController();
    const reason = new DOMException('cancelled in flight', 'AbortError');
    setTimeout(() => controller.abort(reason), 20);

    const error = await fetchWithDispatcher(
      `http://127.0.0.1:${address.port}/cancelled`,
      { signal: controller.signal },
      'cancelled request',
      dispatcher,
    ).catch(caught => caught);

    expect(error).not.toBeInstanceOf(VectorNetworkError);
    expect(error).toBe(reason);
  });

  it('reports safe operation, endpoint, and network context', async () => {
    const dispatcher = {
      dispatch() {
        throw Object.assign(new Error('socket failed'), {
          address: '203.0.113.4',
          code: 'ECONNRESET',
          port: 443,
          syscall: 'connect',
        });
      },
    } as unknown as Dispatcher;

    const error = await fetchWithDispatcher(
      'https://api.example.com/v1/documents?access_token=do-not-print#private',
      { method: 'POST', body: 'secret request body' },
      'create document',
      dispatcher,
    ).catch(caught => caught);

    expect(error).toBeInstanceOf(VectorNetworkError);
    expect(error.message).toContain(
      'create document failed (POST https://api.example.com/v1/documents)',
    );
    expect(error.message).toContain('ECONNRESET');
    expect(error.message).not.toContain('access_token');
    expect(error.message).not.toContain('do-not-print');
    expect(error.message).not.toContain('secret request body');
  });

  it('adds the Convex operation without losing network details', () => {
    const original = new VectorNetworkError({
      cause: Object.assign(new Error('failed'), { code: 'ENETUNREACH' }),
      endpoint: 'https://cloud.example.com/api/query',
      method: 'POST',
      operation: 'HTTP request',
    });

    const annotated = annotateNetworkError(
      original,
      'Convex query search/queries:searchEntities',
    );

    expect(annotated).toBeInstanceOf(VectorNetworkError);
    expect((annotated as Error).message).toBe(
      'Convex query search/queries:searchEntities failed (POST https://cloud.example.com/api/query): Error ENETUNREACH',
    );
  });
});
