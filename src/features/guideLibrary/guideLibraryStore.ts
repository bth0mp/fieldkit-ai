import { create } from 'zustand';
import { bundledCatalogue, type Catalogue, type GuideEntry } from './catalogue';

export type GuidePhase = 'none' | 'downloading' | 'downloaded' | 'teaching' | 'taught';

/** `progress` is 0..1 while downloading; `error` is the last failure, in words for the user. */
export interface GuideState { phase: GuidePhase; progress?: number; error?: string }

export interface GuideLibraryState {
  catalogue: Catalogue;
  /** A missing id means { phase: 'none' }. Read it with `stateOf`. */
  guides: Record<string, GuideState>;
  /** The catalogue entry each downloaded file was checked against, by id: what the assistant cites. */
  saved: Record<string, GuideEntry>;
  /** Downloaded (or downloading) guides the catalogue no longer lists. */
  delisted: GuideEntry[];
  refreshing: boolean;
  /** A "Download all" is working through the catalogue. */
  downloadingAll: boolean;
  /** The guide being indexed right now. Other guides in phase 'teaching' are waiting their turn. */
  learning: string | null;
}

/**
 * The value under `id` only if the record itself holds it. Catalogue ids such as "constructor" are also names on
 * every object's prototype, so a plain `record[id]` would find something for a guide that has no entry.
 */
export const ownEntry = <T>(record: Record<string, T>, id: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;

/** A guide's state; undefined means not downloaded. */
export const stateOf = (guides: Record<string, GuideState>, id: string): GuideState | undefined => ownEntry(guides, id);

const ON_PHONE: readonly GuidePhase[] = ['downloaded', 'teaching', 'taught'];

/** True when the guide's file is on the phone (it can be opened). A missing state means not downloaded. */
export const isOnPhone = (state: GuideState | undefined): boolean => !!state && ON_PHONE.includes(state.phase);

/**
 * The entry a row shows: for a guide on the phone, the saved entry its file was checked against, which is what it
 * is taught and cited from; otherwise the catalogue's.
 */
export function rowEntry(saved: Record<string, GuideEntry>, listed: GuideEntry, state: GuideState | undefined): GuideEntry {
  return (isOnPhone(state) && ownEntry(saved, listed.id)) || listed;
}

/**
 * Whether a guide offers the "Assistant knows this" control, given the entry it is taught from. It needs its file
 * and a text layer; a guide the catalogue no longer lists is not taught anew, but keeps the control while taught
 * (or being taught) so it can be switched off.
 */
export const offersTeach = (entry: GuideEntry, state: GuideState | undefined, listed: boolean): boolean =>
  !!state && isOnPhone(state) && entry.hasText && (listed || state.phase !== 'downloaded');

/** Listed guides with no file on the phone and no download running: what "Download all" fetches. */
export const toDownload = ({ catalogue, guides }: Pick<GuideLibraryState, 'catalogue' | 'guides'>): GuideEntry[] =>
  catalogue.guides.filter(g => (stateOf(guides, g.id)?.phase ?? 'none') === 'none');

/** How many guides the library shows, how many are on the phone and how many are taught, over every guide the
 *  library tracks (the catalogue's and the ones it no longer lists). */
export function libraryCounts({ catalogue, guides, delisted }: Pick<GuideLibraryState, 'catalogue' | 'guides' | 'delisted'>):
  { total: number; onPhone: number; taught: number } {
  const states = Object.values(guides);
  return {
    total: catalogue.guides.length + delisted.length,
    onPhone: states.filter(isOnPhone).length,
    taught: states.filter(g => g.phase === 'taught').length,
  };
}

/** Read-only projection of the guide library for the UI. Only guideLibraryService writes it. */
export const useGuideLibraryStore = create<GuideLibraryState>(() => ({
  catalogue: bundledCatalogue,
  guides: {},
  saved: {},
  delisted: [],
  refreshing: false,
  downloadingAll: false,
  learning: null,
}));
