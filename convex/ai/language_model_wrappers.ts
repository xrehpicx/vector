type ProviderMetadata = Record<string, unknown> | undefined;

type NormalizedProviderMetadata = Record<string, unknown> & {
  openrouter: Record<string, unknown> & { annotations: unknown };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureOpenRouterAnnotations(
  metadata: ProviderMetadata,
): NormalizedProviderMetadata {
  const baseMetadata = isRecord(metadata) ? metadata : {};
  const openrouterRaw = isRecord(baseMetadata.openrouter)
    ? baseMetadata.openrouter
    : {};

  return {
    ...baseMetadata,
    openrouter: {
      ...openrouterRaw,
      annotations:
        'annotations' in openrouterRaw &&
        openrouterRaw.annotations !== undefined
          ? openrouterRaw.annotations
          : {},
    },
  };
}

function wrapStream(stream: ReadableStream<unknown>): ReadableStream<unknown> {
  const reader = stream.getReader();

  return new ReadableStream<unknown>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        reader.releaseLock();
        return;
      }

      if (
        value &&
        typeof value === 'object' &&
        (value as { type?: string }).type === 'response-metadata' &&
        'providerMetadata' in value
      ) {
        controller.enqueue({
          ...value,
          providerMetadata: ensureOpenRouterAnnotations(
            (value as { providerMetadata?: ProviderMetadata }).providerMetadata,
          ),
        });
        return;
      }

      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

function hasProviderMetadata(
  value: unknown,
): value is { providerMetadata?: ProviderMetadata } {
  return (
    value !== null && typeof value === 'object' && 'providerMetadata' in value
  );
}

function hasReadableStream(value: unknown): value is {
  stream: ReadableStream<unknown>;
} {
  return (
    value !== null &&
    typeof value === 'object' &&
    'stream' in value &&
    (value as { stream?: unknown }).stream instanceof ReadableStream
  );
}

export function withProviderMetadataAnnotations<T>(model: T): T {
  const wrapped = { ...(model as object) } as T & {
    doGenerate?: (...args: unknown[]) => unknown;
    doStream?: (...args: unknown[]) => unknown;
  };

  const generate = (model as { doGenerate?: (...args: unknown[]) => unknown })
    .doGenerate;
  const stream = (model as { doStream?: (...args: unknown[]) => unknown })
    .doStream;

  if (generate) {
    wrapped.doGenerate = async (...args: unknown[]) => {
      const result = await generate.apply(model as object, args);
      if (!hasProviderMetadata(result)) {
        return result;
      }

      return {
        ...result,
        providerMetadata: ensureOpenRouterAnnotations(result.providerMetadata),
      };
    };
  }

  if (stream) {
    wrapped.doStream = async (...args: unknown[]) => {
      const result = await stream.apply(model as object, args);
      if (!hasReadableStream(result)) {
        return result;
      }

      return {
        ...result,
        stream: wrapStream(result.stream),
      };
    };
  }

  return wrapped;
}
