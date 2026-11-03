import { NativeEventEmitter, NativeModules } from 'react-native';
import type { SpeechEngine, SpeechEngineEvent, SpeechInitResult, SpeechRequest, SpeechVoice } from './speechTypes';

/**
 * The Android system TextToSpeech engine, reached through the `FieldkitSpeech` native module. The module
 * is Android-only: where it is absent (iOS, or a build without it) `isPresent()` is false and every method
 * resolves as a no-op, so callers never branch on the platform.
 */
interface FieldkitSpeechNative {
  init(enginePackage: string | null): Promise<SpeechInitResult>;
  getVoices(): Promise<SpeechVoice[]>;
  setVoice(id: string): Promise<boolean>;
  speak(text: string, utteranceId: string, rate: number, pitch: number): Promise<void>;
  stop(): Promise<void>;
  openVoiceInstaller(): Promise<void>;
}

const EVENT_TYPES: Record<string, SpeechEngineEvent['type']> = {
  FieldkitSpeech_start: 'start',
  FieldkitSpeech_done: 'done',
  FieldkitSpeech_stopped: 'stopped',
  FieldkitSpeech_error: 'error',
};

const UNBOUND: SpeechInitResult = { bound: false, enginePackage: null, maxInputLength: 0 };

// Read at call time, not at import: the module may be installed after this file loads (tests do that).
const nativeModule = (): FieldkitSpeechNative | undefined => NativeModules.FieldkitSpeech;

export const systemSpeechEngine: SpeechEngine = {
  id: 'system',

  isPresent: () => nativeModule() != null,

  // The native side picks the engine and falls back from Samsung to Google itself.
  init: async () => (await nativeModule()?.init(null)) ?? UNBOUND,

  getVoices: async () => (await nativeModule()?.getVoices()) ?? [],

  setVoice: async (id) => (await nativeModule()?.setVoice(id)) ?? false,

  speak: async ({ text, utteranceId, rate, pitch }: SpeechRequest) => {
    await nativeModule()?.speak(text, utteranceId, rate, pitch);
  },

  stop: async () => {
    await nativeModule()?.stop();
  },

  openVoiceInstaller: async () => {
    await nativeModule()?.openVoiceInstaller();
  },

  onEvent: (listener) => {
    const native = nativeModule();
    if (!native) return () => {};
    const emitter = new NativeEventEmitter(NativeModules.FieldkitSpeech);
    const subscriptions = Object.entries(EVENT_TYPES).map(([name, type]) =>
      emitter.addListener(name, (payload: { utteranceId: string; code?: number }) => {
        listener({ type, utteranceId: payload.utteranceId, code: payload.code });
      }),
    );
    return () => subscriptions.forEach(subscription => subscription.remove());
  },
};
