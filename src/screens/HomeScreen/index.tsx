import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, CustomAlert, hideAlert } from '../../components';
import { AnimatedEntry } from '../../components/AnimatedEntry';
import { OnboardingSheet } from '../../components/onboarding/OnboardingSheet';
import { useOnboardingSheet } from '../../components/onboarding/useOnboardingSheet';
import { useFocusTrigger } from '../../hooks/useFocusTrigger';
import { useThemedStyles } from '../../theme';
import { createStyles } from './styles';
import { useHomeScreen, HomeScreenNavigationProp } from './hooks/useHomeScreen';
import { useHomeScreenSpotlight } from './hooks/useHomeScreenSpotlight';
import { RecentConversations } from './components/RecentConversations';
import { AssistantCard } from './cards/AssistantCard';
import { DownloadsCard } from './cards/DownloadsCard';
import { FieldKitCard } from './cards/FieldKitCard';
import { LibraryCard } from './cards/LibraryCard';
import { ChecklistsCard } from './cards/ChecklistsCard';
import { TodayCard } from './cards/TodayCard';
import { PhoneCard } from './cards/PhoneCard';
import { useTodaySky } from './hooks/useTodaySky';
import { HomeHeader } from './HomeHeader';
import { useModelLoadingState } from '../../hooks/useModelLoadingState';
import { shownCards, useHomeLayoutStore, type HomeCardId } from '../../features/home/homeLayout';

/**
 * Scrolled further than SLIM_AFTER (px), the header drops its date line and Offline label; it comes back only
 * once the page is back above FULL_BELOW. Hiding the row grows the viewport, so one threshold could flicker.
 */
const SLIM_AFTER = 40;
const FULL_BELOW = 10;

type HomeScreenProps = {
  navigation: HomeScreenNavigationProp;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const focusTrigger = useFocusTrigger();
  const styles = useThemedStyles(createStyles);
  const { now, sky, tick } = useTodaySky();
  const [slim, setSlim] = React.useState(false);
  const { sheetVisible, openSheet, closeSheet, showIcon } = useOnboardingSheet();

  const {
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
  } = useHomeScreen(navigation);

  const { handleStepPress } = useHomeScreenSpotlight({
    navigation,
    closeSheet,
    activeImageModelId,
    downloadedImageModelsCount: downloadedImageModels.length,
  });

  // The Assistant card's model chip names the loaded text model; with only an image model it says so.
  const chipLabel = activeTextModel?.name ?? (activeImageModelId ? 'Image model loaded' : 'No model');
  const hasModelsToPick = downloadedModels.length > 0 || remoteTextModels.length > 0;
  // The Models screen opens on Text, or on Image when only an image model is in use.
  const openModels = () => navigation.navigate('Models', { initialTab: !activeTextModel && activeImageModelId ? 'image' : 'text' });
  const loading = useModelLoadingState();

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
          onPress={() => navigation.navigate('Models', { initialTab: 'text' })}
          testID="browse-models-button"
        />
      </View>
    </View>
  );

  // The cards the owner chose to show, in the order chosen. The Downloads card is not one of them: it follows
  // the Assistant card wherever that sits, and shows only while something is downloading.
  const layout = useHomeLayoutStore();
  const shown = shownCards(layout);
  const cards: Record<HomeCardId, React.ReactNode> = {
    assistant: (
      <AssistantCard
        chip={{ label: chipLabel, remote: activeTextModelIsRemote, loading: loading.text || loading.image }}
        onOpenModels={openModels}
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
    ),
    fieldKit: <FieldKitCard onOpen={(screen) => navigation.navigate(screen)} />,
    library: (
      <LibraryCard
        onOpenGuides={() => navigation.navigate('GuideLibrary')}
        onOpenKiwix={() => navigation.navigate('KiwixFiles')}
        onOpenProjects={() => navigation.navigate('Projects')}
      />
    ),
    checklists: (
      <ChecklistsCard
        onOpen={(listId) => (listId ? navigation.navigate('Checklists', { listId }) : navigation.navigate('Checklists'))}
      />
    ),
    today: <TodayCard sky={sky} />,
    phone: (
      <PhoneCard
        refreshKey={tick}
        downloadedModelCount={downloadedModels.length}
        imageModelCount={downloadedImageModels.length}
        imageCount={generatedImages.length}
        onOpenModels={() => navigation.navigate('Models')}
        onOpenGallery={() => navigation.navigate('Gallery')}
      />
    ),
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View testID="home-screen" style={styles.scrollView}>
        <HomeHeader now={now} sunset={sky?.sunset ?? null} slim={slim} showIcon={showIcon} onOpenOnboarding={openSheet} onOpenSearch={() => navigation.navigate('HomeSearch')} />
        <ScrollView
          testID="home-scroll"
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            setSlim((was) => (was ? y >= FULL_BELOW : y > SLIM_AFTER));
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >

          {shown.map((id, index) => (
            <React.Fragment key={id}>
              <AnimatedEntry index={index} staggerMs={50} trigger={focusTrigger}>
                <View testID={`home-card-${id}`}>{cards[id]}</View>
              </AnimatedEntry>
              {id === 'assistant' && <DownloadsCard onOpen={(screen) => navigation.navigate(screen)} />}
            </React.Fragment>
          ))}

          <TouchableOpacity
            testID="home-edit"
            style={styles.editLink}
            onPress={() => navigation.navigate('EditHome')}
            accessibilityRole="button"
            accessibilityLabel="Edit home"
          >
            <Text style={styles.editLinkText}>Edit home</Text>
          </TouchableOpacity>
        </ScrollView>
      </View >

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
