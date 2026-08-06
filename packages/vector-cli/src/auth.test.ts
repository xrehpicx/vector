import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./network', () => ({
  vectorFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    globalThis.fetch(input, init),
}));

import {
  fetchAuthSession,
  fetchConvexToken,
  loginWithPassword,
  logout,
  signUpWithEmail,
} from './auth';
import { createEmptySession } from './session';

describe('CLI auth helpers', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('signs up with email and stores response cookies', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'set-cookie':
            'better-auth.session_token=test-signup-token; Path=/; HttpOnly',
        },
      }),
    );

    const session = await signUpWithEmail(
      createEmptySession(),
      'http://localhost:3000',
      'test@example.com',
      'tester',
      'password123',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/sign-up/email',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(session.cookies['better-auth.session_token']).toBe(
      'test-signup-token',
    );
  });

  it('logs in with email or username endpoints correctly', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      }),
    );

    await loginWithPassword(
      createEmptySession(),
      'http://localhost:3000',
      'person@example.com',
      'password123',
    );
    await loginWithPassword(
      createEmptySession(),
      'http://localhost:3000',
      'tester',
      'password123',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/auth/sign-in/email',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/auth/sign-in/username',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('logs out with a JSON body so the auth route accepts the request', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      }),
    );

    await logout(
      {
        ...createEmptySession(),
        cookies: {
          'better-auth.session_token': 'logout-token',
        },
      },
      'http://localhost:3000',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/sign-out',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: '{}',
      }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.headers).toBeInstanceOf(Headers);
    expect((requestInit?.headers as Headers).get('origin')).toBe(
      'http://localhost:3000',
    );
  });

  it('fetches the auth session and convex token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              email: 'test@example.com',
            },
          }),
          {
            status: 200,
            headers: {
              'set-cookie':
                'better-auth.session_token=session-token; Path=/; HttpOnly',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'convex-token' }), {
          status: 200,
        }),
      );

    const authState = await fetchAuthSession(
      createEmptySession(),
      'http://localhost:3000',
    );
    const tokenState = await fetchConvexToken(
      createEmptySession(),
      'http://localhost:3000',
    );

    expect(authState.user?.email).toBe('test@example.com');
    expect(authState.session.cookies['better-auth.session_token']).toBe(
      'session-token',
    );
    expect(tokenState.token).toBe('convex-token');
  });
});
