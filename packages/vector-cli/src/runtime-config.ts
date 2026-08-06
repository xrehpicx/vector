import { vectorFetch } from './network';

export const LOCAL_CONVEX_URL = 'http://127.0.0.1:3210';
export const APP_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
export const APP_CONFIG_FETCH_TIMEOUT_MS = 5_000;

export type AppConfig = {
  convexUrl?: string;
  tunnelHost?: string;
};

export type ConvexRuntimeSource =
  'explicit' | 'app_config' | 'session' | 'environment' | 'local';

export type ConvexRuntimeResolution = {
  convexUrl: string;
  source: ConvexRuntimeSource;
  appConfigFetchedAt?: number;
};

export async function fetchAppConfig(appUrl: string): Promise<AppConfig> {
  try {
    const url = new URL('/api/config', appUrl).toString();
    const response = await vectorFetch(
      url,
      { signal: AbortSignal.timeout(APP_CONFIG_FETCH_TIMEOUT_MS) },
      'fetch app configuration',
    );
    if (!response.ok) {
      return {};
    }

    const data = (await response.json()) as AppConfig;
    return {
      convexUrl: data.convexUrl?.trim() || undefined,
      tunnelHost: data.tunnelHost?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

export async function resolveConvexRuntime(options: {
  appUrl: string;
  explicitAppUrl: boolean;
  explicitConvexUrl?: string;
  cachedConvexUrl?: string;
  appConfigFetchedAt?: number;
  environmentConvexUrl?: string;
  now?: number;
  fetchConfig?: (appUrl: string) => Promise<AppConfig>;
}): Promise<ConvexRuntimeResolution> {
  const explicitConvexUrl = options.explicitConvexUrl?.trim();
  if (explicitConvexUrl) {
    return { convexUrl: explicitConvexUrl, source: 'explicit' };
  }

  const now = options.now ?? Date.now();
  const canUseSessionCache = !options.explicitAppUrl;
  const cachedConvexUrl = canUseSessionCache
    ? options.cachedConvexUrl?.trim()
    : undefined;
  const cacheIsFresh =
    !!cachedConvexUrl &&
    options.appConfigFetchedAt !== undefined &&
    now - options.appConfigFetchedAt < APP_CONFIG_CACHE_TTL_MS;

  if (cacheIsFresh) {
    return { convexUrl: cachedConvexUrl, source: 'session' };
  }

  const appConfig = await (options.fetchConfig ?? fetchAppConfig)(
    options.appUrl,
  );
  if (appConfig.convexUrl) {
    return {
      convexUrl: appConfig.convexUrl,
      source: 'app_config',
      appConfigFetchedAt: now,
    };
  }

  if (cachedConvexUrl) {
    return { convexUrl: cachedConvexUrl, source: 'session' };
  }

  const environmentConvexUrl = options.environmentConvexUrl?.trim();
  if (environmentConvexUrl) {
    return { convexUrl: environmentConvexUrl, source: 'environment' };
  }

  return { convexUrl: LOCAL_CONVEX_URL, source: 'local' };
}
