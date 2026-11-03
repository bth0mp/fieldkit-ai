/**
 * RENDERED INTEGRATION — the Voice tab on the Models screen: pick an offline voice, preview it, set rate and pitch.
 *
 * Real ModelsScreen (and ModelSettingsScreen for the same panel under Text to Speech), the real feature
 * bootstrap (activateFieldkitFeatures fills the voice slots), the voice panel, speechService and speechStore. Faked ONLY at the device boundary: the FieldkitSpeech native module
 * (boundary.speech), the filesystem and AppState.
 *
 * The user's view: the tab lists the voices that work without internet and nothing else, marks the one in
 * use, remembers a new choice, plays a sample, and says what to do when there is no offline voice, no speech
 * engine, or the engine failed to start.
 */
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import type { NativeBoundary, SpeechFakeOptions } from '../../harness/nativeBoundary';
import type { SpeechVoice } from '../../../src/services/speech/speechTypes';

const voice = (id: string, over: Partial<SpeechVoice> = {}): SpeechVoice => ({
  id, name: `Voice ${id}`, language: 'en-US', networkRequired: false, notInstalled: false, quality: 300, ...over,
});

const offlineA = voice('offlineA', { quality: 400 });
const offlineB = voice('offlineB', { quality: 300 });
const networkC = voice('networkC', { networkRequired: true, quality: 900 });
const missingD = voice('missingD', { notInstalled: true, quality: 800 });

const nativeError = (code: string) => Object.assign(new Error(code), { code });

/**
 * Mount the Models screen and open its Voice tab. Everything is required after the boundary is installed.
 * `arm` runs on the installed boundary before the screen mounts (e.g. to make the next init fail).
 */
async function openVoiceTab(speech?: SpeechFakeOptions, arm?: (boundary: NativeBoundary) => void) {
  const boundary = installNativeBoundary({ fs: true, speech });
  arm?.(boundary);
  const React = require('react');
  const rtl = requireRTL();
  require('../../../src/features').activateFieldkitFeatures();
  const { ModelsScreen } = require('../../../src/screens/ModelsScreen');
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
    ?? require('@react-native-async-storage/async-storage');

  const view = rtl.render(React.createElement(ModelsScreen, {}));
  const openTab = async () => {
    await rtl.waitFor(() => expect(view.getByTestId('voice-models-tab')).toBeTruthy());
    rtl.fireEvent.press(view.getByTestId('voice-models-tab'));
  };
  await openTab();
  const { within, waitFor, fireEvent, act } = rtl;
  const scroll = () => view.getByTestId('voice-panel-scroll');
  const row = (id: string) => within(scroll()).queryByTestId(`voice-row-${id}`);
  const checked = (id: string) => within(scroll()).queryByTestId(`voice-row-${id}-selected`) !== null;
  const rowIds = () => view.queryAllByTestId(/^voice-row-(?!.*-selected$)/).map(node => node.props.testID.replace('voice-row-', ''));
  return { boundary, view, within, waitFor, fireEvent, act, openTab, scroll, row, checked, rowIds, AsyncStorage };
}

const setVoiceIds = (t: Awaited<ReturnType<typeof openVoiceTab>>): string[] => t.boundary.speech!.calls.setVoice;

describe('Voice settings panel (rendered)', () => {
  it('is also the Text to Speech section of Model Settings, which scrolls on its own', async () => {
    installNativeBoundary({ fs: true, speech: { voices: [offlineA, offlineB] } });
    const React = require('react');
    const rtl = requireRTL();
    require('../../../src/features').activateFieldkitFeatures();
    const { ModelSettingsScreen } = require('../../../src/screens/ModelSettingsScreen');

    const view = rtl.render(React.createElement(ModelSettingsScreen, {}));
    rtl.fireEvent.press(await rtl.waitFor(() => view.getByTestId('tts-accordion')));

    await rtl.waitFor(() => expect(view.getByTestId('voice-row-offlineA')).toBeTruthy());
    expect(view.getByTestId('voice-row-offlineB')).toBeTruthy();
    expect(view.getByTestId('voice-preview')).toBeTruthy();
    expect(view.queryByTestId('voice-panel-scroll')).toBeNull();
  }, 30000);

  it('lists only offline voices and persists the choice', async () => {
    const t = await openVoiceTab({ voices: [offlineA, offlineB, networkC, missingD] });

    await t.waitFor(() => expect(t.row('offlineA')).not.toBeNull());
    expect(t.row('offlineB')).not.toBeNull();
    expect(t.view.queryByTestId('voice-row-networkC')).toBeNull();
    expect(t.view.queryByTestId('voice-row-missingD')).toBeNull();
    expect(t.within(t.view.getByTestId('voice-engine')).getByText('com.google.android.tts')).toBeTruthy();

    // Nothing has been chosen yet: the check is on the voice the engine is using, the best offline one.
    expect(t.checked('offlineA')).toBe(true);
    expect(t.checked('offlineB')).toBe(false);

    t.fireEvent.press(t.row('offlineB')!);
    await t.waitFor(() => expect(setVoiceIds(t).at(-1)).toBe('offlineB'));
    await t.waitFor(() => expect(t.checked('offlineB')).toBe(true));
    expect(t.checked('offlineA')).toBe(false);

    // The choice is saved, and it is still the one in use when the tab is opened again.
    await t.waitFor(async () => {
      const saved = JSON.parse((await t.AsyncStorage.getItem('local-llm-speech-storage')) ?? '{}');
      expect(saved.state?.selectedVoiceId).toBe('offlineB');
    });
    t.fireEvent.press(t.view.getByText('Text Models'));
    await t.waitFor(() => expect(t.view.queryByTestId('voice-panel-scroll')).toBeNull());
    await t.openTab();
    await t.waitFor(() => expect(t.checked('offlineB')).toBe(true));
    expect(t.checked('offlineA')).toBe(false);
    expect(setVoiceIds(t).at(-1)).toBe('offlineB');
  }, 30000);

  it('tells apart voices that share a display name by showing their ids', async () => {
    const english = 'English (United States)';
    const t = await openVoiceTab({
      voices: [
        voice('en-us-x-sfg-local', { name: english, quality: 400 }),
        voice('en-us-x-tpf-local', { name: english, quality: 300 }),
        voice('fr-fr-x-vlf-local', { name: 'French (France)', quality: 200 }),
      ],
    });

    await t.waitFor(() => expect(t.row('en-us-x-sfg-local')).not.toBeNull());
    expect(t.within(t.row('en-us-x-sfg-local')!).getByText(`${english} · en-us-x-sfg-local`)).toBeTruthy();
    expect(t.within(t.row('en-us-x-tpf-local')!).getByText(`${english} · en-us-x-tpf-local`)).toBeTruthy();
    expect(t.within(t.row('fr-fr-x-vlf-local')!).getByText('French (France)')).toBeTruthy();

    t.fireEvent.press(t.row('en-us-x-tpf-local')!);
    await t.waitFor(() => expect(t.checked('en-us-x-tpf-local')).toBe(true));
    expect(t.checked('en-us-x-sfg-local')).toBe(false);
    expect(setVoiceIds(t).at(-1)).toBe('en-us-x-tpf-local');
  }, 30000);

  it('previews the voice with the chosen rate and pitch', async () => {
    const t = await openVoiceTab({ voices: [offlineA] });
    await t.waitFor(() => expect(t.row('offlineA')).not.toBeNull());

    // Tap the value to type an exact number (the slider's own gesture for precise input).
    for (const [id, value] of [['voice-rate', '1.5'], ['voice-pitch', '0.8']]) {
      t.fireEvent.press(t.view.getByTestId(`${id}-value-button`));
      const input = t.view.getByTestId(`${id}-input`);
      t.fireEvent.changeText(input, value);
      t.fireEvent(input, 'submitEditing');
    }
    await t.waitFor(() => expect(t.view.getByTestId('voice-rate-value')).toHaveTextContent('1.5x'));
    expect(t.view.getByTestId('voice-pitch-value')).toHaveTextContent('0.8');

    t.fireEvent.press(t.view.getByTestId('voice-preview'));
    await t.waitFor(() => expect(t.boundary.speech!.module.speak).toHaveBeenCalled());
    const [text, , rate, pitch] = t.boundary.speech!.module.speak.mock.calls.at(-1)!;
    expect(text).toMatch(/sound/);
    expect([rate, pitch]).toEqual([1.5, 0.8]);
  }, 30000);

  it('offers install when no offline voice', async () => {
    const t = await openVoiceTab({ voices: [networkC, missingD] });

    await t.waitFor(() => expect(t.view.queryByText(/No offline voice is installed/)).not.toBeNull());
    expect(t.view.getByText(/only uses voices that work without internet/)).toBeTruthy();
    expect(t.view.queryByText(/not available on this device/)).toBeNull();
    expect(t.rowIds()).toEqual([]);

    t.fireEvent.press(t.view.getByTestId('voice-install'));
    await t.waitFor(() => expect(t.boundary.speech!.module.openVoiceInstaller).toHaveBeenCalled());

    // The installer put a voice on the device; coming back to the app shows it.
    t.boundary.speech!.setVoices([networkC, missingD, offlineA]);
    await t.act(async () => { t.boundary.emitAppStateChange('active'); });
    await t.waitFor(() => expect(t.row('offlineA')).not.toBeNull());
    expect(t.view.queryByText(/No offline voice is installed/)).toBeNull();
    expect(t.view.queryByTestId('voice-install')).toBeNull();
  }, 30000);

  it('no speech engine on the device: says so, with no install offer', async () => {
    const t = await openVoiceTab({ bound: false });

    await t.waitFor(() => expect(t.view.queryByText('No speech engine is installed on this device.')).not.toBeNull());
    expect(t.view.queryByText(/not available on this device/)).toBeNull();
    expect(t.view.queryByTestId('voice-install')).toBeNull();
    expect(t.rowIds()).toEqual([]);
  }, 30000);

  it('engine failed to start: says so, and Try again recovers', async () => {
    const t = await openVoiceTab({ voices: [offlineA] }, boundary => {
      boundary.speech!.module.init.mockRejectedValueOnce(nativeError('INIT_ERROR'));
    });

    await t.waitFor(() => expect(t.view.queryByTestId('voice-retry')).not.toBeNull());
    expect(t.view.queryByText('Speech is not working right now. Try again.')).not.toBeNull();
    expect(t.view.queryByText(/not available on this device/)).toBeNull();
    expect(t.rowIds()).toEqual([]);

    t.fireEvent.press(t.view.getByTestId('voice-retry'));
    await t.waitFor(() => expect(t.row('offlineA')).not.toBeNull());
    expect(t.view.queryByTestId('voice-retry')).toBeNull();
  }, 30000);

  it('module absent: says voice replies are not available, with no controls', async () => {
    const t = await openVoiceTab();

    await t.waitFor(() => expect(t.view.queryByText('Voice replies are not available on this device.')).not.toBeNull());
    expect(t.view.queryByTestId('voice-install')).toBeNull();
    expect(t.view.queryByTestId('voice-preview')).toBeNull();
    expect(t.rowIds()).toEqual([]);
  }, 30000);
});
