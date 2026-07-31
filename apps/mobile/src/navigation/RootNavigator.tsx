import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme } from 'react-native';

import type { MainTabParamList, RootStackParamList } from './types';
import { ConversationHomeScreen } from '@/features/collaboration/ConversationHomeScreen';
import { ChannelScreen } from '@/features/collaboration/ChannelScreen';
import { ThreadScreen } from '@/features/collaboration/ThreadScreen';
import { NewConversationScreen } from '@/features/collaboration/NewConversationScreen';
import { ChannelDetailsScreen } from '@/features/collaboration/ChannelDetailsScreen';
import { MessageCollectionScreen } from '@/features/collaboration/MessageCollectionScreen';
import { AgentsScreen } from '@/features/collaboration/AgentsScreen';
import { ActivityScreen } from '@/features/shell/ActivityScreen';
import { SearchScreen } from '@/features/shell/SearchScreen';
import { MoreScreen } from '@/features/shell/MoreScreen';
import { WorkspaceSwitcherScreen } from '@/features/shell/WorkspaceSwitcherScreen';
import { LiquidTabBar } from './LiquidTabBar';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function DirectMessagesScreen() {
  return <ConversationHomeScreen directOnly />;
}

function MainTabs() {
  return (
    <Tabs.Navigator
      initialRouteName='Home'
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
      tabBar={props => <LiquidTabBar {...props} />}
    >
      <Tabs.Screen name='Home' component={ConversationHomeScreen} />
      <Tabs.Screen name='DMs' component={DirectMessagesScreen} />
      <Tabs.Screen name='Activity' component={ActivityScreen} />
      <Tabs.Screen name='Search' component={SearchScreen} />
      <Tabs.Screen name='More' component={MoreScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const isDark = useColorScheme() === 'dark';
  const background = isDark ? '#000000' : '#ffffff';
  const label = isDark ? '#ffffff' : '#000000';
  return (
    <RootStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: background },
        headerBackButtonDisplayMode: 'minimal',
        headerBlurEffect: 'systemMaterial',
        headerShadowVisible: true,
        headerStyle: { backgroundColor: background },
        headerTintColor: '#0099c2',
        headerTitleStyle: { color: label, fontSize: 17, fontWeight: '700' },
      }}
    >
      <RootStack.Screen
        name='MainTabs'
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name='Channel'
        component={ChannelScreen}
        options={{ gestureEnabled: false }}
      />
      <RootStack.Screen
        name='Thread'
        component={ThreadScreen}
        options={{ gestureEnabled: false, title: 'Thread' }}
      />
      <RootStack.Screen
        name='ChannelDetails'
        component={ChannelDetailsScreen}
        options={{ title: 'Conversation details' }}
      />
      <RootStack.Screen
        name='MessageCollection'
        component={MessageCollectionScreen}
        options={({ route }) => ({
          title:
            route.params.mode === 'priority'
              ? 'Priority'
              : route.params.mode === 'threads'
                ? 'Threads'
                : 'Saved',
        })}
      />
      <RootStack.Screen
        name='Agents'
        component={AgentsScreen}
        options={{ title: 'Agents' }}
      />
      <RootStack.Screen
        name='NewConversation'
        component={NewConversationScreen}
        options={({ navigation, route }) => ({
          headerLeft: () => (
            <Pressable
              accessibilityLabel='Close new conversation'
              hitSlop={10}
              onPress={() => navigation.goBack()}
              style={{
                alignItems: 'center',
                height: 36,
                justifyContent: 'center',
                width: 36,
              }}
            >
              <SymbolView name='xmark' size={17} tintColor={label} />
            </Pressable>
          ),
          presentation: 'formSheet',
          sheetAllowedDetents: [0.92],
          sheetGrabberVisible: true,
          title:
            route.params?.mode === 'channel' ? 'New channel' : 'New message',
        })}
      />
      <RootStack.Screen
        name='WorkspaceSwitcher'
        component={WorkspaceSwitcherScreen}
        options={({ navigation }) => ({
          headerLeft: () => (
            <Pressable
              accessibilityLabel='Close workspace switcher'
              hitSlop={10}
              onPress={() => navigation.goBack()}
              style={{
                alignItems: 'center',
                height: 36,
                justifyContent: 'center',
                width: 36,
              }}
            >
              <SymbolView name='xmark' size={17} tintColor={label} />
            </Pressable>
          ),
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          title: 'Workspaces',
        })}
      />
    </RootStack.Navigator>
  );
}
