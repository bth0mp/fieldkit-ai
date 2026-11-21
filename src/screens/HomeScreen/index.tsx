import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, CustomAlert, hideAlert } from '../../components';
import { AnimatedEntry } from '../../components/AnimatedEntry';
import { OnboardingSheet } from '../../components/onboarding/OnboardingSheet';
import { PulsatingIcon } from '../../components/onboarding/PulsatingIcon';
import { useOnboardingSheet } from '../../components/onboarding/useOnboardingSheet';
import { useFocusTrigger } from '../../hooks/useFocusTrigger';
import { useThemedStyles } from '../../theme';
import { createStyles } from './styles';
import { useHomeScreen, HomeScreenNavigationProp } from './hooks/useHomeScreen';
import { useHomeScreenSpotlight } from './hooks/useHomeScreenSpotlight';
import { RecentConversations } from './components/RecentConversations';
import { AssistantCard } from './cards/AssistantCard';
import { FieldKitCard } from './cards/FieldKitCard';
import { LibraryCard } from './cards/LibraryCard';
import { ChecklistsCard } from './cards/ChecklistsCard';
import { TodayCard } from './cards/TodayCard';
import { PhoneCard } from './cards/PhoneCard';
import { useTodaySky } from './hooks/useTodaySky';
import { formatDay } from '../../features/home/todaySky';
import { ModelPickerSheet } from './components/ModelPickerSheet';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ModelsManagerSheet, ModelRowType } from '../../components/models/ModelsManagerSheet';
import { WhisperPickerSheet } from '../../components/models/WhisperPickerSheet';
import { VoiceModelsSheet } from '../../components/models/VoiceModelsSheet';
import { useWhisperStore } from '../../stores/whisperStore';
import { WHISPER_MODELS } from '../../services';
import { useUiModeStore } from '../../stores/uiModeStore';
import { BRAND } from '../../config/branding';

type HomeScreenProps = {
  navigation: HomeScreenNavigationProp;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const focusTrigger = useFocusTrigger();
  const styles = useThemedStyles(createStyles);
  const sky = useTodaySky(focusTrigger);
  const { sheetVisible, openSheet, closeSheet, showIcon } = useOnboardingSheet();

  const {
    pickerType,
    setPickerType,
    loadingState,
    isEjecting,
    alertState,
    setAlertState,
    memoryInfo,
    downloadedModels,
    activeModelId,
    downloadedImageModels,
    activeImageModelId,
    generatedImages,
    conversations,
    activeTextModel,
    activeImageModel,
    recentConversations,
    // Remote model state
    remoteTextModels,
    remoteImageModels,
    activeRemoteTextModelId,
    activeRemoteImageModelId,
    handleSelectTextModel,
    handleUnloadTextModel,
    handleSelectImageModel,
    handleUnloadImageModel,
    // Remote model handlers
    handleSelectRemoteTextModel,
    handleUnloadRemoteTextModel,
    handleSelectRemoteImageModel,
    handleUnloadRemoteImageModel,
    handleEjectAll,
    continueChat,
    handleDeleteConversation,
  } = useHomeScreen(navigation);

  const { handleStepPress } = useHomeScreenSpotlight({
    navigation,
    closeSheet,
    activeImageModelId,
    downloadedImageModelsCount: downloadedImageModels.length,
  });

  // ── Collapsed Models control ──────────────────────────────────────────────
  const [modelsManagerOpen, setModelsManagerOpen] = React.useState(false);
  // Action queued by the manager (open a picker, or eject) — run only after the
  // manager sheet has fully closed, so we never present a second modal while
  // this one is mid-dismiss (that wedges iOS's modal system). Run from onClosed.
  const pendingAfterCloseRef = React.useRef<(() => void) | null>(null);
  const [whisperOpen, setWhisperOpen] = React.useState(false);
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const whisperModelId = useWhisperStore((s) => s.downloadedModelId);
  const voiceSummary = useUiModeStore((s) => s.voiceSummary);

  const modelLabels: Record<ModelRowType, string> = {
    text: activeTextModel?.name ?? '—',
    image: activeImageModel?.name ?? '—',
    voice: voiceSummary ?? '—',
    speech: WHISPER_MODELS.find((m) => m.id === whisperModelId)?.name ?? '—',
  };

  // The Assistant card's model chip names the loaded text model; with only an image model it says so.
  const chipLabel = activeTextModel?.name ?? (activeImageModelId ? 'Image model loaded' : 'No model');
  const hasModelsToPick = downloadedModels.length > 0 || remoteTextModels.length > 0;

  // Stash an action and close the manager; the action runs from the manager's
  // onClosed once it has fully dismissed — so opening a picker or the eject
  // confirmation never collides with the manager's own dismissal.
  const closeManagerThen = (action: () => void) => {
    pendingAfterCloseRef.current = action;
    setModelsManagerOpen(false);
  };

  const openModelRow = (type: ModelRowType) => {
    closeManagerThen(() => {
      if (type === 'text') setPickerType('text');
      else if (type === 'image') setPickerType('image');
      else if (type === 'speech') setWhisperOpen(true);
      else setVoiceOpen(true);
    });
  };

  const runPendingAfterClose = () => {
    const action = pendingAfterCloseRef.current;
    pendingAfterCloseRef.current = null;
    action?.();
  };

  // In place of the ask box while no model is active.
  const setupCard = (
    <View style={styles.setupCard} testID="setup-card">
      <Text style={styles.setupText}>
        {hasModelsToPick
          ? 'Select a text or image model to start'
          : 'Add a remote server or download a model to start chatting'}
      </Text>
      <View style={styles.setupActions}>
        <Button
          title="Add Remote Server"
          variant="outline"
          size="small"
          onPress={() => navigation.navigate('RemoteServers')}
          testID="add-server-button"
        />
        <Button
          title={hasModelsToPick ? 'Select Model' : 'Browse Models'}
          variant="outline"
          size="small"
          onPress={() => hasModelsToPick ? setPickerType('text') : navigation.navigate('ModelsTab', { initialTab: 'text' })}
          testID="browse-models-button"
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View testID="home-screen" style={styles.scrollView}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View>
              <View style={styles.headerLeft}>
                <Text style={styles.title}>{BRAND.name}</Text>
                {showIcon && <PulsatingIcon onPress={openSheet} />}
              </View>
              <Text testID="home-date" style={styles.date}>
                {sky?.sunset ? `${formatDay(new Date())} · sunset ${sky.sunset}` : formatDay(new Date())}
              </Text>
            </View>
          </View>

          <AnimatedEntry index={0} staggerMs={50} trigger={focusTrigger}>
            <View testID="home-card-assistant">
            <AssistantCard
              chip={{ label: chipLabel, remote: !!(activeTextModel && activeRemoteTextModelId), loading: loadingState.isLoading }}
              onOpenModels={() => setModelsManagerOpen(true)}
              canChat={!!(activeTextModel || activeImageModelId)}
              setup={setupCard}
              onAsk={(firstMessage) => navigation.navigate('Chat', { firstMessage })}
              recent={recentConversations.length > 0 && (
                <RecentConversations
                  conversations={recentConversations}
                  totalCount={conversations.length}
                  focusTrigger={focusTrigger}
                  onContinueChat={continueChat}
                  onDeleteConversation={handleDeleteConversation}
                  onSeeAll={() => navigation.navigate('ChatsTab')}
                />
              )}
            />
            </View>
          </AnimatedEntry>

          <AnimatedEntry index={1} staggerMs={50} trigger={focusTrigger}>
            <View testID="home-card-fieldKit">
              <FieldKitCard onOpen={(screen) => navigation.navigate(screen)} />
            </View>
          </AnimatedEntry>

          <AnimatedEntry index={2} staggerMs={50} trigger={focusTrigger}>
            <View testID="home-card-library">
              <LibraryCard
                onOpenGuides={() => navigation.navigate('GuideLibrary')}
                onOpenKiwix={() => navigation.navigate('KiwixFiles')}
                onOpenProjects={() => navigation.navigate('ProjectsTab')}
              />
            </View>
          </AnimatedEntry>

          <AnimatedEntry index={3} staggerMs={50} trigger={focusTrigger}>
            <View testID="home-card-checklists">
              <ChecklistsCard onOpen={(listId) => (listId ? navigation.navigate('Checklists', { listId }) : navigation.navigate('Checklists'))} />
            </View>
          </AnimatedEntry>

          <AnimatedEntry index={4} staggerMs={50} trigger={focusTrigger}>
            <View testID="home-card-today">
              <TodayCard sky={sky} />
            </View>
          </AnimatedEntry>

          <AnimatedEntry index={5} staggerMs={50} trigger={focusTrigger}>
            <View testID="home-card-phone">
              <PhoneCard
                focusTrigger={focusTrigger}
                downloadedModelCount={downloadedModels.length}
                imageModelCount={downloadedImageModels.length}
                imageCount={generatedImages.length}
                onOpenModels={() => navigation.navigate('ModelsTab')}
                onOpenGallery={() => navigation.navigate('Gallery')}
              />
            </View>
          </AnimatedEntry>
        </ScrollView >
      </View >

      {/* Model Picker Sheet */}
      < ModelPickerSheet
        pickerType={pickerType}
        loadingState={loadingState}
        downloadedModels={downloadedModels}
        downloadedImageModels={downloadedImageModels}
        activeModelId={activeModelId}
        activeImageModelId={activeImageModelId}
        memoryInfo={memoryInfo}
        remoteTextModels={remoteTextModels}
        remoteImageModels={remoteImageModels}
        activeRemoteTextModelId={activeRemoteTextModelId}
        activeRemoteImageModelId={activeRemoteImageModelId}
        onClose={() => setPickerType(null)}
        onSelectTextModel={handleSelectTextModel}
        onUnloadTextModel={handleUnloadTextModel}
        onSelectImageModel={handleSelectImageModel}
        onUnloadImageModel={handleUnloadImageModel}
        onSelectRemoteTextModel={handleSelectRemoteTextModel}
        onUnloadRemoteTextModel={handleUnloadRemoteTextModel}
        onSelectRemoteImageModel={handleSelectRemoteImageModel}
        onUnloadRemoteImageModel={handleUnloadRemoteImageModel}
        onBrowseModels={(tab) => {
          setPickerType(null);
          navigation.navigate('ModelsTab', { initialTab: tab });
        }}
        onAddServer={() => navigation.navigate('RemoteServers')}
      />

      {/* Collapsed Models control: manager sheet + per-type pickers */}
      <ModelsManagerSheet
        visible={modelsManagerOpen}
        onClose={() => setModelsManagerOpen(false)}
        onClosed={runPendingAfterClose}
        labels={modelLabels}
        remote={{ text: !!activeRemoteTextModelId, image: !!activeRemoteImageModelId }}
        loadingState={loadingState}
        isEjecting={isEjecting}
        hasActiveModel={!!(activeModelId || activeImageModelId || activeRemoteTextModelId || activeRemoteImageModelId)}
        onOpenRow={openModelRow}
        onEject={() => closeManagerThen(handleEjectAll)}
      />
      <WhisperPickerSheet visible={whisperOpen} onClose={() => setWhisperOpen(false)} />
      <VoiceModelsSheet visible={voiceOpen} onClose={() => setVoiceOpen(false)} />

      {/* Full-screen model-loading overlay (animated progress + rotating tips). */}
      <LoadingOverlay loadingState={loadingState} />

      {/* Custom Alert Modal */}
      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState(hideAlert())}
      />

      <OnboardingSheet
        visible={sheetVisible}
        onClose={closeSheet}
        onStepPress={handleStepPress}
      />
    </SafeAreaView >
  );
};
