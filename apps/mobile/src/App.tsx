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

import { authClient } from '@/lib/auth-client';
import { convex } from '@/lib/convex';
import { colors } from '@/theme';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { RootNavigator } from '@/navigation/RootNavigator';
import { WorkspaceProvider } from '@/providers/WorkspaceProvider';
import { MessageDeliveryManager } from '@/features/collaboration/MessageDeliveryManager';

enableScreens(true);

const convexAuthClient = authClient as unknown as ComponentProps<
  typeof ConvexBetterAuthProvider
>['authClient'];

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export default function App() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ConvexBetterAuthProvider authClient={convexAuthClient} client={convex}>
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
