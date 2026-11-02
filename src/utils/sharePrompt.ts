// Generation services call maybeScheduleSharePrompt after a reply. Nothing in the app
// subscribes any more (the support/share sheet was removed), so this only emits events.

type ShareVariant = 'text' | 'image';

// Shown at most ONCE per app session. In-memory only, so it naturally resets on
// relaunch (a new session).
let shownThisSession = false;

/** Clear the once-per-session guard (call on app launch; also used by tests). */
export function resetSharePromptSession(): void {
  shownThisSession = false;
}

/**
 * Schedule the share prompt event at most ONCE per app session, and never after the
 * user has engaged it (that flag is persisted). Skips the very first generation
 * (count < 2). The single trigger for both the text and image generation paths.
 */
export function maybeScheduleSharePrompt(opts: {
  variant: ShareVariant;
  count: number;
  hasEngaged: boolean;
  delayMs: number;
}): void {
  const { variant, count, hasEngaged, delayMs } = opts;
  if (hasEngaged || shownThisSession || count < 2) return;
  shownThisSession = true;
  setTimeout(() => emitSharePrompt(variant), delayMs);
}
type SharePromptListener = (variant: ShareVariant) => void;

const listeners = new Set<SharePromptListener>();

export function subscribeSharePrompt(
  listener: SharePromptListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSharePrompt(variant: ShareVariant): void {
  listeners.forEach(l => l(variant));
}
