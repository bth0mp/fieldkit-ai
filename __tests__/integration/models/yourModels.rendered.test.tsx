/**
 * "Your models" on the Models screen's Text tab (rendered): the models on the phone and on remote servers sit at the
 * top of the list, in use first then newest download, each with Use (or In use and Unload). Use marks the model and
 * goes back to the screen under; it waits for a message that is still being prepared.
 *
 * Real AppNavigator, Home and Models screens, services and stores. Device leaves only: the Hugging Face and LAN
 * network at `global.fetch`, the llama engine, the phone's RAM and the connection at NetInfo.
 */
import { StackActions } from '@react-navigation/native';
import { bootHome, type ModelsAppOptions } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { createDownloadedModel } from '../../utils/factories';
import { GB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

jest.setTimeout(40000);

const TIMEOUT = { timeout: 4000 };
const EMPTY = 'No text models yet. Download one below, or add a remote server.';
const PICKS = 'Recommended for your device';
const settle = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// The harness resets modules when it boots the app, so everything of ours is required after that.
let t: Awaited<ReturnType<typeof bootHome>>;
let lan: Record<string, string[]>;
const stores = () => require('../../../src/stores');
const state = () => stores().useAppStore.getState();
const remote = () => stores().useRemoteServerStore.getState();
const press = (el: any) => t.rtl.fireEvent.press(el);
const nameOf = (el: any) => t.rtl.within(el).getAllByText(/./)[0].props.children;
const section = () => t.rtl.within(t.ui.getByTestId('your-models-text'));
const names = () => section().getAllByTestId('model-item').map(nameOf);
const routes = () => t.nav.getRootState().routes.map((r: any) => r.name);
const last = <T,>(list: T[]) => list[list.length - 1];

const OLD = { id: 'old', name: 'Old', downloadedAt: '2026-01-01T00:00:00.000Z', fileSize: 1 * GB };
const NEW = { id: 'new', name: 'New', downloadedAt: '2026-11-01T00:00:00.000Z', fileSize: 2 * GB, isVisionModel: true };
const UNDATED = { id: 'undated', name: 'Undated', downloadedAt: undefined, fileSize: 3 * GB };
const USED = { id: 'used', name: 'Used', downloadedAt: '2025-01-01T00:00:00.000Z', fileSize: 9 * GB };

async function boot(opts: Partial<ModelsAppOptions> = {}, inUse: string | null = 'used') {
  t = await bootHome({ totalGB: 12, models: [USED, NEW, OLD, UNDATED], ...opts });
  t.rtl.act(() => { stores().useAppStore.setState({ activeModelId: inUse }); });
  // LAN servers answer for the hosts in `lan`; everything else goes on to the Hugging Face fake.
  lan = {};
  const hfFetch = (global as any).fetch;
  (global as any).fetch = jest.fn(async (url: string, init?: unknown) => {
    const host = Object.keys(lan).find(h => String(url).startsWith(h));
    if (!host) return hfFetch(url, init);
    if (!String(url).includes('/v1/models')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ object: 'list', data: lan[host].map(id => ({ id, object: 'model', owned_by: 'local' })) }) };
  });
}

/** What the Text tab's delete does: unload the model if it is in use, delete its file, drop its record. */
async function deleteModel(id: string) {
  const { activeModelService } = require('../../../src/services/activeModelService');
  const { modelManager } = require('../../../src/services/modelManager');
  await t.rtl.act(async () => {
    if (state().activeModelId === id) await activeModelService.unloadTextModel();
    await modelManager.deleteModel(id);
    state().removeDownloadedModel(id);
  });
}

const openModels = async () => {
  press(t.ui.getByTestId('home-phone-models'));
  await t.rtl.waitFor(() => expect(t.ui.queryByTestId('your-models-text') !== null).toBe(true), TIMEOUT);
};

/** Adds a server through the real Add Server screen (opened from Home), then returns to Home. */
async function addServer(name: string, host: string, models: string[]) {
  const { rtl, ui, nav } = t;
  lan[host] = models;
  rtl.act(() => { nav.navigate('RemoteServers'); });
  rtl.fireEvent.press(await rtl.waitFor(() => ui.getByText(/^Add (Another )?Server$/), TIMEOUT));
  rtl.fireEvent.changeText(await rtl.waitFor(() => ui.getByPlaceholderText('e.g., Ollama on my laptop'), TIMEOUT), name);
  rtl.fireEvent.changeText(ui.getByPlaceholderText('http://192.168.1.50:7878'), host);
  rtl.fireEvent.press(ui.getByText('Test Connection'));
  await rtl.waitFor(() => expect(ui.queryByText(/Connected \(/)).not.toBeNull(), TIMEOUT);
  const buttons = ui.getAllByText('Add Server');
  rtl.fireEvent.press(last(buttons));
  await rtl.waitFor(() => expect(ui.queryByText(name)).not.toBeNull(), TIMEOUT);
  rtl.act(() => { nav.goBack(); });
  await rtl.waitFor(() => expect(ui.queryByTestId('home-screen') !== null).toBe(true), TIMEOUT);
}

afterEach(() => resetDeviceMemory());

describe('Your models on the Text tab (rendered)', () => {
  it('in use first, then newest download, records with no date last, each with size, quant, Vision and RAM hint', async () => {
    await boot();
    await openModels();
    expect(names()).toEqual(['Used', 'New', 'Old', 'Undated']);
    expect(section().getByText('~3.0 GB RAM')).toBeTruthy(); // 2 GB file x 1.5
    expect(section().getByText('~13.5 GB RAM (may not fit)')).toBeTruthy(); // 9 GB file on a 12 GB phone: over 70% of RAM
    expect(section().getByText('2.00 GB')).toBeTruthy();
    expect(section().getAllByText('Q4_K_M')).toHaveLength(4);
    expect(section().getAllByText('Vision')).toHaveLength(1);
  });

  it.each(['Use', 'the row'])('tapping %s marks the model and goes back to Home', async (what) => {
    await boot();
    await openModels();
    press(what === 'Use' ? t.ui.getByLabelText('Use New') : section().getByText('New'));
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('models-screen') === null).toBe(true), TIMEOUT);
    expect(t.ui.getByTestId('model-chip-label')).toHaveTextContent('New');
  });

  it('the row in use says In use and Unload leaves nothing in use and stays', async () => {
    await boot();
    await openModels();
    expect(section().getByText('In use')).toBeTruthy();
    expect(t.ui.queryByLabelText('Use Used')).toBeNull();
    press(t.ui.getByLabelText('Unload Used'));
    await t.rtl.waitFor(() => expect(section().queryByText('In use') === null).toBe(true), TIMEOUT);
    expect(state().activeModelId).toBeNull();
    expect(t.ui.getByTestId('models-screen')).toBeTruthy();
  });

  it('the row in use is not an accessibility group, so a screen reader reaches its Unload button', async () => {
    await boot();
    await openModels();
    const rowInUse = section().getAllByTestId('model-item')[0];
    expect(rowInUse.props.accessible).toBe(false);
    const unload = t.ui.getByLabelText('Unload Used');
    expect(unload.props.accessible).not.toBe(false);
    expect(unload.props.accessibilityRole).toBe('button');
  });

  it('remote models sit under their server with the cloud mark; Use connects; Disconnect drops', async () => {
    await boot();
    await addServer('Study PC', 'http://localhost:1234', ['llama3']);
    await openModels();
    expect(section().getByText('Study PC')).toBeTruthy();
    expect(section().getByTestId('remote-model-item-remote')).toBeTruthy();
    press(t.ui.getByLabelText('Use llama3'));
    await t.rtl.waitFor(() => expect(remote().activeRemoteTextModelId).toBe('llama3'), TIMEOUT);
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('models-screen') === null).toBe(true), TIMEOUT);
    await openModels();
    press(t.ui.getByLabelText('Disconnect llama3'));
    await t.rtl.waitFor(() => expect(remote().activeServerId === null).toBe(true), TIMEOUT);
    expect(t.ui.getByTestId('models-screen')).toBeTruthy();
  });

  it('the same model id on two servers: one row says In use', async () => {
    await boot();
    await addServer('Study PC', 'http://localhost:1234', ['llama3']);
    await addServer('Laptop', 'http://localhost:1235', ['llama3']);
    await openModels();
    press(t.ui.getAllByLabelText('Use llama3')[0]);
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('models-screen') === null).toBe(true), TIMEOUT);
    await openModels();
    expect(section().getAllByTestId('remote-model-item')).toHaveLength(2);
    expect(section().getAllByText('In use')).toHaveLength(1);
  });

  it('an offline server is left out, except its model in use', async () => {
    await boot();
    await addServer('Study PC', 'http://localhost:1234', ['x', 'z']);
    await addServer('Laptop', 'http://localhost:1235', ['y']);
    await openModels();
    press(t.ui.getByLabelText('Use x'));
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('models-screen') === null).toBe(true), TIMEOUT);
    await openModels();
    expect(section().getAllByTestId('remote-model-item').map(nameOf)).toEqual(['x', 'z', 'y']);
    const health = Object.fromEntries(remote().servers.map((s: any) => [s.id, { isHealthy: false, lastCheck: new Date().toISOString() }]));
    t.rtl.act(() => { stores().useRemoteServerStore.setState({ serverHealth: health }); });
    expect(section().getAllByTestId('remote-model-item').map(nameOf)).toEqual(['x']);
  });

  it('a server removed while the switch waits: alert, stays, earlier model still in use', async () => {
    await boot();
    await addServer('Study PC', 'http://localhost:1234', ['llama3']);
    await openModels();
    const serverId = remote().servers[0].id;
    const { generationService } = require('../../../src/services/generationService');
    const { remoteServerManager } = require('../../../src/services/remoteServerManager');
    generationService.runTurn(() => settle(300));
    press(t.ui.getByLabelText('Use llama3'));
    await t.rtl.act(() => remoteServerManager.removeServer(serverId));
    await t.rtl.waitFor(() => expect(t.ui.getByText(/Failed to connect to remote model/)).toBeTruthy(), TIMEOUT);
    expect([state().activeModelId, remote().activeServerId]).toEqual(['used', null]);
    expect(t.ui.getByTestId('models-screen')).toBeTruthy();
  });

  it('none at all: the empty text, and Add remote server opens Remote Servers', async () => {
    await boot({ models: [{ id: 'a', name: 'A' }] }, null);
    await deleteModel('a');
    await openModels();
    expect(t.ui.getByText(EMPTY)).toBeTruthy();
    press(t.ui.getByTestId('your-models-add-server'));
    await t.rtl.waitFor(() => expect(t.nav.getCurrentRoute().name).toBe('RemoteServers'), TIMEOUT);
  });

  it.each(['a search', 'a size filter', 'Trending'])('%s replaces the section; clearing it brings the section back', async (what) => {
    await boot();
    await openModels();
    const { rtl, ui } = t;
    await rtl.waitFor(() => expect(ui.getByText(PICKS)).toBeTruthy(), TIMEOUT);
    expect(ui.getByTestId('your-models-text')).toBeTruthy();
    if (what === 'a search') rtl.fireEvent.changeText(ui.getByTestId('search-input'), 'qwen');
    if (what === 'a size filter') {
      rtl.fireEvent.press(ui.getByTestId('text-filter-toggle'));
      rtl.fireEvent.press(ui.getByText(/^Size/));
      rtl.fireEvent.press(ui.getByText('1-3B'));
    }
    if (what === 'Trending') {
      rtl.fireEvent.press(ui.getByTestId('sort-pill'));
      rtl.fireEvent.press(ui.getByTestId('sort-option-trending'));
    }
    await rtl.waitFor(() => expect(ui.queryByTestId('your-models-text') === null).toBe(true), TIMEOUT);
    if (what === 'a search') rtl.fireEvent.changeText(ui.getByTestId('search-input'), '');
    if (what === 'a size filter') rtl.fireEvent.press(ui.getByText('Clear'));
    if (what === 'Trending') {
      rtl.fireEvent.press(ui.getByTestId('sort-pill'));
      rtl.fireEvent.press(ui.getByTestId('sort-option-recommended'));
    }
    await rtl.waitFor(() => expect(ui.queryByTestId('your-models-text') !== null).toBe(true), TIMEOUT);
  });

  it('offline (netInfoFake, before boot): Use still goes back', async () => {
    await boot({ hf: () => { require('../../harness/netInfoFake').netInfoFake.setConnected(false); } });
    await openModels();
    press(t.ui.getByLabelText('Use New'));
    await t.rtl.waitFor(() => expect(state().activeModelId).toBe('new'), TIMEOUT);
    await t.rtl.waitFor(() => expect(t.ui.queryByTestId('models-screen') === null).toBe(true), TIMEOUT);
    require('../../harness/netInfoFake').netInfoFake.setConnected(true);
  });

  it('follows a delete (of the model in use too), a finished download and a removed server while open', async () => {
    await boot();
    await addServer('Study PC', 'http://localhost:1234', ['llama3']);
    await openModels();
    const { remoteServerManager } = require('../../../src/services/remoteServerManager');
    await deleteModel('used');
    await deleteModel('undated');
    expect(names()).toEqual(['New', 'Old']);
    expect(state().activeModelId).toBeNull();
    t.rtl.act(() => { state().addDownloadedModel(createDownloadedModel({ id: 'fresh', name: 'Fresh', downloadedAt: '2026-11-20T00:00:00.000Z' })); });
    expect(names()).toEqual(['Fresh', 'New', 'Old']);
    expect(section().getByText('Study PC')).toBeTruthy();
    await t.rtl.act(() => remoteServerManager.removeServer(remote().servers[0].id));
    expect(section().queryByText('Study PC')).toBeNull();
  });

  it('Use and Unload are disabled while a chat model loads, and its row spins', async () => {
    await boot({ models: [{ ...USED, fileSize: 2 * GB }, NEW] });
    await openModels();
    const { activeModelService } = require('../../../src/services/activeModelService');
    t.boundary.llama!.holdNextInit();
    const load = activeModelService.loadTextModel('used');
    await t.rtl.waitFor(() => expect(section().getByTestId('model-row-loading')).toBeTruthy(), TIMEOUT);
    press(t.ui.getByLabelText('Use New'));
    press(t.ui.getByLabelText('Unload Used'));
    t.boundary.llama!.releaseInit();
    await t.rtl.act(() => load);
    await settle(300); // a press that got through would have run once the load ended
    expect(state().activeModelId).toBe('used');
    expect(t.ui.getByTestId('models-screen')).toBeTruthy();
  });

  // The next two push a second Models screen on top and act on that one.
  it('two quick taps on Use go back once', async () => {
    await boot();
    await openModels();
    t.rtl.act(() => { t.nav.dispatch(StackActions.push('Models')); });
    await t.rtl.waitFor(() => expect(routes()).toEqual(['Main', 'Models', 'Models']), TIMEOUT);
    const use = last(t.ui.getAllByLabelText('Use New'));
    press(use);
    press(use);
    await t.rtl.waitFor(() => expect(state().activeModelId).toBe('new'), TIMEOUT);
    await settle(100);
    expect(routes()).toEqual(['Main', 'Models']);
  });

  it('Use, then the back arrow before the switch ends, closes nothing more', async () => {
    await boot();
    await openModels();
    t.rtl.act(() => { t.nav.dispatch(StackActions.push('Models')); });
    await t.rtl.waitFor(() => expect(routes()).toEqual(['Main', 'Models', 'Models']), TIMEOUT);
    const { generationService } = require('../../../src/services/generationService');
    generationService.runTurn(() => settle(300)); // the switch waits for this
    press(last(t.ui.getAllByLabelText('Use New')));
    press(last(t.ui.getAllByTestId('models-back')));
    await t.rtl.waitFor(() => expect(state().activeModelId).toBe('new'), TIMEOUT);
    await settle(100);
    expect(routes()).toEqual(['Main', 'Models']);
  });

  it('a recovered model is listed', async () => {
    // The store drops a recovered record with an unknown author or quant (isSuspiciousRecoveredTextModel), so
    // the one that can be listed is recovered with both known.
    await boot({ models: [USED, { id: 'recovered_1', name: 'Recovered', author: 'bartowski' }] });
    await openModels();
    expect(names()).toContain('Recovered');
  });

  it.each([[11, null], [9, 9]])('the tour: opening Models with step %s pending leaves %s pending', async (before, after) => {
    await boot();
    const spotlight = require('../../../src/components/onboarding/spotlightState');
    spotlight.setPendingSpotlight(before);
    await openModels();
    expect(spotlight.peekPendingSpotlight()).toBe(after);
  });
});
