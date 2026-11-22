import { RECOMMENDED_MODELS } from '../../constants/models';
import { WHISPER_MODELS } from '../../services/whisperModels';
import { CURATED_LITERT_ENTRIES } from '../../services/curatedLiteRTRegistry';
import { TEXT_MODEL_OVERHEAD_MULTIPLIER } from '../../services/activeModelService/types';
import { smallestFittingTier, textPickFit, textPickFitLine, MEMORY_TIERS, type MemoryTier } from './guide';
import {
  IMAGE_NOTES, LITERT_NOTES, PHONE_TIERS, TEXT_NOTES, WHISPER_NOTES, type ModelNote,
} from './notes';

const GB = 1024 ** 3;

export interface TierRow {
  gb: MemoryTier;
  examples: string[];
  runsWell: string[];
  tight: string[];
}

export interface GuideEntry {
  /** testID suffix: the model id, file name or image note name. */
  id: string;
  name: string;
  goodFor?: string;
  notFor?: string;
  /** "Fits", or "Best on" for a pick that a bigger phone has better choices than. */
  fitsLabel: string;
  fits: string;
}

/** Families in the order their publisher first appears, and inside a family the largest model first. */
function orderedPicks() {
  const orgOrder: string[] = [];
  for (const m of RECOMMENDED_MODELS) if (!orgOrder.includes(m.org)) orgOrder.push(m.org);
  return [...RECOMMENDED_MODELS].sort((a, b) => orgOrder.indexOf(a.org) - orgOrder.indexOf(b.org) || b.params - a.params);
}

export function tierRows(): TierRow[] {
  return MEMORY_TIERS.map(gb => {
    const names = (fit: 'runs-well' | 'tight') =>
      orderedPicks().filter(m => textPickFit(m, gb) === fit).map(m => m.name);
    return {
      gb,
      examples: PHONE_TIERS.find(t => t.gb === gb)?.examples ?? [],
      runsWell: names('runs-well'),
      tight: names('tight'),
    };
  });
}

function fitsFromSize(sizeBytes: number): string {
  const tier = smallestFittingTier(sizeBytes);
  return tier === null ? 'Too big for phones' : `${tier} GB and up`;
}

function withNote(base: Pick<GuideEntry, 'id' | 'name' | 'fits'>, note: ModelNote | undefined): GuideEntry {
  return { ...base, fitsLabel: 'Fits', goodFor: note?.goodFor, notFor: note?.notFor };
}

export function textEntries(): GuideEntry[] {
  return orderedPicks().map(m => {
    const line = textPickFitLine(m);
    return { ...withNote({ id: m.id, name: m.name, fits: line.text }, TEXT_NOTES[m.id]), fitsLabel: line.label };
  });
}

export function imageEntries(): GuideEntry[] {
  return IMAGE_NOTES.map(n => withNote({ id: n.name, name: n.name, fits: fitsFromSize(n.sizeBytes) }, n));
}

const whisperName = (m: { name: string; lang: string }) => `${m.name} (${m.lang === 'en' ? 'English only' : 'many languages'})`;

/** One entry per distinct note: models that share a note are shown together, named once each. */
export function whisperEntries(): GuideEntry[] {
  const groups = new Map<string, { names: string[]; entry: GuideEntry }>();
  for (const m of WHISPER_MODELS) {
    const note = WHISPER_NOTES[m.id];
    // The larger of the file and the memory the app's own description states.
    const fits = fitsFromSize(Math.max(m.size * 1024 * 1024, (m.ramGB ?? 0) * GB));
    const key = note ? `${note.goodFor}|${note.notFor}|${fits}` : m.id;
    const group = groups.get(key);
    if (group) group.names.push(whisperName(m));
    else groups.set(key, { names: [whisperName(m)], entry: withNote({ id: m.id, name: '', fits }, note) });
  }
  return [...groups.values()].map(g => ({ ...g.entry, name: g.names.join(' and ') }));
}

export function liteRtEntries(): GuideEntry[] {
  return CURATED_LITERT_ENTRIES.map(e => withNote({
    id: e.fileName, name: e.displayName, fits: fitsFromSize(e.sizeBytes * TEXT_MODEL_OVERHEAD_MULTIPLIER),
  }, LITERT_NOTES[e.fileName]));
}
