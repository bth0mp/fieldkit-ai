/**
 * RED-FLOW (integration → UI) — device 2026-07-14: when a text model FAILS to load, the active model must
 * become null EVERYWHERE (no stale selection driving the wrong settings/engine). The write is consolidated
 * in activeModelService (the one owner): set on select, on load-success, and CLEARED on load-failure.
 *
 * Drives the chat's REAL load path (initiateModelLoad, what a message runs over activeModelService.loadTextModel)
 * over a llama boundary scripted to fail every init attempt, then asserts the store invariant (activeModelId
 * null), the failure alert the user sees, AND the UI outcome (the Models screen's "Your models" lists the model
 * with no "In use" and no Unload). RED before the fix: the failed load left activeModelId at its prior value, so
 * the list still showed a model in use + the wrong settings.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));

describe('load failure clears the active model (rendered) — device 2026-07-14', () => {
  it('a text model that fails to load leaves activeModelId null and the Models list showing no model in use', async () => {
    const h = await setupChatScreen({ engine: 'llama', platform: 'android' }); // model 'm' loaded, active
    const React = require('react');
    const { activeModelService } = require('../../../src/services/activeModelService');
    const { initiateModelLoad } = require('../../../src/screens/ChatScreen/useChatModelActions');
    const { YourModels } = require('../../../src/screens/ModelsScreen/YourModels');

    // Pre-condition: 'm' is the active loaded model.
    expect(h.useAppStore.getState().activeModelId).toBe('m');

    // Now a reload FAILS on every backend (corrupt file / unsupported arch).
    await activeModelService.unloadTextModel(true);
    h.boundary.llama!.scriptInitFailure();
    const alerts: { title: string }[] = [];
    const deps = {
      activeModel: h.useAppStore.getState().downloadedModels.find((m: { id: string }) => m.id === 'm'), activeModelId: 'm',
      activeConversationId: null, isStreaming: false, settings: { showGenerationDetails: false },
      clearStreamingMessage: () => {}, createConversation: () => 'c', addMessage: () => {}, setIsModelLoading: () => {},
      setLoadingModel: () => {}, setSupportsVision: () => {}, setAlertState: (a: { title: string }) => { alerts.push(a); },
      modelLoadStartTimeRef: { current: null },
    };
    const outcome = await initiateModelLoad(deps, false); // real load path fails → the chat alerts

    // Invariant: the active model is null (never a stale selection), and the user is told.
    expect(outcome.ok).toBe(false);
    expect(alerts.map(a => a.title)).toContain('Error');
    expect(h.useAppStore.getState().activeModelId).toBeNull();

    // UI outcome: the Models list still has the model, with no "In use" and no Unload (the user sees no active model).
    const v = h.rtl.render(React.createElement(YourModels, { kind: 'text', onChosen: () => {}, onError: () => {} }));
    await h.rtl.waitFor(() => { expect(v.queryAllByTestId('model-item').length).toBe(1); });
    expect(v.queryByText('In use')).toBeNull();
    expect(v.queryByLabelText('Unload Test Model')).toBeNull();
    expect(v.getByLabelText('Use Test Model')).toBeTruthy();
  }, 30000);
});
