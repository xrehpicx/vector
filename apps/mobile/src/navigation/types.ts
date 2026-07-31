export type RootStackParamList = {
  MainTabs: undefined;
  Channel: {
    channelId: string;
    kind: 'public' | 'private' | 'direct' | 'group_direct' | 'announcement';
    name: string;
    topic?: string;
  };
  Thread: {
    channelId: string;
    rootMessageId: string;
    channelName: string;
  };
  ChannelDetails: {
    channelId: string;
    kind: 'public' | 'private' | 'direct' | 'group_direct' | 'announcement';
    name: string;
    topic?: string;
  };
  MessageCollection: { mode: 'priority' | 'threads' | 'saved' };
  Agents: undefined;
  NewConversation:
    | {
        mode?: 'direct' | 'channel';
      }
    | undefined;
  WorkspaceSwitcher: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  DMs: undefined;
  Activity: undefined;
  Search: undefined;
  More: undefined;
};
