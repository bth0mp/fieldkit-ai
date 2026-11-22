import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Onboarding: undefined;
  ModelDownload: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  // Former ChatsStack
  Chat: { conversationId?: string; projectId?: string; firstMessage?: string };
  // Former ProjectsStack
  ProjectDetail: { projectId: string };
  ProjectEdit: { projectId?: string };
  ProjectChats: { projectId: string };
  KnowledgeBase: { projectId: string };
  GuideLibrary: undefined;
  KiwixFiles: undefined;
  ModelGuide: undefined;
  QuickReference: { cardId?: string } | undefined;
  Checklists: { listId?: string } | undefined;
  Calculators: undefined;
  EditHome: undefined;
  HomeSearch: undefined;
  DocumentPreview: { filePath: string; fileName: string; fileSize: number };
  // Former SettingsStack
  ModelSettings: undefined;
  RemoteServers: undefined;
  DeviceInfo: undefined;
  StorageSettings: undefined;
  SecuritySettings: undefined;
  // Already in RootStack
  DownloadManager: undefined;
  Gallery: { conversationId?: string } | undefined;
  OpenSourceLicenses: undefined;
  About: undefined;
  Tools: undefined;
  // Opened from Home's Phone and Your library cards (no longer tabs)
  Models: { initialTab?: 'text' | 'image' | 'voice' | 'transcription'; repairModelId?: string; initialSearchQuery?: string } | undefined;
  Projects: undefined;
};

// Tab navigator — simple, no sub-stacks. NewChatTab has no screen: its place is the raised New chat button.
export type MainTabParamList = {
  HomeTab: undefined;
  ChatsTab: undefined;
  NewChatTab: undefined;
  KitTab: undefined;
  SettingsTab: undefined;
};
