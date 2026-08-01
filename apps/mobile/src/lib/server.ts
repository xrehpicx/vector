export type VectorServer = {
  appUrl: string;
  authUrl: string;
  convexUrl: string;
  displayUrl: string;
};

type AppConfig = { convexSiteUrl?: unknown; convexUrl?: unknown };

function isLoopback(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

export function normalizeServerUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Enter a Vector server.');

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${/^(localhost|127\.0\.0\.1|\[::1\])/i.test(trimmed) ? 'http' : 'https'}://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('Enter a valid Vector server.');
  }

  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && isLoopback(parsed.hostname))
  ) {
    throw new Error('Use HTTPS. HTTP is available only for local development.');
  }

  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function serverLabel(server: VectorServer) {
  return server.displayUrl.replace(/^https?:\/\//, '');
}

export async function discoverServer(raw: string): Promise<VectorServer> {
  const displayUrl = normalizeServerUrl(raw);
  let response: Response;
  try {
    response = await fetch(`${displayUrl}/api/config`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('Could not reach this Vector server.');
  }

  if (!response.ok) {
    throw new Error(`This Vector server returned ${response.status}.`);
  }

  let config: AppConfig;
  try {
    config = (await response.json()) as AppConfig;
  } catch {
    throw new Error('This server did not return valid Vector configuration.');
  }

  if (typeof config.convexUrl !== 'string' || !config.convexUrl.trim()) {
    throw new Error('This server did not provide a Convex deployment.');
  }

  const convexUrl = normalizeServerUrl(config.convexUrl);
  const resolvedConfigUrl = new URL(response.url || `${displayUrl}/api/config`);
  const appUrl = `${resolvedConfigUrl.protocol}//${resolvedConfigUrl.host}`;
  const authUrl =
    typeof config.convexSiteUrl === 'string' && config.convexSiteUrl.trim()
      ? normalizeServerUrl(config.convexSiteUrl)
      : appUrl;

  return { appUrl, authUrl, convexUrl, displayUrl };
}
