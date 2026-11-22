/**
 * Max Tokens bound (rendered): the most a reply may write is bounded by the context it is written into.
 * A saved Max Tokens above the context is shown, and used, at that bound on both settings surfaces, and
 * the saved number itself is left as it was.
 *
 * Real stack: ModelSettingsScreen, GenerationSettingsModal, the app store. Device leaves only: what
 * setupChatScreen installs, and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

/** The n_predict generation would send for the saved settings: the number the sliders must agree with. */
const sentNPredict = (): number => {
  const { useAppStore } = require('../../../src/stores');
  const { buildCompletionParams } = require('../../../src/services/llmHelpers');
  const { settings } = useAppStore.getState();
  return buildCompletionParams(settings, { contextLength: settings.contextLength }).n_predict;
};

describe('Max Tokens bound (rendered)', () => {
  it('shows the Settings screen slider at the context length when a saved value is above it', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama' });
    const { useAppStore } = require('../../../src/stores');
    const { ModelSettingsScreen } = require('../../../src/screens/ModelSettingsScreen');
    useAppStore.getState().updateSettings({ contextLength: 2048, maxTokens: 8192 });

    const view = rtl.render(React.createElement(ModelSettingsScreen));
    rtl.fireEvent.press(view.getByTestId('text-generation-accordion'));

    expect(view.getByTestId('llama-max-tokens-value')).toHaveTextContent('768');
    expect(view.getByTestId('llama-max-tokens-slider').props.maximumValue).toBe(768);
    expect(sentNPredict()).toBe(768);
    expect(useAppStore.getState().settings.maxTokens).toBe(8192);
  }, 30000);

  it('shows the chat settings sheet slider at the context length when a saved value is above it', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama' });
    const { useAppStore } = require('../../../src/stores');
    const { GenerationSettingsModal } = require('../../../src/components/GenerationSettingsModal');
    useAppStore.getState().updateSettings({ contextLength: 2048, maxTokens: 8192 });

    const view = rtl.render(React.createElement(GenerationSettingsModal, { visible: true, onClose: () => {} }));
    rtl.fireEvent.press(view.getByText('TEXT GENERATION'));

    expect(view.getByTestId('setting-maxTokens-value')).toHaveTextContent('768');
    expect(view.getByTestId('setting-maxTokens-slider').props.maximumValue).toBe(768);
    expect(sentNPredict()).toBe(768);
    expect(useAppStore.getState().settings.maxTokens).toBe(8192);
  }, 30000);

  it('raises the bound with the context, and sends what the slider shows', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama' });
    const { useAppStore } = require('../../../src/stores');
    const { ModelSettingsScreen } = require('../../../src/screens/ModelSettingsScreen');
    useAppStore.getState().updateSettings({ contextLength: 16384, maxTokens: 8192 });

    const view = rtl.render(React.createElement(ModelSettingsScreen));
    rtl.fireEvent.press(view.getByTestId('text-generation-accordion'));

    expect(view.getByTestId('llama-max-tokens-value')).toHaveTextContent('6.4K');
    expect(view.getByTestId('llama-max-tokens-slider').props.maximumValue).toBe(6528);
    expect(sentNPredict()).toBe(6528);
  }, 30000);
});
