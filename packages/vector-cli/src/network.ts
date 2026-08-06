import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';

export const FAMILY_ATTEMPT_TIMEOUT_MS = 250;
export const DEFAULT_NETWORK_TIMEOUT_MS = 30_000;

type ErrorWithNetworkContext = Error & {
  address?: unknown;
  code?: unknown;
  errors?: unknown;
  family?: unknown;
  port?: unknown;
  syscall?: unknown;
};

function safeEndpoint(input: RequestInfo | URL): string {
  try {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(raw);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '<unknown endpoint>';
  }
}

function safeMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function safeValue(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  return /^[A-Za-z0-9.:_\-[\]]+$/.test(value) ? value : undefined;
}

function describeNetworkError(error: unknown): string {
  const queue = [error];
  const seen = new Set<unknown>();
  const descriptions: string[] = [];

  while (queue.length > 0 && descriptions.length < 8) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (current instanceof Error) {
      const networkError = current as ErrorWithNetworkContext;
      const fields = [
        safeValue(networkError.code),
        safeValue(networkError.syscall),
        safeValue(networkError.address),
        safeValue(networkError.family),
        safeValue(networkError.port),
      ].filter((value): value is string => Boolean(value));
      const label = [current.name, ...fields].filter(Boolean).join(' ');
      if (!descriptions.includes(label)) descriptions.push(label);

      if (networkError.cause) queue.push(networkError.cause);
      if (Array.isArray(networkError.errors)) {
        queue.push(...networkError.errors);
      }
    }
  }

  return descriptions.join('; ') || 'unknown network error';
}

export class VectorNetworkError extends Error {
  readonly endpoint: string;
  readonly method: string;
  readonly operation: string;
  readonly networkContext: string;

  constructor(options: {
    cause: unknown;
    endpoint: string;
    method: string;
    networkContext?: string;
    operation: string;
  }) {
    const networkContext =
      options.networkContext ?? describeNetworkError(options.cause);
    super(
      `${options.operation} failed (${options.method} ${options.endpoint}): ${networkContext}`,
      { cause: options.cause },
    );
    this.name = 'VectorNetworkError';
    this.endpoint = options.endpoint;
    this.method = options.method;
    this.operation = options.operation;
    this.networkContext = networkContext;
  }
}

export function createVectorDispatcher(options: Agent.Options = {}): Agent {
  return new Agent({
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: FAMILY_ATTEMPT_TIMEOUT_MS,
    ...options,
  });
}

const vectorDispatcher = createVectorDispatcher();

export function isCallerCancellation(
  error: unknown,
  callerSignal: AbortSignal | undefined,
): boolean {
  if (!callerSignal?.aborted) return false;
  const callerReason = callerSignal.reason;
  const callerTimedOut =
    callerReason instanceof DOMException &&
    callerReason.name === 'TimeoutError';
  return !callerTimedOut && error === callerReason;
}

/**
 * Caller cancellations are preserved verbatim, so this may reject with a
 * caller-supplied signal reason that is not an Error.
 */
export async function fetchWithDispatcher(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  operation: string,
  dispatcher: Dispatcher,
  timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS,
): Promise<Response> {
  const endpoint = safeEndpoint(input);
  const method = safeMethod(input, init);
  const inputRequest =
    typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const callerSignal =
    init && 'signal' in init
      ? (init.signal ?? undefined)
      : inputRequest?.signal;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
  const fetchInput = inputRequest ? inputRequest.url : input;
  const effectiveBody =
    init?.body != null
      ? init.body
      : inputRequest?.body
        ? // Buffering preserves Content-Length when adapting a native Request.
          new Uint8Array(await inputRequest.arrayBuffer())
        : undefined;
  const isStreamingBody =
    typeof ReadableStream !== 'undefined' &&
    effectiveBody instanceof ReadableStream;
  const isAsyncIterableBody =
    effectiveBody != null &&
    typeof (effectiveBody as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === 'function';
  const initDuplex = (init as { duplex?: 'half' } | undefined)?.duplex;
  const duplex =
    initDuplex ?? (isStreamingBody || isAsyncIterableBody ? 'half' : undefined);
  const fetchInit = inputRequest
    ? {
        cache: inputRequest.cache,
        credentials: inputRequest.credentials,
        headers: inputRequest.headers,
        integrity: inputRequest.integrity,
        keepalive: inputRequest.keepalive,
        method: inputRequest.method,
        mode: inputRequest.mode,
        referrer: inputRequest.referrer,
        referrerPolicy: inputRequest.referrerPolicy,
        redirect: inputRequest.redirect,
        ...init,
        body: effectiveBody,
        duplex,
        signal,
      }
    : { ...init, signal };

  try {
    return (await undiciFetch(fetchInput as Parameters<typeof undiciFetch>[0], {
      ...(fetchInit as Parameters<typeof undiciFetch>[1]),
      dispatcher,
    })) as unknown as Response;
  } catch (error) {
    if (isCallerCancellation(error, callerSignal)) throw error;
    throw new VectorNetworkError({
      cause: error,
      endpoint,
      method,
      operation,
    });
  }
}

export async function vectorFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  operation = 'HTTP request',
): Promise<Response> {
  return await fetchWithDispatcher(input, init, operation, vectorDispatcher);
}

export function annotateNetworkError(
  error: unknown,
  operation: string,
  endpoint?: string,
): unknown {
  if (!(error instanceof VectorNetworkError)) return error;
  return new VectorNetworkError({
    cause: error.cause,
    endpoint: endpoint ? safeEndpoint(endpoint) : error.endpoint,
    method: error.method,
    networkContext: error.networkContext,
    operation,
  });
}
