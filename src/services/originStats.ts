import { huggingFaceService } from './huggingface';

/** What Hugging Face reports for the page of the model a download was converted from. */
export interface OriginStats {
  downloads: number;
  likes: number;
  lastModified?: string;
  createdAt?: string;
}

// One request per repo for the session. A pending request is shared; a failed one is dropped so the next ask retries.
const cache = new Map<string, Promise<OriginStats | null>>();

export function getOriginStats(repo: string): Promise<OriginStats | null> {
  const known = cache.get(repo);
  if (known) return known;
  const pending = huggingFaceService.getModelDetails(repo).then(
    (m): OriginStats | null => ({ downloads: m.downloads ?? 0, likes: m.likes ?? 0, lastModified: m.lastModified, createdAt: m.createdAt }),
    () => null,
  ).then(stats => {
    if (!stats) cache.delete(repo);
    return stats;
  });
  cache.set(repo, pending);
  return pending;
}
