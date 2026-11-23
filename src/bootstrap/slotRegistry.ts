import { useSyncExternalStore, type ComponentType } from 'react';

/**
 * Component-slot seam. Features register UI components against named slots at start-up (see
 * src/features); core renders whatever is registered and renders nothing (its own fallback) when
 * a slot is empty.
 *
 * Slot names are plain strings (see SLOTS below for the known set). Props are passed through
 * untyped on purpose: each slot documents its own prop shape and the registering component
 * declares it.
 *
 * `useSlot` subscribes, so a slot registered after a consumer has mounted makes that consumer
 * re-render and pick the component up. `getSlot` stays for non-component / one-shot reads.
 */
const slots: Record<string, ComponentType<any>> = {};
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const l of listeners) l();
}

export function registerSlot(name: string, component: ComponentType<any>): void {
  if (slots[name] === component) return; // no-op re-register (dev Fast Refresh)
  slots[name] = component;
  emitChange();
}

export function getSlot(name: string): ComponentType<any> | undefined {
  return slots[name];
}

/** Reactive read of a slot — re-renders when the slot is (de)registered. */
export function useSlot(name: string): ComponentType<any> | undefined {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => slots[name],
  );
}

function _clearSlotsForTesting(): void {
  for (const key of Object.keys(slots)) {
    delete slots[key];
  }
  emitChange();
}

/** Known slot names, centralised so core and the features stay in sync. */
export const SLOTS = {
  /** Per-message meta-row control (the TTS speak/play button) in chat mode. */
  messageSpeakButton: 'message.speakButton',
  /** Extra row in the chat-input quick-settings popover (voice mode toggle). */
  quickSettingsAudioRow: 'quickSettings.audioRow',
  /** The "Text to Speech" body in the Chat Settings modal (TTS section). */
  generationSettingsTts: 'generationSettings.tts',
  /** Body of the "Voice Models" tab on the Models screen (TTS engine model
   *  download/management). The tab always shows; its body is empty until
   *  this is registered. */
  modelsScreenVoiceTab: 'modelsScreen.voiceTab',
} as const;
