import { originFor } from '../features/modelGuide/origins';

/** What the sort reads of an image model (an `HFImageModel`) and of its original page's numbers (`OriginStats`). */
interface Sortable { name: string; size: number }
interface Stats { downloads: number; likes: number; createdAt?: string }

export type ImageSort = 'popular' | 'liked' | 'newest' | 'size';

/** The number a model is ranked by, or undefined when it has none (no original page, or its numbers have not arrived). */
function rankOf(model: Sortable, sort: Exclude<ImageSort, 'size'>, stats: Record<string, Stats>): number | undefined {
  const origin = originFor('image', model.name);
  const s = origin ? stats[origin] : undefined;
  if (!s) return undefined;
  if (sort === 'popular') return s.downloads;
  if (sort === 'liked') return s.likes;
  const created = s.createdAt ? Date.parse(s.createdAt) : Number.NaN;
  return Number.isNaN(created) ? undefined : created;
}

/**
 * Popular, Most liked and Newest rank the original page's numbers, highest first, models without them last.
 * Size is smallest first. Ties keep the order of the list given. Returns a new array.
 */
export function sortImageModels<M extends Sortable>(models: M[], sort: ImageSort, stats: Record<string, Stats>): M[] {
  if (sort === 'size') return [...models].sort((a, b) => a.size - b.size);
  const ranked = models.map(model => ({ model, rank: rankOf(model, sort, stats) }));
  ranked.sort((a, b) => {
    if (a.rank === undefined || b.rank === undefined) return Number(a.rank === undefined) - Number(b.rank === undefined);
    return b.rank - a.rank;
  });
  return ranked.map(r => r.model);
}
