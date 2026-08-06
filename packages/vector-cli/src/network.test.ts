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
  isCallerCancellation,
} from './network';

describe('CLI network transport', () => {
  let server: Server | undefined;
  const dispatchers: Dispatcher[] = [];

  afterEach(async () => {
    try {
      await Promise.all(dispatchers.map(dispatcher => dispatcher.destroy()));
    } finally {
      dispatchers.length = 0;
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
          server!.close(error => (error ? reject(error) : resolve()));
        });
        server = undefined;
      }
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
      'http://127.0.0.1:1/cancelled',
      { signal: controller.signal },
      'cancelled request',
      dispatcher,
    ).catch(caught => caught);

    expect(error).not.toBeInstanceOf(VectorNetworkError);
    expect(error).toBe(reason);
  });

  it('preserves a caller-defined cancellation reason', async () => {
    const controller = new AbortController();
    const reason = 'shutting down';
    controller.abort(reason);
    const dispatcher = createVectorDispatcher();
    dispatchers.push(dispatcher);

    const error = await fetchWithDispatcher(
      'http://127.0.0.1:1/cancelled',
      { signal: controller.signal },
      'cancelled request',
      dispatcher,
    ).catch(caught => caught);

    expect(error).not.toBeInstanceOf(VectorNetworkError);
    expect(error).toBe(reason);
  });

  it('recognizes a falsy caller-defined cancellation reason', async () => {
    const controller = new AbortController();
    controller.abort('');
    const dispatcher = createVectorDispatcher();
    dispatchers.push(dispatcher);

    const error = await fetchWithDispatcher(
      'http://127.0.0.1:1/cancelled',
      { signal: controller.signal },
      'cancelled request',
      dispatcher,
    ).catch(caught => caught);

    expect(error).not.toBeInstanceOf(VectorNetworkError);
    expect(error).toBe('');
  });

  it('honors a cancellation signal carried by a Request', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelled request', 'AbortError');
    controller.abort(reason);
    const request = new Request('http://127.0.0.1:1/cancelled', {
      signal: controller.signal,
    });
    const dispatcher = createVectorDispatcher();
    dispatchers.push(dispatcher);

    const error = await fetchWithDispatcher(
      request,
      undefined,
      'cancelled request',
      dispatcher,
    ).catch(caught => caught);

    expect(error).not.toBeInstanceOf(VectorNetworkError);
    expect(error).toBe(reason);
  });

  it('preserves a Request body when adapting it for Undici', async () => {
    let receivedBody = '';
    let receivedContentLength: string | undefined;
    server = createServer((request, response) => {
      receivedContentLength = request.headers['content-length'];
      request.setEncoding('utf8');
      request.on('data', chunk => {
        receivedBody += chunk;
      });
      request.on('end', () => {
        response.writeHead(200);
        response.end();
      });
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
    const request = new Request(`http://127.0.0.1:${address.port}/document`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Network diagnostic' }),
    });

    const response = await fetchWithDispatcher(
      request,
      { body: undefined },
      'create document',
      dispatcher,
    );

    expect(response.status).toBe(200);
    expect(receivedBody).toBe('{"title":"Network diagnostic"}');
    expect(receivedContentLength).toBe(
      String(Buffer.byteLength('{"title":"Network diagnostic"}')),
    );
  });

  it('uses init streaming bodies with Request and URL inputs', async () => {
    let receivedBody = '';
    server = createServer((request, response) => {
      request.setEncoding('utf8');
      request.on('data', chunk => {
        receivedBody += chunk;
      });
      request.on('end', () => {
        response.writeHead(200);
        response.end();
      });
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
    const request = new Request(`http://127.0.0.1:${address.port}/document`, {
      method: 'POST',
      body: 'original body',
    });
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('override body'));
        controller.close();
      },
    });

    const response = await fetchWithDispatcher(
      request,
      { method: 'POST', body },
      'create document',
      dispatcher,
    );

    expect(response.status).toBe(200);
    expect(receivedBody).toBe('override body');
    expect(request.bodyUsed).toBe(false);

    receivedBody = '';
    const asyncBody = (async function* () {
      yield new TextEncoder().encode('async iterable body');
    })() as unknown as BodyInit;
    const asyncResponse = await fetchWithDispatcher(
      `http://127.0.0.1:${address.port}/document`,
      { method: 'POST', body: asyncBody },
      'create document',
      dispatcher,
    );

    expect(asyncResponse.status).toBe(200);
    expect(receivedBody).toBe('async iterable body');
  });

  it('classifies cancellation by exact reason identity', async () => {
    const caller = new AbortController();
    const callerReason = new DOMException('cancelled', 'AbortError');
    caller.abort(callerReason);

    expect(isCallerCancellation(callerReason, caller.signal)).toBe(true);
    expect(isCallerCancellation(new Error('socket reset'), caller.signal)).toBe(
      false,
    );

    const timeout = AbortSignal.timeout(1);
    await new Promise<void>(resolve => {
      timeout.addEventListener('abort', () => resolve(), { once: true });
    });
    expect(isCallerCancellation(timeout.reason, timeout)).toBe(false);
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

  it('reports a caller timeout as a contextual network failure', async () => {
    server = createServer(() => {
      // Keep the request open until the caller timeout expires.
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
      `http://127.0.0.1:${address.port}/caller-timeout`,
      { signal: AbortSignal.timeout(20) },
      'runtime config request',
      dispatcher,
    ).catch(caught => caught);

    expect(error).toBeInstanceOf(VectorNetworkError);
    expect(error.message).toContain('runtime config request failed');
    expect(error.message).toContain('TimeoutError');
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
