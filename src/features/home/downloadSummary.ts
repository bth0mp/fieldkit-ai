import type { DownloadEntry } from '../../stores/downloadStore';
import type { GuideLibraryState } from '../guideLibrary/guideLibraryStore';

export interface DownloadSummary {
  title: string;
  /** "2 of 5" while "Download all" runs, otherwise null. */
  count: string | null;
  /** 0..1, the mean over everything downloading. */
  fraction: number;
  opens: 'DownloadManager' | 'GuideLibrary';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What Home's Downloads card says about the downloads running: model downloads and guides. During "Download all"
 * every guide in the batch counts, those done as full and those still waiting as empty. Null when nothing downloads.
 */
export function downloadSummary(
  models: DownloadEntry[],
  { guides, batch }: Pick<GuideLibraryState, 'guides' | 'batch'>,
): DownloadSummary | null {
  const running = Object.values(guides).filter(g => g.phase === 'downloading').map(g => g.progress ?? 0);
  if (models.length === 0 && running.length === 0) return null;

  const guideCount = batch ? batch.total - batch.done : running.length;
  const parts = [
    models.length > 0 && plural(models.length, 'model'),
    guideCount > 0 && plural(guideCount, 'guide'),
  ].filter(Boolean);

  const items = models.length + (batch ? batch.total : running.length);
  const sum = models.reduce((a, m) => a + m.progress, 0) + running.reduce((a, p) => a + p, 0) + (batch?.done ?? 0);
  return {
    title: `Downloading ${parts.join(' and ')}`,
    count: batch ? `${batch.done} of ${batch.total}` : null,
    fraction: items > 0 ? sum / items : 0,
    opens: models.length > 0 ? 'DownloadManager' : 'GuideLibrary',
  };
}
