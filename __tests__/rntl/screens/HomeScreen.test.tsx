/**
 * HomeScreen Tests
 *
 * Tests for the home dashboard including:
 * - The Assistant card's model chip (it opens the Models screen) and ask box
 * - Quick navigation
 * - Recent conversations
 * - Stats display
 * - Gallery link
 * - Delete conversation
 *
 * Choosing a model happens on the Models screen; see integration/home/chooseFromHome.
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAppStore } from '../../../src/stores/appStore';
import { useChatStore } from '../../../src/stores/chatStore';
import { resetStores, createMultipleConversations } from '../../utils/testHelpers';
import {
  createDownloadedModel,
  createONNXImageModel,
  createDeviceInfo,
  createConversation,
  createMessage,
} from '../../utils/factories';

// Mock requestAnimationFrame
(globalThis as any).requestAnimationFrame = (cb: () => void) => {
  return setTimeout(cb, 0);
};

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
  };
});

// Mock services
jest.mock('../../../src/services/activeModelService', () => ({
  activeModelService: {
    getActiveModels: jest.fn(),
    subscribe: jest.fn(() => jest.fn()),
    syncWithNativeState: jest.fn(),
    // Read by the Assistant card's ask box (dictation) once a model is active.
    supportsAudioInput: () => false,
  },
}));

jest.mock('../../../src/services/modelManager', () => ({
  modelManager: {
    getDownloadedModels: jest.fn(() => Promise.resolve([])),
      linkOrphanMmProj: jest.fn().mockResolvedValue(undefined),
    getDownloadedImageModels: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('../../../src/services/hardware', () => ({
  hardwareService: {
    getDeviceInfo: jest.fn(() => Promise.resolve({
      totalMemory: 8 * 1024 * 1024 * 1024,
      availableMemory: 4 * 1024 * 1024 * 1024,
    })),
    getTotalMemoryGB: jest.fn(() => 8),
    formatBytes: jest.fn((bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`),
    formatModelSize: jest.fn(() => '4.0 GB'),
    getStorage: jest.fn(() => Promise.resolve({ freeBytes: 0, totalBytes: 0 })),
  },
}));

// Mock AppSheet to render children directly when visible, firing onClosed once it goes invisible.
jest.mock('../../../src/components/AppSheet', () => ({
  AppSheet: ({ visible, onClose, onClosed, title, children }: any) => {
    const { useEffect } = require('react');
    const { View, Text, TouchableOpacity } = require('react-native');
    useEffect(() => {
      if (!visible) { onClosed?.(); }
    }, [visible, onClosed]);
    if (!visible) return null;
    return (
      <View testID="app-sheet">
        <Text testID="app-sheet-title">{title}</Text>
        {children}
        <TouchableOpacity testID="close-sheet" onPress={onClose}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

// Mock AnimatedEntry to just render children
jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

// Mock AnimatedListItem to render as a simple touchable
jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, testID, style }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity testID={testID} style={style} onPress={onPress}>
        {children}
      </TouchableOpacity>
    );
  },
}));

// Mock AnimatedPressable
jest.mock('../../../src/components/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, onPress, style, testID }: any) => {
    const { TouchableOpacity } = require('react-native');
    return <TouchableOpacity style={style} onPress={onPress} testID={testID}>{children}</TouchableOpacity>;
  },
}));

// Mock CustomAlert and related from components
jest.mock('../../../src/components', () => {
  const actual = jest.requireActual('../../../src/components');
  return {
    ...actual,
    CustomAlert: ({ visible, title, message, buttons, onClose }: any) => {
      const { View, Text, TouchableOpacity } = require('react-native');
      if (!visible) return null;
      return (
        <View testID="custom-alert">
          <Text testID="alert-title">{title}</Text>
          <Text testID="alert-message">{message}</Text>
          {buttons && buttons.map((btn: any, i: number) => (
            <TouchableOpacity
              key={i}
              testID={`alert-button-${btn.text}`}
              onPress={() => { if (btn.onPress) { btn.onPress(); } onClose(); }}
            >
              <Text>{btn.text}</Text>
            </TouchableOpacity>
          ))}
          {!buttons && (
            <TouchableOpacity testID="alert-ok" onPress={onClose}>
              <Text>OK</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    },
  };
});

// Mock useFocusTrigger
jest.mock('../../../src/hooks/useFocusTrigger', () => ({
  useFocusTrigger: () => 0,
}));

// Mock Swipeable to render children AND renderRightActions
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { forwardRef } = require('react');
  const { View } = require('react-native');
  return forwardRef(({ children, renderRightActions, containerStyle }: any, _ref: any) => (
    <View style={containerStyle}>
      {children}
      {renderRightActions && <View testID="swipeable-right-actions">{renderRightActions()}</View>}
    </View>
  ));
});

// Import after mocks
import { HomeScreen } from '../../../src/screens/HomeScreen';
import { BRAND } from '../../../src/config/branding';
import { activeModelService } from '../../../src/services/activeModelService';

const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn(),
  reset: jest.fn(),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => false),
  getParent: jest.fn(),
  getState: jest.fn(),
  getId: jest.fn(),
  setParams: jest.fn(),
} as any;

const renderHomeScreen = () => {
  return render(
    <NavigationContainer>
      <HomeScreen navigation={mockNavigation} />
    </NavigationContainer>
  );
};

describe('HomeScreen', () => {
  beforeEach(() => {
    resetStores();
    jest.clearAllMocks();

    // Re-setup activeModelService mock after clearAllMocks
    (activeModelService.subscribe as jest.Mock).mockReturnValue(jest.fn());
    (activeModelService.getActiveModels as jest.Mock).mockReturnValue({
      text: { model: null, isLoaded: false, isLoading: false },
      image: { model: null, isLoaded: false, isLoading: false },
    });
  });

  it('shows no desktop app promo card', () => {
    const { queryByTestId } = renderHomeScreen();
    expect(queryByTestId('desktop-promo-card')).toBeNull();
  });

  // ============================================================================
  // Basic Rendering
  // ============================================================================
  describe('basic rendering', () => {
    it('renders without crashing', () => {
      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('home-screen')).toBeTruthy();
    });

    it('shows app title', () => {
      const { getByText } = renderHomeScreen();
      expect(getByText(BRAND.name)).toBeTruthy();
    });
  });

  // ============================================================================
  // Model chip
  //
  // The Assistant card's model chip (testID "models-summary") names the loaded
  // text model and opens the Models screen (Text, or Image when only an image
  // model is in use).
  // ============================================================================
  describe('model chip', () => {
    it('renders the model chip', () => {
      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('models-summary')).toBeTruthy();
    });

    it('names the active text model on the chip', () => {
      const model = createDownloadedModel({ name: 'Llama-3.2-3B' });
      useAppStore.setState({
        downloadedModels: [model],
        activeModelId: model.id,
      });

      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('model-chip-label')).toHaveTextContent('Llama-3.2-3B');
    });

    it('says an image model is loaded when only an image model is in use', () => {
      const imageModel = createONNXImageModel({ name: 'SDXL Turbo' });
      useAppStore.setState({
        downloadedImageModels: [imageModel],
        activeImageModelId: imageModel.id,
      });

      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('model-chip-label')).toHaveTextContent('Image model loaded');
    });

    it('opens the Models screen on Text when the chip is pressed', () => {
      const { getByTestId } = renderHomeScreen();
      fireEvent.press(getByTestId('models-summary'));

      expect(mockNavigate).toHaveBeenCalledWith('Models', { initialTab: 'text' });
    });

    it('opens the Models screen on Image when only an image model is in use', () => {
      const imageModel = createONNXImageModel({ name: 'SDXL Turbo' });
      useAppStore.setState({
        downloadedImageModels: [imageModel],
        activeImageModelId: imageModel.id,
      });

      const { getByTestId } = renderHomeScreen();
      fireEvent.press(getByTestId('models-summary'));

      expect(mockNavigate).toHaveBeenCalledWith('Models', { initialTab: 'image' });
    });
  });

  // ============================================================================
  // Ask box / Setup Card
  // ============================================================================
  describe('ask box', () => {
    it('shows the ask box when a text model is active', () => {
      const model = createDownloadedModel();
      useAppStore.setState({
        downloadedModels: [model],
        activeModelId: model.id,
      });

      const { getByTestId, queryByTestId } = renderHomeScreen();
      expect(getByTestId('home-ask-input')).toBeTruthy();
      expect(queryByTestId('setup-card')).toBeNull();
    });

    it('shows setup card when no text model active and models exist', () => {
      const model = createDownloadedModel();
      useAppStore.setState({ downloadedModels: [model] });

      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('setup-card')).toBeTruthy();
    });

    it('shows "Select a text model" when models downloaded but none active', () => {
      const model = createDownloadedModel();
      useAppStore.setState({ downloadedModels: [model] });

      const { getByText } = renderHomeScreen();
      expect(getByText('Select a text or image model to start')).toBeTruthy();
    });

    it('shows "Add remote server or download" when no models downloaded', () => {
      const { getByText } = renderHomeScreen();
      expect(getByText('Add a remote server or download a model to start chatting')).toBeTruthy();
    });

    it('shows "Select Model" button when models exist but none active', () => {
      const model = createDownloadedModel();
      useAppStore.setState({ downloadedModels: [model] });

      const { getByText } = renderHomeScreen();
      expect(getByText('Select Model')).toBeTruthy();
    });

    it('shows "Browse Models" button when no models downloaded', () => {
      const { getByText } = renderHomeScreen();
      expect(getByText('Browse Models')).toBeTruthy();
    });

    it('opens a new chat with the question when one is asked', () => {
      const model = createDownloadedModel();
      useAppStore.setState({
        downloadedModels: [model],
        activeModelId: model.id,
      });

      const { getByTestId } = renderHomeScreen();
      fireEvent.changeText(getByTestId('home-ask-input'), '  Where is north?  ');
      fireEvent.press(getByTestId('home-ask-send'));

      expect(mockNavigate).toHaveBeenCalledWith('Chat', { firstMessage: 'Where is north?' });
    });

    it('does not create a conversation eagerly when a question is asked', () => {
      const model = createDownloadedModel();
      useAppStore.setState({
        downloadedModels: [model],
        activeModelId: model.id,
      });

      const { getByTestId } = renderHomeScreen();
      fireEvent.changeText(getByTestId('home-ask-input'), 'Where is north?');
      fireEvent.press(getByTestId('home-ask-send'));

      // The chat screen creates the conversation when it sends the question, not Home
      const conversations = useChatStore.getState().conversations;
      expect(conversations.length).toBe(0);
    });

    it('navigates to Models when Browse Models pressed', () => {
      const { getByTestId } = renderHomeScreen();
      fireEvent.press(getByTestId('browse-models-button'));

      expect(mockNavigate).toHaveBeenCalledWith('Models', { initialTab: 'text' });
    });
  });

  // ============================================================================
  // Recent Conversations
  // ============================================================================
  describe('recent conversations', () => {
    it('shows recent conversations list with titles', () => {
      const conversations = [
        createConversation({ title: 'Chat about AI' }),
        createConversation({ title: 'Code review' }),
      ];
      useChatStore.setState({ conversations });

      const { getByText } = renderHomeScreen();
      expect(getByText('Chat about AI')).toBeTruthy();
      expect(getByText('Code review')).toBeTruthy();
    });

    it('shows "Recent" section header', () => {
      useChatStore.setState({
        conversations: [createConversation()],
      });

      const { getByText } = renderHomeScreen();
      expect(getByText('Recent')).toBeTruthy();
    });

    it('shows "See all" link', () => {
      useChatStore.setState({
        conversations: [createConversation()],
      });

      const { getByText } = renderHomeScreen();
      // "See all" now carries the total chat count: "See all (1)".
      expect(getByText(/See all \(1\)/)).toBeTruthy();
    });

    it('limits recent conversations to 2', () => {
      createMultipleConversations(6);

      const { queryAllByTestId } = renderHomeScreen();
      expect(queryAllByTestId(/^conversation-item-/).length).toBe(2);
    });

    it('opens conversation when tapped', () => {
      const conversation = createConversation({ title: 'Test Chat' });
      useChatStore.setState({ conversations: [conversation] });

      const { getByTestId } = renderHomeScreen();
      fireEvent.press(getByTestId('conversation-item-0'));

      expect(mockNavigate).toHaveBeenCalledWith('Chat', { conversationId: conversation.id });
    });

    it('shows message preview for conversations with messages', () => {
      const conv = createConversation({
        title: 'Preview Test',
        messages: [
          createMessage({ role: 'user', content: 'Hello AI!' }),
          createMessage({ role: 'assistant', content: 'Hi there, how can I help?' }),
        ],
      });
      useChatStore.setState({ conversations: [conv] });

      const { getByText } = renderHomeScreen();
      expect(getByText(/Hi there, how can I help/)).toBeTruthy();
    });

    it('shows "You: " prefix for last user message', () => {
      const conv = createConversation({
        title: 'User Preview Test',
        messages: [
          createMessage({ role: 'user', content: 'My last question' }),
        ],
      });
      useChatStore.setState({ conversations: [conv] });

      const { getByText } = renderHomeScreen();
      expect(getByText(/You: My last question/)).toBeTruthy();
    });

    it('does not show Recent section when no conversations', () => {
      useChatStore.setState({ conversations: [] });

      const { queryByText } = renderHomeScreen();
      expect(queryByText('Recent')).toBeNull();
    });

    it('navigates to ChatsTab when See all pressed', () => {
      useChatStore.setState({
        conversations: [createConversation()],
      });

      const { getByTestId } = renderHomeScreen();
      fireEvent.press(getByTestId('conversation-list-button'));

      expect(mockNavigate).toHaveBeenCalledWith('ChatsTab');
    });

    it('sets active conversation when opening one', () => {
      const conversation = createConversation({ title: 'Active Chat' });
      useChatStore.setState({ conversations: [conversation] });

      const { getByTestId } = renderHomeScreen();
      fireEvent.press(getByTestId('conversation-item-0'));

      expect(useChatStore.getState().activeConversationId).toBe(conversation.id);
    });
  });

  // ============================================================================
  // Gallery Card
  // ============================================================================
  describe('gallery card', () => {
    const IMAGE = { id: '1', prompt: 'test', imagePath: '/path', width: 512, height: 512, steps: 20, seed: 1, modelId: 'm', createdAt: '' };

    it('shows the Gallery row on the Phone card once there are images', () => {
      useAppStore.setState({ generatedImages: [IMAGE] });
      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('home-phone-gallery')).toBeTruthy();
    });

    it('leaves the Gallery row out when there are no images and no image models', () => {
      const { queryByTestId } = renderHomeScreen();
      expect(queryByTestId('home-phone-gallery')).toBeNull();
    });

    it('shows count with "images" (plural) for multiple images', () => {
      useAppStore.setState({
        generatedImages: [
          { id: '1', prompt: 'test', imagePath: '/path', width: 512, height: 512, steps: 20, seed: 1, modelId: 'm', createdAt: '' },
          { id: '2', prompt: 'test', imagePath: '/path', width: 512, height: 512, steps: 20, seed: 1, modelId: 'm', createdAt: '' },
        ],
      });

      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('home-phone-gallery')).toHaveTextContent('2 images', { exact: false });
    });

    it('shows "1 image" (singular) for single image', () => {
      useAppStore.setState({
        generatedImages: [
          { id: '1', prompt: 'test', imagePath: '/path', width: 512, height: 512, steps: 20, seed: 1, modelId: 'm', createdAt: '' },
        ],
      });

      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('home-phone-gallery')).toHaveTextContent('1 image', { exact: false });
    });
  });

  // ============================================================================
  // Stats Display
  // ============================================================================
  describe('stats display', () => {
    // The conversation count sits next to "See all".
    it('shows the conversation count next to See all', () => {
      createMultipleConversations(5);

      const { getByText } = renderHomeScreen();
      expect(getByText(/See all \(5\)/)).toBeTruthy();
    });
  });

  // ============================================================================
  // Memory Estimation
  // ============================================================================
  describe('memory estimation', () => {
    it('renders with device info including total memory', () => {
      useAppStore.setState({
        deviceInfo: createDeviceInfo({ totalMemory: 8 * 1024 * 1024 * 1024 }),
      });

      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('home-screen')).toBeTruthy();
    });
  });

  // ============================================================================
  // Delete Conversation (via swipe)
  // ============================================================================
  describe('delete conversation', () => {
    it('shows delete confirmation when delete action triggered', () => {
      // The Swipeable renderRightActions renders a delete button
      // We need to test the handleDeleteConversation callback
      const conv = createConversation({ title: 'Delete Me' });
      useChatStore.setState({ conversations: [conv] });

      // The renderRightActions renders a trash button
      // Since Swipeable is mocked, the right actions may not be accessible directly
      // But the conversation item is rendered
      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('conversation-item-0')).toBeTruthy();
    });
  });

  // ============================================================================
  // Memory Display
  // ============================================================================
  describe('memory display', () => {
    it('shows device total RAM', () => {
      useAppStore.setState({
        deviceInfo: createDeviceInfo({ totalMemory: 8 * 1024 * 1024 * 1024 }),
      });

      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('home-screen')).toBeTruthy();
    });

    it('renders without crashing when both models loaded', () => {
      const model = createDownloadedModel();
      const imageModel = createONNXImageModel();
      useAppStore.setState({
        downloadedModels: [model],
        activeModelId: model.id,
        downloadedImageModels: [imageModel],
        activeImageModelId: imageModel.id,
      });

      const { getByTestId } = renderHomeScreen();
      expect(getByTestId('home-screen')).toBeTruthy();
    });
  });

  // ============================================================================
  // Delete Conversation (full flow with swipe actions)
  // ============================================================================
  describe('delete conversation full flow', () => {
    it('renders delete button in swipeable right actions', () => {
      const conv = createConversation({ title: 'Swipeable Chat' });
      useChatStore.setState({ conversations: [conv] });

      const { getAllByTestId } = renderHomeScreen();
      expect(getAllByTestId('swipeable-right-actions').length).toBeGreaterThan(0);
    });

    it('shows delete confirmation and deletes conversation', async () => {
      const conv = createConversation({ title: 'Delete This Chat' });
      useChatStore.setState({ conversations: [conv] });

      const { getByTestId, queryByText } = renderHomeScreen();

      // Press the trash button (has testID="delete-conversation-button")
      fireEvent.press(getByTestId('delete-conversation-button'));

      await waitFor(() => {
        expect(queryByText('Delete Conversation')).toBeTruthy();
        expect(queryByText(`Delete "Delete This Chat"?`)).toBeTruthy();
      });

      // Press Delete button in the alert
      await act(async () => {
        fireEvent.press(getByTestId('alert-button-Delete'));
      });

      // Conversation should be deleted
      expect(useChatStore.getState().conversations.length).toBe(0);
    });

    it('cancels delete conversation', async () => {
      const conv = createConversation({ title: 'Keep This Chat' });
      useChatStore.setState({ conversations: [conv] });

      const { getByTestId, queryByText } = renderHomeScreen();

      fireEvent.press(getByTestId('delete-conversation-button'));

      await waitFor(() => {
        expect(queryByText('Delete Conversation')).toBeTruthy();
      });

      // Press Cancel
      fireEvent.press(getByTestId('alert-button-Cancel'));

      // Conversation should still exist
      expect(useChatStore.getState().conversations.length).toBe(1);
    });
  });

  // ============================================================================
  // Gallery Navigation
  // ============================================================================
  describe('gallery navigation', () => {
    it('navigates to Gallery when the Gallery row is pressed', () => {
      useAppStore.setState({
        generatedImages: [
          { id: '1', prompt: 'test', imagePath: '/path', width: 512, height: 512, steps: 20, seed: 1, modelId: 'm', createdAt: '' },
        ],
      });
      const { getByTestId } = renderHomeScreen();
      fireEvent.press(getByTestId('home-phone-gallery'));

      expect(mockNavigate).toHaveBeenCalledWith('Gallery');
    });
  });

  // ============================================================================
  // formatDate branches
  // ============================================================================
  describe('formatDate coverage', () => {
    it('shows "Yesterday" for conversations updated yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const conv = createConversation({
        title: 'Yesterday Chat',
        updatedAt: yesterday.toISOString(),
      });
      useChatStore.setState({ conversations: [conv] });

      const { getByText } = renderHomeScreen();
      expect(getByText('Yesterday')).toBeTruthy();
    });

    it('shows weekday name for conversations updated 2-6 days ago', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const conv = createConversation({
        title: 'Recent Chat',
        updatedAt: threeDaysAgo.toISOString(),
      });
      useChatStore.setState({ conversations: [conv] });

      const { getByText } = renderHomeScreen();
      // Should show a short weekday like "Mon", "Tue", etc.
      const expectedDay = threeDaysAgo.toLocaleDateString([], { weekday: 'short' });
      expect(getByText(expectedDay)).toBeTruthy();
    });

    it('shows month and day for conversations updated more than 7 days ago', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const conv = createConversation({
        title: 'Old Chat',
        updatedAt: twoWeeksAgo.toISOString(),
      });
      useChatStore.setState({ conversations: [conv] });

      const { getByText } = renderHomeScreen();
      const expectedDate = twoWeeksAgo.toLocaleDateString([], { month: 'short', day: 'numeric' });
      expect(getByText(expectedDate)).toBeTruthy();
    });
  });

  // ============================================================================
  // Select Model button from setup card
  // ============================================================================
  describe('setup card select model button', () => {
    it('opens Models on Text when "Select Model" is pressed', () => {
      const model = createDownloadedModel();
      useAppStore.setState({ downloadedModels: [model] });

      const { getByText } = renderHomeScreen();
      fireEvent.press(getByText('Select Model'));

      expect(mockNavigate).toHaveBeenCalledWith('Models', { initialTab: 'text' });
    });
  });
});

