import { MODEL_RECOMMENDATIONS } from '../../constants/models';
import { fileExceedsBudget } from '../../services/memoryBudget';
import { TEXT_MODEL_OVERHEAD_MULTIPLIER } from '../../services/activeModelService/types';
import { PICK_SIZES } from './pickSizes';

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

export function fileFitsTier(sizeBytes: number, tier: MemoryTier): boolean {
  return !fileExceedsBudget(sizeBytes, tier * 0.9);
}

/**
 * The pick's label on a tier: its minimum and maximum memory first. When the pick's file sizes are known, a tier the
 * smallest file does not fit is not listed, and a tier where the app would refuse the usual file (model plus picture
 * file, times the load overhead) is "tight".
 */
export function textPickFit(
  pick: { id?: string; minRam: number; maxRam?: number },
  tier: MemoryTier,
): 'runs-well' | 'tight' | null {
  if (tier < pick.minRam) return null;
  if (pick.maxRam !== undefined && tier > pick.maxRam) return null;
  const sizes = pick.id ? PICK_SIZES[pick.id] : undefined;
  if (sizes) {
    if (!fileFitsTier(sizes.smallest, tier)) return null;
    if (!fileFitsTier((sizes.usual + sizes.vision) * TEXT_MODEL_OVERHEAD_MULTIPLIER, tier)) return 'tight';
  }
  if (tier > pick.minRam) return 'runs-well';
  return (MEMORY_TIERS as number[]).includes(pick.minRam) ? 'tight' : null;
}

function joinTiers(tiers: MemoryTier[]): string {
  if (tiers.length < 2) return tiers.join('');
  return `${tiers.slice(0, -1).join(', ')} and ${tiers[tiers.length - 1]}`;
}

/** The pick's "Fits" line, built from the same labels as the tier rows so the two cannot disagree. */
export function textPickFitLine(pick: { id?: string; minRam: number; maxRam?: number }): { label: string; text: string } {
  const runsWell = MEMORY_TIERS.filter(t => textPickFit(pick, t) === 'runs-well');
  const tight = MEMORY_TIERS.filter(t => textPickFit(pick, t) === 'tight');
  const tightText = tight.length > 0 ? `tight on ${joinTiers(tight)} GB` : '';
  if (runsWell.length === 0) return { label: 'Fits', text: tightText ? `only ${tightText}` : 'no phone tier' };
  let main: string;
  if (pick.maxRam === undefined) main = `${runsWell[0]} GB and up`;
  else main = `${joinTiers(runsWell)} GB phones`;
  const label = pick.maxRam === undefined ? 'Fits' : 'Best on';
  return { label, text: tightText ? `${main}; ${tightText}` : main };
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
