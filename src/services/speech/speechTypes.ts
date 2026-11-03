/**
 * Shared types for the speech (text-to-speech) service. Kept free of imports so the engine wrapper,
 * the service and the store can all depend on it without a cycle.
 */

/**
 * One voice the engine reports. `id` is the identity everywhere (selection, the persisted choice,
 * comparisons): `name` is the locale display name and is NOT unique across voices.
 */
export interface SpeechVoice {
  id: string;
  name: string;
  language: string;
  networkRequired: boolean;
  notInstalled: boolean;
  quality: number;
}

export type SpeechPhase = 'idle' | 'initializing' | 'ready' | 'speaking' | 'unavailable' | 'error';

export interface SpeechEngineEvent {
  type: 'start' | 'done' | 'stopped' | 'error';
  utteranceId: string;
  /** Engine error code, present on 'error' events. */
  code?: number;
}

export interface SpeechInitResult {
  bound: boolean;
  enginePackage: string | null;
  maxInputLength: number;
}

export interface SpeechRequest {
  text: string;
  utteranceId: string;
  rate: number;
  pitch: number;
}

/**
 * A speech backend. Callers never branch on the concrete engine. When the backing native module is
 * absent, `isPresent()` is false and every other method resolves as a no-op.
 */
export interface SpeechEngine {
  readonly id: string;
  isPresent(): boolean;
  init(): Promise<SpeechInitResult>;
  getVoices(): Promise<SpeechVoice[]>;
  /** Resolves true only when the voice is usable offline and the engine accepted it. */
  setVoice(id: string): Promise<boolean>;
  /** Resolves when the utterance is queued (not when it has been spoken). */
  speak(req: SpeechRequest): Promise<void>;
  stop(): Promise<void>;
  openVoiceInstaller(): Promise<void>;
  onEvent(listener: (e: SpeechEngineEvent) => void): () => void;
}
