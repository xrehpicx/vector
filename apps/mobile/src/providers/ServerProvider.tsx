import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  createVectorAuthClient,
  type VectorAuthClient,
} from '@/lib/auth-client';
import { createVectorConvexClient } from '@/lib/convex';
import { runtime } from '@/lib/runtime';
import {
  discoverServer,
  normalizeServerUrl,
  type VectorServer,
} from '@/lib/server';
import { colors } from '@/theme';

const STORAGE_KEY = 'vector.selected-server';

function defaultServer(): VectorServer {
  return {
    appUrl: normalizeServerUrl(runtime.appUrl),
    authUrl: normalizeServerUrl(runtime.convexSiteUrl),
    convexUrl: normalizeServerUrl(runtime.convexUrl),
    displayUrl: normalizeServerUrl(runtime.appUrl),
  };
}

function applyBundledDefaultAuth(server: VectorServer) {
  const bundled = defaultServer();
  return server.displayUrl === bundled.displayUrl &&
    server.authUrl === server.appUrl
    ? { ...server, authUrl: bundled.authUrl }
    : server;
}

type ServerContextValue = {
  authClient: VectorAuthClient;
  changeServer: (raw: string) => Promise<void>;
  convexClient: ReturnType<typeof createVectorConvexClient>;
  server: VectorServer;
};

const ServerContext = createContext<ServerContextValue | null>(null);

function parseStoredServer(value: string | null) {
  if (!value) return null;
  try {
    const server = JSON.parse(value) as Partial<VectorServer>;
    if (
      typeof server.appUrl !== 'string' ||
      typeof server.convexUrl !== 'string' ||
      typeof server.displayUrl !== 'string'
    ) {
      return null;
    }
    return {
      appUrl: normalizeServerUrl(server.appUrl),
      authUrl: normalizeServerUrl(
        typeof server.authUrl === 'string' ? server.authUrl : server.appUrl,
      ),
      convexUrl: normalizeServerUrl(server.convexUrl),
      displayUrl: normalizeServerUrl(server.displayUrl),
    };
  } catch {
    return null;
  }
}

export function ServerProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<VectorServer | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let value: string | null = null;
      try {
        value = await SecureStore.getItemAsync(STORAGE_KEY);
      } catch {
        // Unsigned simulator builds can lack Keychain entitlements. The bundled
        // default remains usable and signed builds still persist the choice.
      }
      const stored = parseStoredServer(value);
      if (stored) {
        if (!cancelled) setServer(stored);
        return;
      }

      const fallback = defaultServer();
      try {
        const discovered = applyBundledDefaultAuth(
          await discoverServer(fallback.displayUrl),
        );
        try {
          await SecureStore.setItemAsync(
            STORAGE_KEY,
            JSON.stringify(discovered),
          );
        } catch {
          // Keep the discovered server in memory when persistence is unavailable.
        }
        if (!cancelled) setServer(discovered);
      } catch {
        if (!cancelled) setServer(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clients = useMemo(() => {
    if (!server) return null;
    return {
      authClient: createVectorAuthClient(server.authUrl),
      convexClient: createVectorConvexClient(server.convexUrl),
    };
  }, [server]);

  useEffect(
    () => () => {
      void clients?.convexClient.close();
    },
    [clients],
  );

  if (!server || !clients) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const value: ServerContextValue = {
    ...clients,
    server,
    changeServer: async raw => {
      const next = applyBundledDefaultAuth(await discoverServer(raw));
      try {
        await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The active selection still changes when Keychain is unavailable.
      }
      setServer(next);
    },
  };

  return (
    <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
  );
}

export function useServer() {
  const value = useContext(ServerContext);
  if (!value) throw new Error('useServer must be used inside ServerProvider.');
  return value;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
