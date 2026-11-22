/**
 * T097 (checklist Area 14, rendered) — Home with a remote model active and no local text models: the model chip
 * names the remote model and marks it as remote, so Home never reads as "no model" next to a working chat.
 *
 * DEVICE FINDING (DEVICE_TEST_FINDINGS.md, UX FINDINGS): "'Text says 0' on home while a remote model is
 * active + selected. Likely '0 local text models' (correct literal) but reads as a desync next to an active
 * remote model. Confirm the chat works despite the 0." Also B18: a remote model can be active with no local
 * models present.
 *
 * PRODUCT-CORRECT OUTCOME: with a remote text model active and ZERO local text models, the Assistant card's model
 * chip reads the remote model's name ("llama-3-8b"), not "No model", and shows the server icon that says it runs
 * on a remote server. The old per-type local-download count is gone from Home, so there is no "0" to misread.
 *
 * ARRIVAL IS REAL (not seeded state-under-test): a remote model becomes active the way a user reaches it —
 *   1. On the REAL RemoteServersScreen: tap "Add Server", type name + endpoint, tap "Test Connection". The
 *      real addServer + testConnection run over a faked global.fetch answering /v1/models (the LAN boundary,
 *      exactly as T046). testConnection populates the REAL useRemoteServerStore.discoveredModels.
 *   2. Tap the modal's "Add Server" to persist the connected server.
 *   3. Mount the REAL HomeScreen (shares the same real store). Its setup card now offers "Select Model"
 *      (remoteTextModels > 0). It opens the Models screen; its real "Your models" list renders the discovered
 *      "remote-model-item".
 *   4. Tap the remote model → the real chooseRemoteTextModel → remoteServerManager.setActiveRemoteTextModel
 *      sets activeServerId + activeRemoteTextModelId in the real store. NO store.setState of the tested state.
 *
 * Boundary faked: ONLY global.fetch (the network/LAN transport) + the native leaves via installNativeBoundary.
 * Everything we own — both screens, useHomeScreen, useActiveTextModel, remoteServerStore/manager, the picker —
 * runs for real. Assertion is on the rendered model chip.
 *
 * Falsify: drop the remote-model-select gesture → no remote model active → the chip reads "No model" with no
 * server icon → the pinned assertions fail.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('T097 (rendered) — Home with a remote model active names it on the model chip', () => {
  const setup = (opts: { selectRemoteModel: boolean }) => {
    installNativeBoundary();

    const React = require('react');
    const rtl = requireRTL();
    const { RemoteServersScreen } = require('../../../src/screens/RemoteServersScreen');
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { useRemoteServerStore, useAppStore } = require('../../../src/stores');

    // Fresh remote store (no servers) + ZERO local text models — the exact device precondition (0 local).
    useRemoteServerStore.setState({ servers: [], serverHealth: {}, discoveredModels: {}, activeServerId: null, activeRemoteTextModelId: null, activeRemoteImageModelId: null });
    useAppStore.setState({ downloadedModels: [], activeModelId: null, downloadedImageModels: [], activeImageModelId: null });

    // LAN boundary: a reachable OpenAI-compatible server answering /v1/models with one text model (as T046).
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
      if (String(url).includes('/v1/models')) {
        return { ok: true, status: 200, json: async () => ({ object: 'list', data: [{ id: 'llama-3-8b', object: 'model', owned_by: 'local' }] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const nav = { navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} };
    return { React, rtl, RemoteServersScreen, HomeScreen, useRemoteServerStore, useAppStore, nav, opts };
  };

  // Arrive at "a remote server is connected + its models discovered" through the REAL Add-Server UI (T046 flow).
  const connectServerViaUI = async (env: ReturnType<typeof setup>) => {
    const { React, rtl, RemoteServersScreen, nav } = env;
    const srv = rtl.render(React.createElement(RemoteServersScreen, { navigation: nav }));
    rtl.fireEvent.press(srv.getByText('Add Server'));
    rtl.fireEvent.changeText(await rtl.waitFor(() => srv.getByPlaceholderText('e.g., Ollama on my laptop')), 'My LM Studio');
    rtl.fireEvent.changeText(srv.getByPlaceholderText('http://192.168.1.50:7878'), 'http://localhost:1234');
    rtl.fireEvent.press(srv.getByText('Test Connection'));
    await rtl.waitFor(() => { expect(srv.queryByText(/Connected \(/)).not.toBeNull(); }, { timeout: 4000 });
    const addButtons = srv.getAllByText('Add Server');
    rtl.fireEvent.press(addButtons[addButtons.length - 1]);
    await rtl.waitFor(() => { expect(srv.queryByText('My LM Studio')).not.toBeNull(); }, { timeout: 4000 });
    srv.unmount();
  };

  it('names the remote model on the chip and marks it remote, with no local text models', async () => {
    const env = setup({ selectRemoteModel: true });
    const { React, rtl, HomeScreen, useRemoteServerStore, nav } = env;

    await connectServerViaUI(env);

    // Mount the REAL Home screen (shares the real remote store — the connected server's models are discovered).
    const home = rtl.render(React.createElement(HomeScreen, { navigation: nav }));

    // The setup card offers "Select Model" once remoteTextModels > 0; it opens the Models screen, whose "Your models"
    // list is mounted here beside Home (the navigation stub goes nowhere).
    await rtl.waitFor(() => { expect(home.getByText('Select Model')).toBeTruthy(); }, { timeout: 4000 });
    const { YourModels } = require('../../../src/screens/ModelsScreen/YourModels');
    const list = rtl.render(React.createElement(YourModels, { kind: 'text', onChosen: () => {}, onError: () => {} }));

    // Tap the discovered remote model → real chooseRemoteTextModel → setActiveRemoteTextModel.
    rtl.fireEvent.press(await rtl.waitFor(() => list.getByTestId('remote-model-item'), { timeout: 4000 }));

    // The real store now reports a remote model active (EMERGENT from the gesture, not setState).
    await rtl.waitFor(() => { expect(useRemoteServerStore.getState().activeRemoteTextModelId).toBe('llama-3-8b'); }, { timeout: 4000 });

    // ── Assert the rendered model chip: the remote model's name, with the server icon ──
    await rtl.waitFor(() => { expect(home.getByTestId('model-chip-label')).toHaveTextContent('llama-3-8b'); }, { timeout: 4000 });
    expect(home.getByTestId('model-chip-remote')).toBeTruthy();

    list.unmount();
    home.unmount();
  });
});
