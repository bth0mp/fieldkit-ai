import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SpeechPhase, SpeechVoice } from '../services/speech/speechTypes';

/**
 * Read-only projection of the speech service for the UI. `speechService` owns every transition and is
 * the only caller of `set`; screens and hooks only read.
 */
interface SpeechData {
  // Persisted preferences.
  /** The user's chosen voice, by id (a voice `name` is not unique). Null = best offline voice. */
  selectedVoiceId: string | null;
  rate: number;
  pitch: number;
  autoSpeak: boolean;

  // Transient service state.
  /** The native speech module exists on this device. */
  available: boolean;
  phase: SpeechPhase;
  /** Offline, installed voices only. A network or not-installed voice is never listed. */
  voices: SpeechVoice[];
  speakingMessageId: string | null;
  enginePackage: string | null;
  /** True when the engine is there but has no offline voice installed. */
  needsVoiceInstall: boolean;
}

/** A partial update, applied through the single `set` setter. */
export type SpeechPatch = Partial<SpeechData>;

interface SpeechState extends SpeechData {
  set: (partial: SpeechPatch) => void;
}

export const useSpeechStore = create<SpeechState>()(
  persist(
    (set) => ({
      selectedVoiceId: null,
      rate: 1,
      pitch: 1,
      autoSpeak: false,
      available: false,
      phase: 'idle',
      voices: [],
      speakingMessageId: null,
      enginePackage: null,
      needsVoiceInstall: false,
      set: (partial) => set(partial),
    }),
    {
      name: 'local-llm-speech-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedVoiceId: state.selectedVoiceId,
        rate: state.rate,
        pitch: state.pitch,
        autoSpeak: state.autoSpeak,
      }),
    },
  ),
);
