import { downloadSummary } from '../../../src/features/home/downloadSummary';
import type { DownloadEntry } from '../../../src/stores/downloadStore';

const model = (progress: number) => ({ progress, status: 'running' }) as DownloadEntry;
const dl = (progress: number) => ({ phase: 'downloading' as const, progress });

describe('downloadSummary', () => {
  it('is null when nothing downloads', () => {
    expect(downloadSummary([], { guides: {}, batch: null })).toBeNull();
    expect(downloadSummary([], { guides: { a: { phase: 'downloaded' } }, batch: null })).toBeNull();
  });

  it('summarises one model', () => {
    expect(downloadSummary([model(0.5)], { guides: {}, batch: null }))
      .toEqual({ title: 'Downloading 1 model', count: null, fraction: 0.5, opens: 'DownloadManager' });
  });

  it('summarises guides outside a batch', () => {
    expect(downloadSummary([], { guides: { a: dl(0.2), b: dl(0.6) }, batch: null }))
      .toEqual({ title: 'Downloading 2 guides', count: null, fraction: 0.4, opens: 'GuideLibrary' });
  });

  it('counts a batch of guides, done and waiting included', () => {
    expect(downloadSummary([], { guides: { c: dl(0.5) }, batch: { total: 5, done: 2 } }))
      .toEqual({ title: 'Downloading 3 guides', count: '2 of 5', fraction: 0.5, opens: 'GuideLibrary' });
  });

  it('joins models and guides', () => {
    expect(downloadSummary([model(1)], { guides: { d: dl(0) }, batch: { total: 4, done: 1 } }))
      .toEqual({ title: 'Downloading 1 model and 3 guides', count: '1 of 4', fraction: 0.4, opens: 'DownloadManager' });
  });

  it('pluralises models and a single guide', () => {
    expect(downloadSummary([model(0), model(0)], { guides: { a: dl(0) }, batch: null })?.title)
      .toBe('Downloading 2 models and 1 guide');
  });
});
