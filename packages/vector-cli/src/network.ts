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

export async function fetchWithDispatcher(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  operation: string,
  dispatcher: Dispatcher,
  timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS,
): Promise<Response> {
  const endpoint = safeEndpoint(input);
  const method = safeMethod(input, init);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  try {
    return (await undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher,
      signal,
    })) as unknown as Response;
  } catch (error) {
    if (init?.signal?.aborted) throw error;
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
