import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LIST_CLIPPING_PROPS } from '../../constants/listClipping';
import { View, FlatList, Text, Keyboard, ActivityIndicator } from 'react-native';
import { useUiModeStore } from '../../stores/uiModeStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import Icon from 'react-native-vector-icons/Feather';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AttachStep } from 'react-native-spotlight-tour';
import { ChatInput, ThinkingIndicator, ModelFailureCard, ImageGenAdviceCard } from '../../components';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { ActionApprovalCard } from '../../components/ActionApprovalCard';
import { generationService } from '../../services';
import { EmptyChat, ImageProgressIndicator } from './ChatScreenComponents';
import { getPlaceholderText, useChatScreen } from './useChatScreen';
import { createStyles } from './styles';
import { scrollToContentEnd } from './scrollToContentEnd';
import { useTheme } from '../../theme';
import { useAppStore } from '../../stores';
import { getToolExtensions } from '../../services/tools/extensions';
import { AVAILABLE_TOOLS } from '../../services/tools';
import { useOpenProTools } from '../../hooks/useOpenProTools';
import { useIsProActive } from '../../hooks/useIsProActive';
import { getSlot, SLOTS } from '../../bootstrap/slotRegistry';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

const KEEP_POSITION = { minIndexForVisible: 0 } as const;

export type ChatMessageAreaProps = {
  flatListRef: React.RefObject<FlatList | null>;
  isNearBottomRef: React.MutableRefObject<boolean>;
  chat: ReturnType<typeof useChatScreen>;
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useTheme>['colors'];
  handleScroll: (event: any) => void;
  renderItem: (info: { item: any; index: number }) => React.JSX.Element;
  chatSpotlight: number | null;
};

// The bottom gap below the input controls should visually MATCH the top gap
// (the ChatInput container's paddingTop = 12), not consume the full home-indicator
// safe-area inset — that made the bottom feel like a large dead band vs the top.
// The container already pads its bottom by 8, so cap the extra footer at 4 → 12
// total, symmetric with the top. Collapses to 0 while the keyboard is up.
//
// BUT that cap only applies to a thin overlay inset (iOS home indicator / gesture
// nav), which draws *over* content. A 3-button navigation bar is opaque and owns
// real space at the bottom — capping there renders the input controls UNDER the
// nav buttons. We distinguish by the inset size (not Platform.OS): anything above
// the overlay threshold is a real nav bar, so honor the full inset and clear it.
const FOOTER_SAFE_CAP = 4;
// Home-indicator / gesture-nav overlays sit at ~24px or below on the devices we
// target; a 3-button nav bar is taller. Above this, treat the inset as opaque.
const OVERLAY_INSET_MAX = 24;
export const computeFooterPaddingBottom = (keyboardVisible: boolean, insetBottom: number): number => {
  if (keyboardVisible) return 0;
  // Opaque nav bar (tall inset): pad the full inset so controls clear it.
  if (insetBottom > OVERLAY_INSET_MAX) return insetBottom;
  // Thin overlay inset: keep the symmetric-with-top cap.
  return Math.min(insetBottom, FOOTER_SAFE_CAP);
};

// Show the "tap to continue" bar only when a text reply is genuinely PENDING — the
// selected text model was evicted AND the last message is an unanswered user turn.
// After a completed turn (text or image), the last message is an assistant reply, so
// the bar hides — it read as misplaced when it lingered after a finished image turn.
// Checking the tail role is modality-agnostic: any completed turn ends with 'assistant'.
export const shouldShowEvictedBar = (chat: ReturnType<typeof useChatScreen>): boolean => {
  if (!chat.textModelEvicted || chat.isModelLoading || chat.isCompacting) return false;
  if (chat.isGeneratingImage) return false;
  if (!chat.activeModelId || chat.activeModelInfo?.isRemote) return false;
  const last = chat.displayMessages[chat.displayMessages.length - 1];
  return last?.role === 'user';
};

// "Model unloaded to free memory — tap to continue": the active text model was evicted
// (e.g. an image/TTS load in voice mode) but stays selected. Tapping reloads it.
const ModelEvictedBar: React.FC<{ visible: boolean; onPress: () => void; styles: any; colors: any }> = ({
  visible, onPress, styles, colors,
}) => {
  if (!visible) return null;
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <AnimatedPressable style={styles.pendingSettingsBar} onPress={onPress}>
        <Icon name="cpu" size={16} color={colors.warning} />
        <Text style={styles.pendingSettingsText}>Model unloaded to free memory — tap to continue</Text>
        <Icon name="refresh-cw" size={14} color={colors.warning} />
      </AnimatedPressable>
    </Animated.View>
  );
};

// Small status bar above the input: classifying takes precedence over the
// background model-load indicator.
const ModelStatusBar: React.FC<{ loading: boolean; classifying: boolean; modelName?: string; styles: any; colors: any }> = ({
  loading, classifying, modelName, styles, colors,
}) => {
  if (classifying) {
    return (
      <View style={styles.classifyingBar}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.classifyingText}>Understanding your request...</Text>
      </View>
    );
  }
  if (loading) {
    return (
      <View style={styles.classifyingBar}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.classifyingText}>{modelName ? `Loading ${modelName}...` : 'Loading model...'}</Text>
      </View>
    );
  }
  return null;
};

export const ChatMessageArea: React.FC<ChatMessageAreaProps> = ({
  flatListRef, isNearBottomRef, chat, styles, colors, handleScroll, renderItem, chatSpotlight,
}) => {
  // A chat opens at its newest message. The list renders in batches, so one scroll on the first layout
  // lands at the end of the first batch only; until the content stops growing or the reader touches the
  // list, every growth pins it to the end again. Opening a different chat starts a new opening phase.
  const openingRef = React.useRef(true);
  // While a chat opens, rows above the end are still measuring. Keeping the first visible row in place
  // (maintainVisibleContentPosition) then pushes the end out of view, so it is switched on only once settled.
  const [settled, setSettled] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentHeightRef = useRef(0);
  React.useEffect(() => {
    openingRef.current = true;
    contentHeightRef.current = 0;
    setSettled(false);
    // Never unsettled for long: whatever the content does, keep-position is on within 800 ms.
    const fallback = setTimeout(() => setSettled(true), 800);
    return () => {
      clearTimeout(fallback);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    };
  }, [chat.activeConversationId]);
  const interfaceMode = useUiModeStore((s) => s.interfaceMode);
  const tabNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { toolCountHintDismissed } = useAppStore();
  // Subscribe to Pro activation so this re-renders the moment a license is
  // activated. loadProFeatures() registers the tool extensions + the Pro Tools
  // screen in one pass; without this subscription the getToolExtensions() reads
  // below are non-reactive and the Pro Tools badge stayed stale until an app
  // restart. Return is intentionally unused — the count is naturally 0 when Pro
  // is inactive (no extensions registered); we only need the re-render.
  useIsProActive();
  // extToolCount is the live MCP tool count (the email/calendar extension reports 0
  // here because those live in settings.enabledTools — see EmailCalendarExtension).
  const extToolCount = getToolExtensions().reduce((n, e) => n + e.enabledToolCount(), 0);
  // Pro tools (email/calendar) are toggled through settings.enabledTools, so count
  // how many of them are on and fold MCP in — this is the "Pro Tools" badge.
  const proToolIds = getToolExtensions().flatMap(e => (e.getToolDefinitions?.() ?? []).map(t => t.id));
  const proToolsActiveCount = proToolIds.filter(id => chat.enabledTools.includes(id)).length;
  const proToolsCount = proToolsActiveCount + extToolCount;
  // The free Tools page lists only AVAILABLE_TOOLS, so its badge counts just those
  // (pro email/calendar ids are surfaced under Pro Tools instead, not double-counted).
  const freeToolIds = new Set(AVAILABLE_TOOLS.map(t => t.id));
  const freeToolsCount = chat.enabledTools.filter(id => freeToolIds.has(id)).length;
  const totalToolCount = freeToolsCount + proToolsCount;
  const handleProToolsPress = useOpenProTools();
  const showSettingsDot = totalToolCount > 3 && !toolCountHintDismissed;
  const [inputHeight, setInputHeight] = useState(84);
  const flatListHeightRef = useRef(0);
  // Where the list ends, from the latest layout: the scroll does not wait for the native mount.
  const contentExtent = () => ({ contentHeight: contentHeightRef.current, listHeight: flatListHeightRef.current });

  // Your own message comes into view the moment you send it, whatever the list was doing. Keyed on the
  // newest USER message, not the last row: a thinking row can land in the same render as the sent one.
  const lastSentId = useMemo(() => {
    for (let i = chat.displayMessages.length - 1; i >= 0; i -= 1) {
      if (chat.displayMessages[i].role === 'user') return chat.displayMessages[i].id;
    }
    return undefined;
  }, [chat.displayMessages]);
  useEffect(() => {
    if (!lastSentId) return;
    const frame = requestAnimationFrame(() => scrollToContentEnd(flatListRef.current, true));
    return () => cancelAnimationFrame(frame);
  }, [lastSentId, flatListRef]);

  // Bottom safe-area for the input footer. We own it here (rather than on the
  // screen's SafeAreaView) so the inset replaces — not stacks on top of — the
  // input's own bottom padding, and collapses while the keyboard is open (the
  // keyboard already covers the home-indicator / gesture area). Using the live
  // inset value keeps this correct on both iOS and Android without any
  // Platform.OS layout branching.
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const footerPaddingBottom = computeFooterPaddingBottom(keyboardVisible, insets.bottom);
  const isStreaming = chat.isStreaming || chat.isThinking;
  const prevIsStreamingRef = useRef(isStreaming);
  useEffect(() => {
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming]);
  const activeModelRepoId = chat.activeModelId?.split('/').slice(0, 2).join('/');
  const handleRepairVision = activeModelRepoId
    ? () => tabNav.navigate('DownloadManager')
    : undefined;
  const scrollToBottomStyle = useMemo(
    () => [styles.scrollToBottomContainer, { bottom: inputHeight + 8 }],
    [styles.scrollToBottomContainer, inputHeight],
  );
  return (
    <>
      {chat.displayMessages.length === 0 ? (
        // Voice mode gets its own welcome hero (big "tap to speak" mic); free
        // builds / chat mode fall back to the standard empty chat.
        (() => {
          const AudioEmpty = getSlot(SLOTS.chatEmptyAudio);
          return AudioEmpty && interfaceMode === 'audio' ? <AudioEmpty /> : (
        <EmptyChat
          styles={styles} colors={colors}
          activeModel={chat.activeModel}
          activeModelName={chat.activeModelName}
          activeProject={chat.activeProject}
          setShowProjectSelector={chat.setShowProjectSelector}
        />
          );
        })()
      ) : (
        <FlatList
          {...LIST_CLIPPING_PROPS}
          testID="chat-message-list"
          ref={flatListRef}
          data={chat.displayMessages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          extraData={interfaceMode}
          contentContainerStyle={styles.messageList}
          onScroll={handleScroll}
          onContentSizeChange={(_w, h) => {
            contentHeightRef.current = h;
            // Every opening pin goes to the end this layout reports: the first change arrives before any row
            // has reported its height, so FlatList.scrollToEnd would scroll to 0, the oldest message.
            if (openingRef.current && h > 0) {
              scrollToContentEnd(flatListRef.current, false, contentExtent());
              // Settled once the content has not grown for 400 ms: one last scroll, then the list keeps
              // the reader's place as usual.
              if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
              settleTimerRef.current = setTimeout(() => {
                if (openingRef.current) scrollToContentEnd(flatListRef.current, false, contentExtent());
                openingRef.current = false;
                setSettled(true);
              }, 400);
            } else if (isNearBottomRef.current) {
              scrollToContentEnd(flatListRef.current, false, contentExtent());
            }
          }}
          onScrollBeginDrag={() => { openingRef.current = false; }}
          onLayout={(e) => {
            const newHeight = e.nativeEvent.layout.height;
            const prevHeight = flatListHeightRef.current;
            flatListHeightRef.current = newHeight;
            // An opening chat stays at its end when the list changes height (a bar appears above the composer).
            if (openingRef.current && contentHeightRef.current > 0) {
              scrollToContentEnd(flatListRef.current, false, contentExtent());
            } else if (prevHeight > 0 && newHeight < prevHeight) {
              shrinkTimerRef.current = setTimeout(() => scrollToContentEnd(flatListRef.current, true), 50);
            }
          }}
          scrollEventThrottle={16}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onTouchStart={() => Keyboard.dismiss()}
          // Keep the reader's place when rows above them change, and nothing more. No autoscrollToTopThreshold:
          // it is for inverted lists; here the top is the OLDEST message, so near the start it jumped there.
          maintainVisibleContentPosition={settled ? KEEP_POSITION : undefined}
        />
      )}
      {chat.showScrollToBottom && chat.displayMessages.length > 0 && (
        <Animated.View entering={FadeIn.duration(150)} style={scrollToBottomStyle}>
          <AnimatedPressable hapticType="impactLight" style={styles.scrollToBottomButton} onPress={() => scrollToContentEnd(flatListRef.current, true)}>
            <Icon name="chevron-down" size={20} color={colors.textSecondary} />
          </AnimatedPressable>
        </Animated.View>
      )}
      {chat.isGeneratingImage && (
        <ImageProgressIndicator
          styles={styles} colors={colors}
          imagePreviewPath={chat.imagePreviewPath}
          imageGenerationStatus={chat.imageGenerationStatus}
          imageGenerationProgress={chat.imageGenerationProgress}
          onStop={chat.handleStop}
        />
      )}
      <ModelStatusBar
        // While generating for this chat the loading state is shown inside the
        // reply bubble ("Loading <model>…"), so don't also show it in this bar.
        loading={chat.isModelLoading && !chat.isGeneratingForThisConversation}
        classifying={chat.isClassifying}
        modelName={chat.loadingModel?.name}
        styles={styles}
        colors={colors}
      />
      {chat.isCompacting && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.classifyingBar}>
          <ThinkingIndicator text="Compacting your conversation..." />
        </Animated.View>
      )}
      {chat.hasPendingSettings && !chat.isCompacting && !chat.activeModelInfo?.isRemote && (
        <Animated.View entering={FadeIn.duration(200)}>
          <AnimatedPressable testID="reload-model-banner" style={styles.pendingSettingsBar} onPress={chat.handleReloadTextModel}>
            <Icon name="alert-circle" size={16} color={colors.warning} />
            <Text style={styles.pendingSettingsText}>
              Settings changed — tap to reload model
            </Text>
            <Icon name="refresh-cw" size={14} color={colors.warning} />
          </AnimatedPressable>
        </Animated.View>
      )}
      {/* Single dismissible surface for every model failure (text/image/tts/stt/
          embedding). Reads modelFailureStore itself — no props. Rendered ABOVE the
          evicted snackbar so the rounded failure card is never capped by a flat bar. */}
      <ModelFailureCard />
      {/* GPU-path (no-NPU) image tips — shown in chat (not buried in settings) so a user
          hitting slow/garbled generations sees the fix. Self-hides at good settings. */}
      <ImageGenAdviceCard />
      {/* Text model evicted to free RAM (e.g. voice-mode image/TTS load) but still
          selected — reload it on demand, even a large model. This flat "tap to continue"
          snackbar sits directly above the composer, BELOW the rounded failure card. */}
      <ModelEvictedBar
        visible={shouldShowEvictedBar(chat)}
        onPress={chat.handleReloadTextModel}
        styles={styles}
        colors={colors}
      />
      {/* A tool call that sends or writes waits here for the user's tap (reads its own store). */}
      <ActionApprovalCard />
      {/* Steps 3/15 share the same AttachStep wrapping ChatInput (multi-index).
         Steps 12/16 are handled inside ChatInput via activeSpotlight prop. */}
      <View
        onLayout={(e) => setInputHeight(e.nativeEvent.layout.height)}
        style={{ backgroundColor: colors.background, paddingBottom: footerPaddingBottom }}
      >
        <AttachStep index={[3, 15]} fill>
          <ChatInput
            onSend={chat.handleSend}
            onStop={chat.handleStop}
            disabled={!chat.hasActiveModel}
            isGenerating={chat.isStreaming || chat.isThinking}
            supportsVision={chat.supportsVision}
            visionNeedsRepair={chat.visionNeedsRepair}
            conversationId={chat.activeConversationId}
            imageModelLoaded={chat.imageModelLoaded}
            onOpenSettings={() => chat.setShowSettingsPanel(true)}
            queueCount={chat.queueCount}
            queuedTexts={chat.queuedTexts}
            onClearQueue={() => generationService.clearQueue()}
            placeholder={getPlaceholderText({
              hasModel: chat.hasActiveModel,
              isModelLoading: chat.isModelLoading,
              supportsVision: chat.supportsVision,
              imageOnly: chat.imageModelLoaded && !chat.hasTextModel,
            })}
            onToolsPress={() => tabNav.navigate('Tools')}
            enabledToolCount={freeToolsCount}
            showSettingsDot={showSettingsDot}
            mcpToolCount={proToolsCount}
            onMcpPress={handleProToolsPress}
            supportsToolCalling={chat.supportsToolCalling}
            supportsThinking={chat.supportsThinking}
            onRepairVision={handleRepairVision}
            isRemote={chat.activeModelInfo.isRemote}
            activeSpotlight={chatSpotlight === 12 ? chatSpotlight : null}
            onImagePress={chat.handleImagePress}
          />
        </AttachStep>
      </View>
    </>
  );
};
