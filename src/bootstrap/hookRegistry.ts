/**
 * Function-hook seam. Features register plain functions against named hooks at start-up (see
 * src/features); core calls them when present and falls back to a no-op / default when absent.
 * Use this for behaviour (not UI — see slotRegistry for UI): speaking a reply, stopping speech.
 */
type HookFn = (...args: any[]) => any;

const hooks: Record<string, HookFn> = {};

export function registerHook(name: string, fn: HookFn): void {
  hooks[name] = fn;
}

/** Call a hook if registered; returns its result, or undefined when absent. */
export function callHook<R = any>(name: string, ...args: any[]): R | undefined {
  const fn = hooks[name];
  return fn ? (fn(...args) as R) : undefined;
}

export function _clearHooksForTesting(): void {
  for (const key of Object.keys(hooks)) {
    delete hooks[key];
  }
}

/** Known hook names, centralised so core and the features stay in sync. */
export const HOOKS = {
  /** () => boolean — whether a message can be spoken (TTS enabled + ready). */
  audioCanSpeak: 'audio.canSpeak',
  /** (text: string, messageId: string) => void — speak a message aloud. */
  audioSpeak: 'audio.speak',
  /** () => void — stop any in-progress speech. */
  audioStop: 'audio.stop',
  /** (content: string) => void — fired as the assistant message streams; the
   *  voice feature uses it to synthesize/play speech sentence-by-sentence while
   *  generation is still in progress (no-op unless voice mode + engine ready). */
  audioOnStreamingToken: 'audio.onStreamingToken',
  /** (conversationId: string) => void — when streaming ends, speak the final
   *  assistant message if voice mode is active (the voice feature checks mode/readiness). */
  audioOnStreamingEnd: 'audio.onStreamingEnd',
  /** () => void — app went to background: pause speech if playing. */
  audioOnAppBackground: 'audio.onAppBackground',
  /** (engineId: string) => Promise<void> — delete a downloaded TTS voice model. */
  downloadsDeleteVoiceModel: 'downloads.deleteVoiceModel',
} as const;
