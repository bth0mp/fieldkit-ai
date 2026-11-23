/**
 * Tab bar (rendered): the bottom bar has five places, Home, Chats, a raised round New chat button, Kit and
 * Settings. Projects and Models are no longer tabs; the Your library and Phone cards on Home open them as screens
 * with a back arrow. The New chat button opens a new chat when a text or image model is active, and otherwise
 * opens the Models screen, where Use opens the new chat.
 *
 * Real AppNavigator in a real NavigationContainer, with the real navigation library (the global jest.setup stub of
 * useNavigation is lifted here, so every screen navigates for real), and the real Home, Chats, Chat, Projects and
 * Models screens and stores. Device leaves only: installNativeBoundary (the llama engine fake, the phone's disk and
 * RAM), AsyncStorage as the phone's storage, and fetch as the network, which this phone does not have.
 */
import { installNativeBoundary, requireRTL, GB } from '../../harness/nativeBoundary';
import { createDownloadedModel } from '../../utils/factories';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
const PLACES = ['home-tab', 'chats-tab', 'new-chat-button', 'kit-tab', 'settings-tab'];

/**
 * The phone as App.tsx's boot leaves it: onboarding done and one text model downloaded (its file on the disk and
 * its saved record), none loaded. Downloading is native and can't be gestured in jest, so only this is placed.
 */
async function bootWithOneDownloadedModel() {
  const boundary = installNativeBoundary({ llama: true, fs: true });
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => { throw new TypeError('Network request failed'); });
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
    ?? require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
  const { useAppStore } = require('../../../src/stores');
  const { hardwareService } = require('../../../src/services/hardware');

  const fileName = 'ggml-small.gguf';
  const filePath = `${boundary.fs!.DocumentDirectoryPath}/models/${fileName}`;
  boundary.fs!.seedFile(filePath, 500 * 1024 * 1024);
  const model = createDownloadedModel({ id: 'm', name: 'Test Model', engine: 'llama', filePath, fileName, fileSize: 2 * GB });
  await AsyncStorage.setItem('@local_llm/downloaded_models', JSON.stringify([model]));
  await hardwareService.refreshMemoryInfo();
  useAppStore.setState({
    hasCompletedOnboarding: true,
    downloadedModels: [model],
    // The onboarding tour is not under test; its spotlights would sit over the controls.
    checklistDismissed: true,
    shownSpotlights: { input: true, voiceHint: true, imageSettings: true },
  });

  const React = require('react');
  const rtl = requireRTL();
  const { NavigationContainer } = require('@react-navigation/native');
  const { AppNavigator } = require('../../../src/navigation/AppNavigator');
  const ui = rtl.render(React.createElement(NavigationContainer, null, React.createElement(AppNavigator)));
  await rtl.waitFor(() => expect(ui.getByTestId('home-screen')).toBeTruthy(), TIMEOUT);
  return { rtl, ui };
}

describe('Tab bar (rendered)', () => {
  it('has five places with New chat in the middle, and Projects and Models open from Home with a back arrow', async () => {
    const { rtl, ui } = await bootWithOneDownloadedModel();

    // 1. Home, Chats, New chat, Kit, Settings, in that order. Projects and Models are not in the bar.
    const order = ui.root
      .findAll((n) => typeof n.type === 'string' && PLACES.includes(n.props.testID))
      .map((n) => n.props.testID);
    expect(order).toEqual(PLACES);
    for (const [id, label] of [['home-tab', 'Home'], ['chats-tab', 'Chats'], ['kit-tab', 'Kit'], ['settings-tab', 'Settings']]) {
      expect(rtl.within(ui.getByTestId(id)).getByText(label)).toBeTruthy();
    }
    expect(ui.getByLabelText('New chat')).toBe(ui.getByTestId('new-chat-button'));
    expect(ui.queryByTestId('projects-tab')).toBeNull();
    expect(ui.queryByTestId('models-tab')).toBeNull();

    // 2. With no model in use, New chat from the Chats tab opens Models (no chat yet); Use there opens the new chat
    // with its input, in the Models screen's place.
    rtl.fireEvent.press(ui.getByTestId('chats-tab'));
    await rtl.waitFor(() => expect(ui.getByTestId('chats-tab')).toBeSelected(), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('new-chat-button'));
    await rtl.waitFor(() => expect(ui.getByTestId('models-screen')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByTestId('chat-input')).toBeNull();
    rtl.fireEvent.press(await rtl.waitFor(() => ui.getByLabelText('Use Test Model'), TIMEOUT));
    await rtl.waitFor(() => expect(ui.getByTestId('chat-input')).toBeTruthy(), TIMEOUT);

    // 3. Back from that chat with its own back arrow is the Chats tab it came from; with the model now in use,
    // New chat opens a chat directly.
    rtl.fireEvent.press(rtl.within(ui.getByTestId('chat-screen')).UNSAFE_getAllByProps({ name: 'arrow-left' })[0]);
    await rtl.waitFor(() => expect(ui.queryByTestId('chat-screen')).toBeNull(), TIMEOUT);
    expect(ui.getByTestId('chats-tab')).toBeSelected();
    rtl.fireEvent.press(ui.getByTestId('new-chat-button'));
    await rtl.waitFor(() => expect(ui.getByTestId('chat-input')).toBeTruthy(), TIMEOUT);
    expect(ui.queryByTestId('models-screen')).toBeNull();

    // Back to Chats with the chat's own back arrow, then on to Home.
    rtl.fireEvent.press(rtl.within(ui.getByTestId('chat-screen')).UNSAFE_getAllByProps({ name: 'arrow-left' })[0]);
    await rtl.waitFor(() => expect(ui.queryByTestId('chat-screen')).toBeNull(), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('home-tab'));
    await rtl.waitFor(() => expect(ui.getByTestId('home-tab')).toBeSelected(), TIMEOUT);

    // 4. The Your library card's Projects row opens Projects, and its back arrow returns Home.
    rtl.fireEvent.press(ui.getByTestId('home-library-projects'));
    const projects = await rtl.waitFor(() => ui.getByTestId('projects-screen'), TIMEOUT);
    expect(rtl.within(projects).getByText('Projects')).toBeTruthy();
    rtl.fireEvent.press(ui.getByTestId('projects-back'));
    await rtl.waitFor(() => expect(ui.queryByTestId('projects-screen')).toBeNull(), TIMEOUT);
    expect(ui.getByTestId('home-tab')).toBeSelected();

    // 5. The Phone card's Models row opens Models, and its back arrow returns Home.
    rtl.fireEvent.press(ui.getByTestId('home-phone-models'));
    const models = await rtl.waitFor(() => ui.getByTestId('models-screen'), TIMEOUT);
    expect(rtl.within(models).getByText('Models')).toBeTruthy();
    rtl.fireEvent.press(ui.getByTestId('models-back'));
    await rtl.waitFor(() => expect(ui.queryByTestId('models-screen')).toBeNull(), TIMEOUT);
    expect(ui.getByTestId('home-tab')).toBeSelected();

    ui.unmount();
  }, 30000);
});
