import { isCancel, password as passwordPrompt, text } from '@clack/prompts';
import { CliSession } from './session';

type AuthUser = {
  id?: string;
  email?: string;
  name?: string;
  username?: string;
};

type AuthSessionResponse = {
  user?: AuthUser | null;
  session?: Record<string, unknown> | null;
};

function buildUrl(appUrl: string, pathname: string) {
  return new URL(pathname, appUrl).toString();
}

function cookieHeader(cookies: Record<string, string>) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function splitSetCookieHeader(value: string) {
  return value.split(/,(?=[^;,]+=)/g);
}

function applySetCookieHeaders(
  session: CliSession,
  response: Response,
): CliSession {
  const nextCookies = { ...session.cookies };
  const rawSetCookies =
    response.headers.getSetCookie?.() ??
    (response.headers.get('set-cookie')
      ? splitSetCookieHeader(response.headers.get('set-cookie')!)
      : []);

  for (const rawCookie of rawSetCookies) {
    const [cookiePart, ...attributeParts] = rawCookie.split(';');
    const separatorIndex = cookiePart.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = cookiePart.slice(0, separatorIndex).trim();
    const value = cookiePart.slice(separatorIndex + 1).trim();
    const attributes = attributeParts.map(part => part.trim().toLowerCase());
    const maxAge = attributes.find(part => part.startsWith('max-age='));
    const expires = attributes.find(part => part.startsWith('expires='));
    const expired =
      value.length === 0 ||
      maxAge === 'max-age=0' ||
      (expires
        ? Number.isFinite(Date.parse(expires.slice(8))) &&
          Date.parse(expires.slice(8)) <= Date.now()
        : false);

    if (expired) {
      delete nextCookies[name];
    } else {
      nextCookies[name] = value;
    }
  }

  return {
    ...session,
    cookies: nextCookies,
  };
}

async function authRequest(
  session: CliSession,
  appUrl: string,
  pathname: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  const origin = new URL(appUrl).origin;
  if (Object.keys(session.cookies).length > 0) {
    headers.set('cookie', cookieHeader(session.cookies));
  }
  if (!headers.has('origin')) {
    headers.set('origin', origin);
  }
  if (!headers.has('referer')) {
    headers.set('referer', `${origin}/`);
  }
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(buildUrl(appUrl, pathname), {
    ...init,
    headers,
    redirect: 'manual',
  });
  const nextSession = applySetCookieHeaders(session, response);
  return { response, session: nextSession };
}

async function parseError(response: Response) {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message ?? `Request failed with HTTP ${response.status}`;
  } catch {
    return `Request failed with HTTP ${response.status}`;
  }
}

export async function loginWithPassword(
  session: CliSession,
  appUrl: string,
  identifier: string,
  password: string,
) {
  const pathname = identifier.includes('@')
    ? '/api/auth/sign-in/email'
    : '/api/auth/sign-in/username';
  const body = identifier.includes('@')
    ? { email: identifier, password }
    : { username: identifier, password };
  const { response, session: nextSession } = await authRequest(
    session,
    appUrl,
    pathname,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return nextSession;
}

export async function signUpWithEmail(
  session: CliSession,
  appUrl: string,
  email: string,
  username: string,
  password: string,
) {
  const { response, session: nextSession } = await authRequest(
    session,
    appUrl,
    '/api/auth/sign-up/email',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        name: username,
        username,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return nextSession;
}

export async function logout(session: CliSession, appUrl: string) {
  const { response } = await authRequest(
    session,
    appUrl,
    '/api/auth/sign-out',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}

export async function fetchAuthSession(session: CliSession, appUrl: string) {
  const { response, session: nextSession } = await authRequest(
    session,
    appUrl,
    '/api/auth/get-session',
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = (await response.json()) as AuthSessionResponse;
  return {
    session: nextSession,
    user: data.user ?? null,
  };
}

export async function fetchConvexToken(session: CliSession, appUrl: string) {
  const { response, session: nextSession } = await authRequest(
    session,
    appUrl,
    '/api/auth/convex/token',
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error('Missing Convex token');
  }

  return {
    session: nextSession,
    token: data.token,
  };
}

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

type DeviceTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
};

export async function requestDeviceCode(
  appUrl: string,
  clientId: string,
): Promise<DeviceCodeResponse> {
  const response = await fetch(buildUrl(appUrl, '/api/auth/device/code'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to request device code: HTTP ${response.status}`);
  }

  return (await response.json()) as DeviceCodeResponse;
}

export async function pollDeviceToken(
  session: CliSession,
  appUrl: string,
  deviceCode: string,
  clientId: string,
  interval: number,
  expiresIn: number,
): Promise<CliSession> {
  const deadline = Date.now() + expiresIn * 1000;
  let pollInterval = interval * 1000;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const { response, session: nextSession } = await authRequest(
      session,
      appUrl,
      '/api/auth/device/token',
      {
        method: 'POST',
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: clientId,
        }),
      },
    );

    session = nextSession;

    if (response.ok) {
      const data = (await response.json()) as DeviceTokenResponse;
      if (data.access_token) {
        // Session cookies were set by the response — return the updated session
        return session;
      }
    }

    let errorData: DeviceTokenResponse;
    try {
      errorData = (await response.json()) as DeviceTokenResponse;
    } catch {
      errorData = { error: `HTTP ${response.status}` };
    }

    switch (errorData.error) {
      case 'authorization_pending':
        break;
      case 'slow_down':
        pollInterval += 5000;
        break;
      case 'access_denied':
        throw new Error('Authorization denied by user.');
      case 'expired_token':
        throw new Error('Device code expired. Please try again.');
      default:
        throw new Error(`Device auth error: ${errorData.error}`);
    }
  }

  throw new Error('Device code expired. Please try again.');
}

export async function prompt(question: string) {
  const value = await text({
    message: question.replace(/:\s*$/, ''),
  });
  if (isCancel(value)) {
    throw new Error('Canceled');
  }
  return String(value).trim();
}

export async function promptSecret(question: string) {
  const value = await passwordPrompt({
    message: question.replace(/:\s*$/, ''),
    mask: '*',
  });
  if (isCancel(value)) {
    throw new Error('Canceled');
  }
  return String(value);
}
