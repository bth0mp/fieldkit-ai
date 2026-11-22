import { useDownloadStore } from '../stores/downloadStore';

/**
 * A finished or cancelled transcription download leaves the Download Manager; a failed one stays as
 * failed with its reason, so the manager offers Retry (removing it made a mid-session failure vanish).
 */
export function settleDownloadRow(modelKey: string, failure: unknown): void {
  const store = useDownloadStore.getState();
  const entry = store.downloads?.[modelKey];
  if (failure === undefined || !entry) {
    store.remove(modelKey);
    return;
  }
  store.setStatus(entry.downloadId, 'failed', { message: failure instanceof Error ? failure.message : String(failure) });
}
