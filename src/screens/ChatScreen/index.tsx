import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, InteractionManager, Platform } from 'react-native';
// Edge-to-edge-aware KeyboardAvoidingView. RN's own version leaves a residual
// padding band on Android under edge-to-edge (adjustResize is a no-op there);
// this one reconciles the keyboard frame against the navigation-bar inset.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useUiModeStore } from '../../stores/uiModeStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSpotlightTour } from 'react-native-spotlight-tour';
import { CustomAlert, hideAlert } from '../../components';
import { consumePendingSpotlight } from '../../components/onboarding/spotlightState';
import { VOICE_HINT_STEP_INDEX, IMAGE_SETTINGS_STEP_INDEX } from '../../components/onboarding/spotlightConfig';
import { useAppStore } from '../../stores/appStore';
import type { Conversation, Message } from '../../types';
import { useTheme, useThemedStyles } from '../../theme';
import { createStyles } from './styles';
import { useChatScreen } from './useChatScreen';
import { MessageRenderer } from './MessageRenderer';
import { NoModelScreen, ChatHeader } from './ChatScreenComponents';
import { ChatModalSection } from './ChatModalSection';
import { ChatMessageArea } from './ChatMessageArea';

function countConversationImages(conv: Conversation | undefined): number {
  return (conv?.messages || []).reduce((n: number, m: Message) =>
    n + (m.attachments?.filter((a) => a.type === 'image').length || 0), 0);
}
export const ChatScreen: React.FC = () => {
  const flatListRef = React.useRef<FlatList>(null);
  const isNearBottomRef = React.useRef(true);
  // The conversation (null: a new chat) whose composer has been rendered; undefined until it has.
  const composerShownForRef = React.useRef<string | null | undefined>(undefined);
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const chat = useChatScreen();
  const { goTo, current } = useSpotlightTour();

  const pendingNextRef = useRef<number | null>(null);

  // Keyboard avoidance is handled by KeyboardAvoidingView behavior="padding"
  // (same as main, on both platforms). The custom androidKbPad mechanism that
  // previously lived here floated the input mid-screen, so it was removed.

  // Only ONE AttachStep mounted at a time to avoid waypoint dots/lines.
  // chatSpotlight controls which index is active (3, 12, 15, or 16).
  const [chatSpotlight, setChatSpotlight] = useState<number | null>(null);
  const onboardingChecklist = useAppStore(s => s.onboardingChecklist);
  const shownSpotlights = useAppStore(s => s.shownSpotlights);
  const markSpotlightShown = useAppStore(s => s.markSpotlightShown);
  const step3ShownRef = useRef(false);
  // If user arrived here via onboarding spotlight flow, show input spotlight
  useEffect(() => {
    const pending = consumePendingSpotlight();
    if (pending === 3) {
      // Chain: step 3 (ChatInput) → step 12 (VoiceRecordButton)
      pendingNextRef.current = VOICE_HINT_STEP_INDEX;
      step3ShownRef.current = false;
      const task = InteractionManager.runAfterInteractions(() => {
        step3ShownRef.current = true;
        goTo(3);
      });
      return () => task.cancel();
    } else if (pending !== null) {
      const task = InteractionManager.runAfterInteractions(() => goTo(pending));
      return () => task.cancel();
    }
  }, [goTo]);
  const chainingRef = useRef(false);
  // When the spotlight tour stops after step 3, fire the chained step 12
  useEffect(() => {
    if (current === undefined && step3ShownRef.current && pendingNextRef.current !== null) {
      step3ShownRef.current = false;
      chainingRef.current = true;
      const next = pendingNextRef.current;
      pendingNextRef.current = null;
      // Switch AttachStep index — need time for new AttachStep to mount + measure layout
      setChatSpotlight(next);
      setTimeout(() => {
        chainingRef.current = false;
        goTo(next);
      }, 800);
    } else if (current === undefined && !chainingRef.current && !step3ShownRef.current && pendingNextRef.current === null) {
      // Tour stopped and no chain pending — clear spotlight
      setChatSpotlight(null);
    }
  }, [current, goTo]);
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingSpotlight();
      if (pending !== null) {
        const task = InteractionManager.runAfterInteractions(() => goTo(pending));
        return () => task.cancel();
      }
    }, [goTo]),
  );
  const generatedImages = useAppStore(s => s.generatedImages);
  useEffect(() => {
    if (
      generatedImages.length > 0 &&
      !shownSpotlights.imageSettings &&
      onboardingChecklist.triedImageGen
    ) {
      markSpotlightShown('imageSettings');
      InteractionManager.runAfterInteractions(() => goTo(IMAGE_SETTINGS_STEP_INDEX));
    }
  }, [generatedImages.length, shownSpotlights, onboardingChecklist.triedImageGen, markSpotlightShown, goTo]);

  React.useEffect(() => {
    if (chat.activeConversation?.messages.length && isNearBottomRef.current) {
      setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: true }); }, 100);
    }
  }, [chat.activeConversation?.messages.length]);

  React.useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  // Reset scroll when switching between chat/audio interface modes
  const interfaceMode = useUiModeStore((s) => s.interfaceMode);
  const prevModeRef = React.useRef(interfaceMode);
  React.useEffect(() => {
    if (prevModeRef.current !== interfaceMode) {
      prevModeRef.current = interfaceMode;
      isNearBottomRef.current = true;
      chat.setShowScrollToBottom(false);
      // FlatList re-renders via extraData; onContentSizeChange fires and scrolls.
      // Backup: scroll after items have had time to re-measure.
      setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: false }); }, 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interfaceMode]);

  const alertEl = (
    <CustomAlert
      visible={chat.alertState.visible}
      title={chat.alertState.title}
      message={chat.alertState.message}
      buttons={chat.alertState.buttons}
      prominentMessage={chat.alertState.prominentMessage}
      onClose={() => chat.setAlertState(hideAlert())}
    />
  );
  // Once this conversation's composer has been shown it stays (disabled, "No model" in the header) through an Unload,
  // so a half-typed message in it survives Unload then Use. A chat opened with no model never shows it.
  const composerShownFor = composerShownForRef.current === chat.activeConversationId;
  if (!chat.hasActiveModel && chat.displayMessages.length === 0 && !composerShownFor) {
    return (
      <>
        <NoModelScreen
          styles={styles} colors={colors}
          navigation={chat.navigation}
          hasAvailableModels={chat.hasAvailableModels}
          onOpenModels={chat.openModels}
          isModelLoading={chat.isModelLoading}
        />
        {alertEl}
      </>
    );
  }

  composerShownForRef.current = chat.activeConversationId;

  // Model loading is shown inline (a "Loading model" bar above the input via
  // ChatMessageArea), so the chat stays visible while a text/image model loads —
  // no full-screen takeover.

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isNearBottomRef.current = distFromBottom < 100;
    chat.setShowScrollToBottom(!isNearBottomRef.current);
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => (
    <MessageRenderer
      item={item} index={index}
      displayMessagesLength={chat.displayMessages.length}
      animateLastN={chat.animateLastN}
      imageModelLoaded={chat.imageModelLoaded}
      isStreaming={chat.isStreaming}
      isGeneratingImage={chat.isGeneratingImage}
      showGenerationDetails={chat.settings.showGenerationDetails}
      onCopy={chat.handleCopyMessage}
      onRetry={chat.handleRetryMessage}
      onEdit={chat.handleEditMessage}
      onGenerateImage={chat.handleGenerateImageFromMessage}
      onImagePress={chat.handleImagePress}
    />
  );

  const imageCount = countConversationImages(chat.activeConversation);

  // Bottom safe-area is applied on the input footer (ChatMessageArea), not here
  // — otherwise the inset stacks on top of the input's own padding and leaves a
  // gap below the bar.
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView testID="chat-screen" style={styles.keyboardView} behavior="padding" keyboardVerticalOffset={0}>
        <ChatHeader
          styles={styles} colors={colors}
          activeConversation={chat.activeConversation}
          activeProject={chat.activeProject}
          navigation={chat.navigation}
          modelLabel={chat.hasTextModel ? chat.activeModelName : chat.activeImageModel ? 'Image model' : 'No model'}
          onOpenModels={() => chat.openModels(!chat.hasTextModel && chat.activeImageModel ? 'image' : 'text')}
          setShowSettingsPanel={chat.setShowSettingsPanel}
          setShowProjectSelector={chat.setShowProjectSelector}
          isRemote={chat.activeModelInfo?.isRemote}
        />
        <ChatMessageArea
          flatListRef={flatListRef}
          isNearBottomRef={isNearBottomRef}
          chat={chat}
          styles={styles}
          colors={colors}
          handleScroll={handleScroll}
          renderItem={renderItem}
          chatSpotlight={chatSpotlight}
        />
        <ChatModalSection
          styles={styles} colors={colors}
          showProjectSelector={chat.showProjectSelector}
          setShowProjectSelector={chat.setShowProjectSelector}
          showDebugPanel={chat.showDebugPanel}
          setShowDebugPanel={chat.setShowDebugPanel}
          showSettingsPanel={chat.showSettingsPanel}
          setShowSettingsPanel={chat.setShowSettingsPanel}
          debugInfo={chat.debugInfo}
          activeProject={chat.activeProject}
          activeConversation={chat.activeConversation}
          settings={chat.settings}
          projects={chat.projects}
          handleSelectProject={chat.handleSelectProject}
          handleDeleteConversation={chat.handleDeleteConversation}
          imageCount={imageCount}
          activeConversationId={chat.activeConversationId}
          navigation={chat.navigation}
          openModels={chat.openModels}
          viewerImageUri={chat.viewerImageUri}
          setViewerImageUri={chat.setViewerImageUri}
          handleSaveImage={chat.handleSaveImage}
          isRemote={chat.activeModelInfo?.isRemote}
        />
      </KeyboardAvoidingView>
      {alertEl}
    </SafeAreaView>
  );
};
