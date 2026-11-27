/**
 * useHomeScreen Hook Unit Tests
 *
 * Tests for the HomeScreen orchestration hook covering:
 * - continueChat navigation
 * - handleDeleteConversation alert flow
 * - activeTextModel computation
 * - remoteTextModels listing
 */

import { renderHook, act } from '@testing-library/react-native';

// ============================================================================
// Service mocks
// ============================================================================
jest.mock('../../../src/services', () => ({
  modelManager: {
    getDownloadedModels: jest.fn().mockResolvedValue([]),
    getDownloadedImageModels: jest.fn().mockResolvedValue([]),
    linkOrphanMmProj: jest.fn().mockResolvedValue(undefined),
  },
  hardwareService: {
    getDeviceInfo: jest.fn().mockResolvedValue({ deviceName: 'TestPhone' }),
  },
  activeModelService: {
    syncWithNativeState: jest.fn(),
    getResourceUsage: jest.fn().mockResolvedValue({ totalMemory: 8000, usedMemory: 2000, availableMemory: 6000 }),
    subscribe: jest.fn(() => jest.fn()),
    unloadAllModels: jest.fn().mockResolvedValue({ textUnloaded: true, imageUnloaded: false }),
  },
  remoteServerManager: {
    setActiveRemoteTextModel: jest.fn().mockResolvedValue(undefined),
    setActiveRemoteImageModel: jest.fn().mockResolvedValue(undefined),
    clearActiveRemoteModel: jest.fn(),
    addServer: jest.fn().mockResolvedValue({ id: 'mock-id', name: 'mock', endpoint: 'http://mock' }),
    updateServer: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue({ success: true }),
  },
  ResourceUsage: {},
}));

jest.mock('../../../src/components', () => ({
  initialAlertState: { visible: false, title: '', message: '', buttons: [] },
  showAlert: jest.fn((title, message, buttons) => ({ visible: true, title, message, buttons: buttons || [] })),
  hideAlert: jest.fn(() => ({ visible: false, title: '', message: '', buttons: [] })),
}));

// ============================================================================
// Store mocks
// ============================================================================
const mockCreateConversation = jest.fn(() => 'conv-new');
const mockSetActiveConversation = jest.fn();
const mockDeleteChat = jest.fn((_id: string) => Promise.resolve());
jest.mock('../../../src/services/chatDeletion', () => ({
  ...jest.requireActual('../../../src/services/chatDeletion'),
  deleteChat: (id: string) => mockDeleteChat(id),
}));


jest.mock('../../../src/stores', () => ({
  useAppStore: jest.fn((selector?: any) => {
    const state = {
      downloadedModels: [],
      setDownloadedModels: jest.fn(),
      activeModelId: null,
      setActiveModelId: jest.fn(),
      downloadedImageModels: [],
      setDownloadedImageModels: jest.fn(),
      activeImageModelId: null,
      setActiveImageModelId: jest.fn(),
      deviceInfo: { deviceName: 'TestPhone' },
      setDeviceInfo: jest.fn(),
      generatedImages: [],
      settings: { contextLength: 4096 },
    };
    return selector ? selector(state) : state;
  }),
  useChatStore: jest.fn(() => ({
    conversations: [],
    createConversation: mockCreateConversation,
    setActiveConversation: mockSetActiveConversation,
  })),
  useRemoteServerStore: jest.fn((selector?: any) => {
    const state = {
      servers: [],
      discoveredModels: {},
      activeRemoteTextModelId: null,
      activeRemoteImageModelId: null,
      activeServerId: null,
    };
    return selector ? selector(state) : state;
  }),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { useHomeScreen } from '../../../src/screens/HomeScreen/hooks/useHomeScreen';
import { useAppStore, useChatStore, useRemoteServerStore } from '../../../src/stores';
import { showAlert, hideAlert } from '../../../src/components';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate } as any;

describe('useHomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRemoteServerStore as unknown as jest.Mock).mockImplementation((selector?: any) => {
      const state = {
        servers: [],
        discoveredModels: {},
        activeRemoteTextModelId: null,
        activeRemoteImageModelId: null,
        activeServerId: null,
      };
      return selector ? selector(state) : state;
    });
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      conversations: [],
      createConversation: mockCreateConversation,
      setActiveConversation: mockSetActiveConversation,
    });
    (useAppStore as unknown as jest.Mock).mockImplementation((sel?: any) => {
      const st = {
        downloadedModels: [],
        setDownloadedModels: jest.fn(),
        activeModelId: null,
        setActiveModelId: jest.fn(),
        downloadedImageModels: [],
        setDownloadedImageModels: jest.fn(),
        activeImageModelId: null,
        setActiveImageModelId: jest.fn(),
        deviceInfo: { deviceName: 'TestPhone' },
        setDeviceInfo: jest.fn(),
        generatedImages: [],
        settings: { contextLength: 4096 },
      };
      return sel ? sel(st) : st;
    });
  });

  // ==========================================================================
  // Navigation
  // ==========================================================================
  describe('continueChat', () => {
    it('sets active conversation and navigates', () => {
      const { result } = renderHook(() => useHomeScreen(mockNavigation));
      act(() => { result.current.continueChat('conv-123'); });
      expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-123');
      expect(mockNavigate).toHaveBeenCalledWith('Chat', { conversationId: 'conv-123' });
    });
  });

  // ==========================================================================
  // handleDeleteConversation
  // ==========================================================================
  describe('handleDeleteConversation', () => {
    it('shows delete confirmation alert', () => {
      const { result } = renderHook(() => useHomeScreen(mockNavigation));
      const conversation = { id: 'conv-1', title: 'My Chat' } as any;
      act(() => { result.current.handleDeleteConversation(conversation); });
      expect(showAlert).toHaveBeenCalledWith(
        'Delete Chat',
        expect.stringContaining('My Chat'),
        expect.any(Array),
      );
    });

    it('deletes conversation when confirmed', () => {
      const { result } = renderHook(() => useHomeScreen(mockNavigation));
      const conversation = { id: 'conv-1', title: 'My Chat' } as any;
      act(() => { result.current.handleDeleteConversation(conversation); });
      const buttons = (showAlert as jest.Mock).mock.calls[0][2];
      const deleteBtn = buttons.find((b: any) => b.text === 'Delete');
      act(() => { deleteBtn.onPress(); });
      expect(mockDeleteChat).toHaveBeenCalledWith('conv-1');
      expect(hideAlert).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Computed values
  // ==========================================================================
  describe('activeTextModel computation', () => {
    it('returns local model when active', () => {
      const localModel = { id: 'local-1', name: 'Local Llama' } as any;
      (useAppStore as unknown as jest.Mock).mockImplementation((sel?: any) => { const st = {
        downloadedModels: [localModel],
        setDownloadedModels: jest.fn(),
        activeModelId: 'local-1',
        setActiveModelId: jest.fn(),
        downloadedImageModels: [], setDownloadedImageModels: jest.fn(),
        activeImageModelId: null, setActiveImageModelId: jest.fn(),
        deviceInfo: null, setDeviceInfo: jest.fn(),
        generatedImages: [], settings: { contextLength: 4096 },
      }; return sel ? sel(st) : st; });
      const { result } = renderHook(() => useHomeScreen(mockNavigation));
      expect(result.current.activeTextModel).toEqual(localModel);
    });

    it('returns remote text model when no local model', () => {
      const remoteModel = { id: 'remote-1', serverId: 'server-1', name: 'Remote', capabilities: { supportsVision: false } } as any;
      (useRemoteServerStore as unknown as jest.Mock).mockImplementation((sel?: any) => { const st = {
        servers: [{ id: 'server-1' }],
        discoveredModels: { 'server-1': [remoteModel] },
        activeRemoteTextModelId: 'remote-1',
        activeRemoteImageModelId: null,
        activeServerId: 'server-1',
      }; return sel ? sel(st) : st; });
      const { result } = renderHook(() => useHomeScreen(mockNavigation));
      expect(result.current.activeTextModel).toEqual(remoteModel);
    });

    it('returns null when no active model', () => {
      const { result } = renderHook(() => useHomeScreen(mockNavigation));
      expect(result.current.activeTextModel).toBeNull();
    });
  });

  describe('remoteTextModels', () => {
    it('includes all remote models (including VL) in remoteTextModels', () => {
      const textModel = { id: 't1', serverId: 's1', name: 'Text', capabilities: { supportsVision: false } } as any;
      const vlModel = { id: 'i1', serverId: 's1', name: 'Vision', capabilities: { supportsVision: true } } as any;
      (useRemoteServerStore as unknown as jest.Mock).mockImplementation((sel?: any) => { const st = {
        servers: [{ id: 's1' }],
        discoveredModels: { s1: [textModel, vlModel] },
        activeRemoteTextModelId: null,
        activeRemoteImageModelId: null,
        activeServerId: null,
      }; return sel ? sel(st) : st; });
      const { result } = renderHook(() => useHomeScreen(mockNavigation));
      // All remote models (including VL) go into remoteTextModels — remote image gen not supported
      expect(result.current.remoteTextModels).toEqual([textModel, vlModel]);
    });

    it('returns empty arrays when no servers', () => {
      const { result } = renderHook(() => useHomeScreen(mockNavigation));
      expect(result.current.remoteTextModels).toEqual([]);
    });
  });
});
