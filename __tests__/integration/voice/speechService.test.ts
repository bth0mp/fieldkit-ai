/**
 * INTEGRATION — the speech service's state machine over the FieldkitSpeech native boundary.
 *
 * Real speechService, speechStore, speechText and the hook registry; faked only at the device boundary
 * (boundary.speech). The rendered Speak flow lives in speakFromActionMenu.rendered.test.tsx; this file
 * covers the rules a screen cannot reach: voice identity, generation handling, refresh, recovery.
 */
import { installNativeBoundary } from '../../harness/nativeBoundary';
import type { SpeechFake, SpeechFakeOptions } from '../../harness/nativeBoundary';
import type { SpeechVoice } from '../../../src/services/speech/speechTypes';

const voice = (id: string, over: Partial<SpeechVoice> = {}): SpeechVoice => ({
  id, name: 'English (US)', language: 'en-US', networkRequired: false, notInstalled: false, quality: 300, ...over,
});

const nativeError = (code: string) => Object.assign(new Error(code), { code });

/** Wait (real timers) until `cond` holds. */
async function until(cond: () => boolean, label: string, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function boot(options: SpeechFakeOptions = {}) {
  const boundary = installNativeBoundary({ speech: options });
  const { speechService } = require('../../../src/services/speech/speechService');
  const { useSpeechStore } = require('../../../src/stores/speechStore');
  const speech = boundary.speech as SpeechFake;
  const state = () => useSpeechStore.getState();
  const done = (utteranceId: string) => speech.emit('FieldkitSpeech_done', { utteranceId });
  const ids = () => speech.calls.speak.map(c => c.utteranceId);
  return { boundary, speech, service: speechService, store: useSpeechStore, state, done, ids };
}

describe('voice choice', () => {
  it('uses the best offline voice by default and never a network voice', async () => {
    const t = boot({ voices: [voice('net', { networkRequired: true, quality: 900 }), voice('a', { quality: 200 }), voice('b', { quality: 400 })] });
    await t.service.refresh();
    expect(t.speech.calls.setVoice).toEqual(['b']);
    expect(t.state().voices.map((v: SpeechVoice) => v.id)).toEqual(['a', 'b']);
    expect(t.state().phase).toBe('ready');
  });

  it('identifies voices by id: two voices share a display name', async () => {
    const t = boot({ voices: [voice('en-us-x-a', { quality: 400 }), voice('en-us-x-b', { quality: 300 })] });
    await t.service.refresh();
    await t.service.selectVoice('en-us-x-b');
    expect(t.speech.calls.setVoice).toEqual(['en-us-x-a', 'en-us-x-b']);
    expect(t.state().selectedVoiceId).toBe('en-us-x-b');

    // The choice survives a re-init: the selected id is used while it is still available.
    await t.service.refresh();
    expect(t.speech.calls.setVoice[2]).toBe('en-us-x-b');
  });

  it('falls back to the best voice when the saved one is gone, and keeps the saved id', async () => {
    const t = boot({ voices: [voice('a', { quality: 200 }), voice('b', { quality: 400 })] });
    t.state().set({ selectedVoiceId: 'uninstalled' });
    await t.service.refresh();
    expect(t.speech.calls.setVoice).toEqual(['b']);
    expect(t.state().selectedVoiceId).toBe('uninstalled');
  });

  it('refuses to select a voice that is not on the offline list', async () => {
    const t = boot({ voices: [voice('a'), voice('net', { networkRequired: true }), voice('gone', { notInstalled: true })] });
    await t.service.refresh();
    const before = t.speech.calls.setVoice.length;
    await t.service.selectVoice('net');
    await t.service.selectVoice('gone');
    await t.service.selectVoice('unknown');
    expect(t.speech.calls.setVoice.length).toBe(before);
    expect(t.state().selectedVoiceId).toBeNull();
  });
});

describe('speaking', () => {
  it('returns to ready once every chunk is done, and ignores events from an older message', async () => {
    const t = boot();
    await t.service.speakMessage({ text: 'One. Two. Three.', messageId: 'm1' });
    await until(() => t.speech.calls.speak.length === 3, 'three chunks queued');
    expect(t.state().speakingMessageId).toBe('m1');
    expect(t.state().phase).toBe('speaking');
    const first = t.ids();

    // A second message cuts the first off. The first message's late events must not finish the second.
    await t.service.speakMessage({ text: 'Four. Five.', messageId: 'm2' });
    await until(() => t.speech.calls.speak.length === 5, 'second message queued');
    first.forEach(t.done);
    expect(t.state().speakingMessageId).toBe('m2');

    const second = t.ids().slice(3);
    t.done(second[0]);
    expect(t.state().phase).toBe('speaking');
    t.done(second[1]);
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.state().phase).toBe('ready');
  });

  it('stop() is synchronous: the engine is stopped at once and the rest of the message is never queued', async () => {
    const t = boot();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    t.speech.module.speak.mockImplementationOnce(() => gate); // the first chunk is still being handed over
    const pending = t.service.speakMessage({ text: 'One. Two. Three.', messageId: 'm1' });
    await until(() => t.speech.module.speak.mock.calls.length === 1, 'first chunk in flight');

    const stops = t.speech.module.stop.mock.calls.length;
    t.service.stop();
    expect(t.speech.module.stop.mock.calls.length).toBe(stops + 1); // no await needed
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.state().phase).toBe('ready');

    release();
    await pending;
    expect(t.speech.module.speak).toHaveBeenCalledTimes(1);
    t.service.stop(); // idempotent
    expect(t.state().phase).toBe('ready');
  });

  it('an engine error event ends the message in the error phase and the next Speak starts over', async () => {
    const t = boot();
    await t.service.speakMessage({ text: 'One. Two.', messageId: 'm1' });
    await until(() => t.speech.calls.speak.length === 2, 'queued');
    t.speech.emit('FieldkitSpeech_error', { utteranceId: t.ids()[0], code: -4 });
    expect(t.state().phase).toBe('error');
    expect(t.state().speakingMessageId).toBeNull();

    const inits = t.speech.module.init.mock.calls.length;
    await t.service.speakMessage({ text: 'Again.', messageId: 'm2' });
    await until(() => t.speech.calls.speak.length === 3, 'spoke again');
    expect(t.speech.module.init.mock.calls.length).toBe(inits + 1);
    expect(t.state().phase).toBe('speaking');
  });

  it('an interruption from outside (stopped event) drops the rest of the message', async () => {
    const t = boot();
    await t.service.speakMessage({ text: 'One. Two.', messageId: 'm1' });
    await until(() => t.speech.calls.speak.length === 2, 'queued');
    t.speech.emit('FieldkitSpeech_stopped', { utteranceId: t.ids()[0], interrupted: true });
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.state().phase).toBe('ready');
  });

  it('passes the stored rate and pitch to the next utterance', async () => {
    const t = boot();
    t.service.setRate(1.5);
    t.service.setPitch(0.8);
    await t.service.speakMessage({ text: 'Hello there.', messageId: 'm1' });
    await until(() => t.speech.calls.speak.length === 1, 'queued');
    expect(t.speech.module.speak.mock.calls[0].slice(2)).toEqual([1.5, 0.8]);

    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const saved = JSON.parse(await AsyncStorage.getItem('local-llm-speech-storage'));
    expect(saved.state).toEqual({ selectedVoiceId: null, rate: 1.5, pitch: 0.8, autoSpeak: false });
  });

  it('reads the generation from the right, so a message id may contain colons', async () => {
    const t = boot();
    await t.service.speakMessage({ text: 'One.', messageId: 'conv:7:msg' });
    await until(() => t.speech.calls.speak.length === 1, 'queued');
    t.done(t.ids()[0]);
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.state().phase).toBe('ready');
  });

  it('speaks nothing for a reply that has no speakable text', async () => {
    const t = boot();
    await t.service.speakMessage({ text: '```js\nx()\n```', messageId: 'm1' });
    expect(t.speech.calls.speak).toEqual([]);
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.state().phase).toBe('ready');
  });
});

describe('recovery', () => {
  it('refresh() while speaking resets the speaking state first (native init drops queued speech)', async () => {
    const t = boot();
    await t.service.speakMessage({ text: 'One. Two.', messageId: 'm1' });
    await until(() => t.speech.calls.speak.length === 2, 'queued');
    const stale = t.ids();

    await t.service.refresh();
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.state().phase).toBe('ready');

    await t.service.speakMessage({ text: 'Fresh.', messageId: 'm2' });
    await until(() => t.speech.calls.speak.length === 3, 'queued again');
    stale.forEach(t.done); // late events from before the re-init
    expect(t.state().speakingMessageId).toBe('m2');
  });

  it('a superseded init is not an error and the next Speak re-runs init', async () => {
    const t = boot();
    t.speech.module.init.mockRejectedValueOnce(nativeError('INIT_SUPERSEDED'));
    await t.service.speakMessage({ text: 'Hello.', messageId: 'm1' });
    expect(t.state().phase).not.toBe('error');
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.speech.calls.speak).toEqual([]);

    await t.service.speakMessage({ text: 'Hello.', messageId: 'm1' });
    await until(() => t.speech.calls.speak.length === 1, 'spoke on the retry');
    expect(t.speech.module.init).toHaveBeenCalledTimes(2);
  });

  it('a failed init ends in the error phase and the next Speak re-runs init', async () => {
    const t = boot();
    t.speech.module.init.mockRejectedValueOnce(nativeError('INIT_ERROR'));
    await t.service.speakMessage({ text: 'Hello.', messageId: 'm1' });
    expect(t.state().phase).toBe('error');
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.service.canSpeak()).toBe(true);

    await t.service.speakMessage({ text: 'Hello.', messageId: 'm1' });
    await until(() => t.speech.calls.speak.length === 1, 'spoke on the retry');
  });

  it('NOT_OFFLINE stops queuing, clears the message and checks the voices again', async () => {
    const t = boot();
    await t.service.refresh();
    expect(t.speech.module.init).toHaveBeenCalledTimes(1);
    t.speech.module.speak.mockRejectedValueOnce(nativeError('NOT_OFFLINE'));

    await t.service.speakMessage({ text: 'One. Two. Three.', messageId: 'm1' });
    await until(() => t.speech.module.init.mock.calls.length === 2, 'refresh re-ran init');
    await until(() => t.state().phase === 'ready', 'settled');
    expect(t.state().speakingMessageId).toBeNull();
    expect(t.speech.module.speak).toHaveBeenCalledTimes(1); // the rest was never queued
  });

  it('comes back when the user returns from the voice installer', async () => {
    const deviceVoices = [voice('missing', { notInstalled: true })];
    const t = boot({ voices: deviceVoices });
    await t.service.speakMessage({ text: 'Hello.', messageId: 'm1' });
    expect(t.state().phase).toBe('unavailable');
    expect(t.state().needsVoiceInstall).toBe(true);
    expect(t.service.canSpeak()).toBe(false);

    await t.service.openVoiceInstaller();
    expect(t.speech.module.openVoiceInstaller).toHaveBeenCalled();

    // The installer put a voice on the device (the fake reads this list live).
    deviceVoices[0] = voice('installed');
    t.boundary.emitAppStateChange('background'); // leaving the app does nothing
    expect(t.speech.module.init).toHaveBeenCalledTimes(1);
    t.boundary.emitAppStateChange('active');
    await until(() => t.state().phase === 'ready', 'refreshed');
    expect(t.state().needsVoiceInstall).toBe(false);
    expect(t.state().voices.map((v: SpeechVoice) => v.id)).toEqual(['installed']);
    expect(t.service.canSpeak()).toBe(true);

    // Back in a healthy state, returning to the app does not re-init.
    t.boundary.emitAppStateChange('active');
    expect(t.speech.module.init).toHaveBeenCalledTimes(2);
  });

  it('no engine bound: unavailable without asking to install a voice', async () => {
    const t = boot({ bound: false });
    await t.service.speakMessage({ text: 'Hello.', messageId: 'm1' });
    expect(t.state().phase).toBe('unavailable');
    expect(t.state().needsVoiceInstall).toBe(false);
    expect(t.state().enginePackage).toBeNull();
  });

  it('setAutoSpeak(true) checks the engine; false only stores the preference', async () => {
    const t = boot();
    t.service.setAutoSpeak(false);
    expect(t.speech.module.init).not.toHaveBeenCalled();
    t.service.setAutoSpeak(true);
    await until(() => t.state().phase === 'ready', 'refreshed');
    expect(t.speech.module.init).toHaveBeenCalledTimes(1);
    expect(t.state().autoSpeak).toBe(true);
    expect(t.state().enginePackage).toBe('com.google.android.tts');
  });
});

describe('without the native module', () => {
  it('cannot speak, and every call is a harmless no-op', async () => {
    const t = boot();
    delete require('react-native').NativeModules.FieldkitSpeech;
    expect(t.service.canSpeak()).toBe(false);
    await t.service.refresh();
    expect(t.state().available).toBe(false);
    await t.service.speakMessage({ text: 'Hello.', messageId: 'm1' });
    expect(t.state().speakingMessageId).toBeNull();
    expect(() => t.service.stop()).not.toThrow();
    await t.service.openVoiceInstaller();
    expect(t.speech.calls.speak).toEqual([]);
  });
});
