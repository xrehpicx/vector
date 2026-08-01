import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import type { ComponentProps } from 'react';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { RootNavigator } from '@/navigation/RootNavigator';
import { WorkspaceProvider } from '@/providers/WorkspaceProvider';
import { ServerProvider, useServer } from '@/providers/ServerProvider';
import { MessageDeliveryManager } from '@/features/collaboration/MessageDeliveryManager';

enableScreens(true);

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

function ConnectedApp() {
  const colorScheme = useColorScheme();
  const { authClient, convexClient, server } = useServer();
  const convexAuthClient = authClient as unknown as ComponentProps<
    typeof ConvexBetterAuthProvider
  >['authClient'];

  return (
    <ConvexBetterAuthProvider
      authClient={convexAuthClient}
      client={convexClient}
      key={`${server.appUrl}:${server.authUrl}:${server.convexUrl}`}
    >
      <StatusBar style='auto' />
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen />
      </Unauthenticated>
      <Authenticated>
        <WorkspaceProvider>
          <MessageDeliveryManager />
          <NavigationContainer
            theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
          >
            <RootNavigator />
          </NavigationContainer>
        </WorkspaceProvider>
      </Authenticated>
    </ConvexBetterAuthProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ServerProvider>
          <ConnectedApp />
        </ServerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 },
  loading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
