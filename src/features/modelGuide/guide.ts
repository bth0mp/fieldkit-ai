import { MODEL_RECOMMENDATIONS } from '../../constants/models';
import { fileExceedsBudget } from '../../services/memoryBudget';

export type MemoryTier = 4 | 6 | 8 | 12 | 16;

export const MEMORY_TIERS: MemoryTier[] = [4, 6, 8, 12, 16];

/** Matches a parameter count such as "7B" or "1.5B" in a model name or id. */
export const PARAM_COUNT_REGEX = /\b(\d+[.]\d+|\d+)\s?[Bb]\b/;

const CODING_REGEX = /(^|[^a-z])cod(e|er|ing)/i;
const VISION_PIPELINE_TAG = 'image-text-to-text';
const SMALL_PARAMS_MAX = 2;
const DAY_MS = 86400000;

/** The smallest tier at or above the reported RAM, and 16 above 16. */
export function memoryTierGB(reportedGB: number): MemoryTier {
  return MEMORY_TIERS.find(t => reportedGB <= t) ?? 16;
}

/** Largest model (billions of parameters) the recommendation table allows for a tier. */
export function maxParamsForTier(tier: MemoryTier): number {
  const row = MODEL_RECOMMENDATIONS.memoryToParams.find(r => r.minRam <= tier && tier < r.maxRam);
  return row ? row.maxParams : 0;
}

export function textPickFit(
  pick: { minRam: number; maxRam?: number },
  tier: MemoryTier,
): 'runs-well' | 'tight' | null {
  if (tier < pick.minRam) return null;
  if (pick.maxRam !== undefined && tier > pick.maxRam) return null;
  if (tier > pick.minRam) return 'runs-well';
  return (MEMORY_TIERS as number[]).includes(pick.minRam) ? 'tight' : null;
}

export function fileFitsTier(sizeBytes: number, tier: MemoryTier): boolean {
  return !fileExceedsBudget(sizeBytes, tier * 0.9);
}

export function smallestFittingTier(sizeBytes: number): MemoryTier | null {
  return MEMORY_TIERS.find(t => fileFitsTier(sizeBytes, t)) ?? null;
}

export function autoLabels(m: {
  name: string;
  tags?: string[];
  pipelineTag?: string;
  paramCount?: number;
}): string[] {
  const labels: string[] = [];
  if (m.pipelineTag === VISION_PIPELINE_TAG || m.tags?.includes(VISION_PIPELINE_TAG)) labels.push('Vision');
  if (CODING_REGEX.test(m.name) || m.tags?.includes('code')) labels.push('Coding');
  const nameMatch = PARAM_COUNT_REGEX.exec(m.name);
  const params = m.paramCount ?? (nameMatch ? Number.parseFloat(nameMatch[1]) : undefined);
  if (params !== undefined && params <= SMALL_PARAMS_MAX) labels.push('Small, fast');
  return labels.slice(0, 2);
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

export function formatUpdatedAgo(iso: string | undefined, now: Date): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((now.getTime() - then) / DAY_MS);
  if (days <= 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  if (days < 30) return `updated ${days} days ago`;
  if (days < 365) return `updated ${plural(Math.floor(days / 30), 'month')} ago`;
  return `updated ${plural(Math.floor(days / 365), 'year')} ago`;
}
