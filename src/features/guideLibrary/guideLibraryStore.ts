import { create } from 'zustand';
import { bundledCatalogue, type Catalogue, type GuideEntry } from './catalogue';

export type GuidePhase = 'none' | 'downloading' | 'downloaded' | 'teaching' | 'taught';

/** `progress` is 0..1 while downloading; `error` is the last failure, in words for the user. */
export interface GuideState { phase: GuidePhase; progress?: number; error?: string }

export interface GuideLibraryState {
  catalogue: Catalogue;
  /** A missing id means { phase: 'none' }. */
  guides: Record<string, GuideState>;
  /** Downloaded (or downloading) guides the catalogue no longer lists. */
  delisted: GuideEntry[];
  refreshing: boolean;
  /** The guide being indexed right now. Other guides in phase 'teaching' are waiting their turn. */
  learning: string | null;
}

const ON_PHONE: readonly GuidePhase[] = ['downloaded', 'teaching', 'taught'];

/** True when the guide's file is on the phone (it can be opened). A missing state means not downloaded. */
export const isOnPhone = (state: GuideState | undefined): boolean => !!state && ON_PHONE.includes(state.phase);

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
  delisted: [],
  refreshing: false,
  learning: null,
}));
