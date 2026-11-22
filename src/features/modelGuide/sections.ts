import { RECOMMENDED_MODELS } from '../../constants/models';
import { WHISPER_MODELS } from '../../services/whisperModels';
import { CURATED_LITERT_ENTRIES } from '../../services/curatedLiteRTRegistry';
import { memoryTierGB, smallestFittingTier, textPickFit, MEMORY_TIERS, type MemoryTier } from './guide';
import {
  IMAGE_NOTES, LITERT_NOTES, PHONE_TIERS, TEXT_NOTES, WHISPER_NOTES, type ModelNote,
} from './notes';

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
  fits: string;
}

export function tierRows(): TierRow[] {
  return MEMORY_TIERS.map(gb => {
    const names = (fit: 'runs-well' | 'tight') =>
      RECOMMENDED_MODELS.filter(m => textPickFit(m, gb) === fit).map(m => m.name);
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
  return { ...base, goodFor: note?.goodFor, notFor: note?.notFor };
}

export function textEntries(): GuideEntry[] {
  return RECOMMENDED_MODELS.map(m => {
    const min = memoryTierGB(m.minRam);
    const maxRam = 'maxRam' in m ? (m.maxRam as number) : undefined;
    const fits = maxRam === undefined ? `${min} GB and up` : `${min} to ${maxRam} GB phones`;
    return withNote({ id: m.id, name: m.name, fits }, TEXT_NOTES[m.id]);
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
    const fits = fitsFromSize(m.size * 1024 * 1024);
    const key = note ? `${note.goodFor}|${note.notFor}|${fits}` : m.id;
    const group = groups.get(key);
    if (group) group.names.push(whisperName(m));
    else groups.set(key, { names: [whisperName(m)], entry: withNote({ id: m.id, name: '', fits }, note) });
  }
  return [...groups.values()].map(g => ({ ...g.entry, name: g.names.join(' and ') }));
}

export function liteRtEntries(): GuideEntry[] {
  return CURATED_LITERT_ENTRIES.map(e => withNote({ id: e.fileName, name: e.displayName, fits: fitsFromSize(e.sizeBytes) }, LITERT_NOTES[e.fileName]));
}
