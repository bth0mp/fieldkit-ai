import React, { useState, useEffect } from 'react';
import { LIST_CLIPPING_PROPS } from '../constants/listClipping';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Icon from 'react-native-vector-icons/Feather';
import { AttachStep, useSpotlightTour } from 'react-native-spotlight-tour';
import { IMAGE_NEW_CHAT_STEP_INDEX, IMAGE_DRAW_STEP_INDEX } from '../components/onboarding/spotlightConfig';
import { setPendingSpotlight } from '../components/onboarding/spotlightState';
import { Button } from '../components/Button';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from '../components/CustomAlert';
import { AnimatedEntry } from '../components/AnimatedEntry';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { ChatsUnreadableNotice } from '../components/ChatsUnreadableNotice';
import { useFocusTrigger } from '../hooks/useFocusTrigger';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useChatStore, useProjectStore, useAppStore } from '../stores';
import { useActiveTextModel } from '../hooks/useActiveTextModel';
import { deleteChat, deleteChatMessage } from '../services/chatDeletion';
import { Conversation } from '../types';
import { RootStackParamList, MainTabParamList } from '../navigation/types';
type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'ChatsTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export const ChatsListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const focusTrigger = useFocusTrigger();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const conversations = useChatStore(s => s.conversations);
  const { setActiveConversation } = useChatStore.getState();
  const { getProject } = useProjectStore();
  const activeImageModelId = useAppStore(s => s.activeImageModelId);
  const onboardingChecklist = useAppStore(s => s.onboardingChecklist);
  const shownSpotlights = useAppStore(s => s.shownSpotlights);
  const { markSpotlightShown } = useAppStore.getState();
  const { modelId: activeTextModelId } = useActiveTextModel();
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const { goTo } = useSpotlightTour();

  // Reactive: image model loaded → spotlight "New Chat" button (step 14)
  useEffect(() => {
    if (
      activeImageModelId &&
      !shownSpotlights.imageNewChat &&
      !onboardingChecklist.triedImageGen
    ) {
      markSpotlightShown('imageNewChat');
      // Queue step 15 so ChatScreen picks it up when "New Chat" is tapped
      setPendingSpotlight(IMAGE_DRAW_STEP_INDEX);
      setTimeout(() => goTo(IMAGE_NEW_CHAT_STEP_INDEX), 800);
    }
  }, [activeImageModelId, shownSpotlights, onboardingChecklist.triedImageGen, markSpotlightShown, goTo]);

  const hasModels = !!activeTextModelId || !!activeImageModelId;

  const handleChatPress = (conversation: Conversation) => {
    setActiveConversation(conversation.id);
    navigation.navigate('Chat', { conversationId: conversation.id });
  };

  // With no model in use the Models screen comes first; Use there opens the new chat in its place.
  const handleNewChat = () => {
    if (hasModels) navigation.navigate('Chat', {});
    else navigation.navigate('Models', { initialTab: 'text', afterUse: 'newChat' });
  };

  const handleDeleteChat = (conversation: Conversation) => {
    setAlertState(showAlert(
      'Delete Chat',
      deleteChatMessage(conversation.title),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setAlertState(hideAlert());
            deleteChat(conversation.id).catch(() => {});
          },
        },
      ]
    ));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } 
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    
  };

  const renderRightActions = (conversation: Conversation) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => handleDeleteChat(conversation)}
    >
      <Icon name="trash-2" size={16} color={colors.error} />
    </TouchableOpacity>
  );

  const renderChat = ({ item, index }: { item: Conversation; index: number }) => {
    const project = item.projectId ? getProject(item.projectId) : null;
    const lastMessage = item.messages[item.messages.length - 1];

    return (
      <Swipeable
        renderRightActions={() => renderRightActions(item)}
        overshootRight={false}
        containerStyle={styles.swipeableContainer}
      >
        <AnimatedListItem
          index={index}
          trigger={focusTrigger}
          style={styles.chatItem}
          onPress={() => handleChatPress(item)}
          testID={`conversation-item-${index}`}
        >
          <View style={styles.chatContent}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.chatDate}>{formatDate(item.updatedAt)}</Text>
            </View>
            {lastMessage && (
              <Text style={styles.chatPreview} numberOfLines={1}>
                {lastMessage.role === 'user' ? 'You: ' : ''}{lastMessage.content}
              </Text>
            )}
            {project && (
              <View style={styles.projectBadge}>
                <Text style={styles.projectBadgeText}>{project.name}</Text>
              </View>
            )}
          </View>
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        </AnimatedListItem>
      </Swipeable>
    );
  };

  // Sort conversations by updatedAt (most recent first)
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <AttachStep index={[2, 14]}>
          <Button
            title="New"
            variant="primary"
            size="small"
            onPress={handleNewChat}
            accessibilityLabel={hasModels ? undefined : 'New chat. Opens Models'}
            icon={<Icon name="plus" size={16} color={colors.primary} />}
          />
        </AttachStep>
      </View>

      <ChatsUnreadableNotice />

      {sortedConversations.length === 0 ? (
        <View style={styles.emptyState}>
          <AnimatedEntry index={0} staggerMs={60} trigger={focusTrigger}>
            <View style={styles.emptyIcon}>
              <Icon name="message-circle" size={32} color={colors.textMuted} />
            </View>
          </AnimatedEntry>
          <AnimatedEntry index={1} staggerMs={60} trigger={focusTrigger}>
            <Text style={styles.emptyTitle}>No Chats Yet</Text>
          </AnimatedEntry>
          <AnimatedEntry index={2} staggerMs={60} trigger={focusTrigger}>
            <Text style={styles.emptyText}>
              {hasModels
                ? 'Start a new conversation to begin chatting with your local AI.'
                : 'Choose or download a model on the Models screen to start chatting.'}
            </Text>
          </AnimatedEntry>
          <AnimatedListItem
            index={3}
            staggerMs={60}
            trigger={focusTrigger}
            hapticType="impactLight"
            style={styles.emptyButton}
            onPress={handleNewChat}
            testID={hasModels ? undefined : 'chats-open-models'}
            accessibilityRole="button"
          >
            <Icon name={hasModels ? 'plus' : 'layers'} size={18} color={colors.primary} />
            <Text style={styles.emptyButtonText}>{hasModels ? 'New Chat' : 'Open Models'}</Text>
          </AnimatedListItem>
        </View>
      ) : (
        <FlatList
          {...LIST_CLIPPING_PROPS}
          data={sortedConversations}
          renderItem={renderChat}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          testID="conversation-list"
        />
      )}
      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState(hideAlert())}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  swipeableContainer: {
    overflow: 'visible' as const,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.small,
    zIndex: 1,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
  },
  list: {
    padding: SPACING.lg,
  },
  chatItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 10,
    marginBottom: SPACING.md,
    ...shadows.small,
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  chatTitle: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  chatDate: {
    ...TYPOGRAPHY.metaSmall,
    color: colors.textMuted,
  },
  chatPreview: {
    ...TYPOGRAPHY.meta,
    color: colors.textSecondary,
    marginTop: 1,
  },
  projectBadge: {
    alignSelf: 'flex-start' as const,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 4,
    marginTop: SPACING.sm - 2,
  },
  projectBadgeText: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.xxl + SPACING.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: SPACING.xl - SPACING.xs,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: SPACING.xl - SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    gap: SPACING.sm,
  },
  emptyButtonText: {
    ...TYPOGRAPHY.body,
    color: colors.primary,
  },
  deleteAction: {
    backgroundColor: colors.errorBackground,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 44,
    borderRadius: 10,
    marginBottom: SPACING.md,
    marginLeft: SPACING.sm,
  },
});
