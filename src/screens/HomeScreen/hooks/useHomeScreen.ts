import { useEffect, useState, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { AlertState, initialAlertState, showAlert, hideAlert } from '../../../components';
import { useAppStore, useChatStore, useRemoteServerStore } from '../../../stores';
import { modelManager, hardwareService, activeModelService } from '../../../services';
import { Conversation, RemoteModel } from '../../../types';
import { useLANDiscovery } from './useLANDiscovery';
import { useActiveTextModel } from '../../../hooks/useActiveTextModel';
// Shared hook types live in ./types so the sub-hooks can import them without importing this file
// (which imports them back — a cycle). Re-exported here for existing external importers.
import type { HomeScreenNavigationProp } from './types';

export type { HomeScreenNavigationProp };

// Track if we've synced native state to avoid repeated calls
let hasInitializedNativeSync = false;
let hasRunLANDiscovery = false;

function deleteConversationWithAlert(
  conversation: Conversation,
  setAlertState: (s: AlertState) => void,
  deleteConversation: (id: string) => void,
) {
  setAlertState(showAlert(
    'Delete Conversation',
    `Delete "${conversation.title}"?`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setAlertState(hideAlert());
          deleteConversation(conversation.id);
        },
      },
    ]
  ));
}

export const useHomeScreen = (navigation: HomeScreenNavigationProp) => {
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const isFirstMount = useRef(true);

  const {
    downloadedModels,
    setDownloadedModels,
    downloadedImageModels,
    setDownloadedImageModels,
    activeImageModelId,
    deviceInfo,
    setDeviceInfo,
    generatedImages,
  } = useAppStore();

  const { conversations, setActiveConversation, deleteConversation } = useChatStore();

  // Remote server store for remote models
  const { servers: remoteServers, discoveredModels: remoteDiscoveredModels } = useRemoteServerStore();

  const { model: activeTextModel, isRemote: activeTextModelIsRemote } = useActiveTextModel();

  const { runLANDiscovery } = useLANDiscovery({ navigation, setAlertState });

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      loadData();
      if (!hasInitializedNativeSync) {
        hasInitializedNativeSync = true;
        activeModelService.syncWithNativeState();
      }
      if (!hasRunLANDiscovery) {
        hasRunLANDiscovery = true;
        // Delay LAN scan so the home screen is fully rendered and interactive first
        setTimeout(runLANDiscovery, 3000);
      }
    });
    isFirstMount.current = false;
    return () => task.cancel();

  }, []);

  const loadData = async () => {
    if (!deviceInfo) {
      const info = await hardwareService.getDeviceInfo();
      setDeviceInfo(info);
    }
    await modelManager.linkOrphanMmProj();
    const models = await modelManager.getDownloadedModels();
    setDownloadedModels(models);
    const imageModels = await modelManager.getDownloadedImageModels();
    setDownloadedImageModels(imageModels);
  };

  const continueChat = (conversationId: string) => {
    setActiveConversation(conversationId);
    navigation.navigate('Chat', { conversationId });
  };

  const handleDeleteConversation = (conversation: Conversation) =>
    deleteConversationWithAlert(conversation, setAlertState, deleteConversation);

  // The two most recently updated chats, newest first (the order the Chats tab lists them in).
  const recentConversations = [...conversations]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 2);

  // Get all remote text models — includes vision-language models since they do text generation too
  const remoteTextModels: RemoteModel[] = remoteServers.flatMap(server =>
    remoteDiscoveredModels[server.id] || []
  );

  return {
    alertState,
    setAlertState,
    downloadedModels,
    downloadedImageModels,
    activeImageModelId,
    generatedImages,
    conversations,
    activeTextModel,
    activeTextModelIsRemote,
    recentConversations,
    remoteTextModels,
    continueChat,
    handleDeleteConversation,
  };
};
