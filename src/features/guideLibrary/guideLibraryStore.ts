import { create } from 'zustand';
import { bundledCatalogue, type Catalogue, type GuideEntry } from './catalogue';

export type GuidePhase = 'none' | 'downloading' | 'downloaded' | 'teaching' | 'taught';

/** `progress` is 0..1 while downloading; `error` is the last failure, in words for the user. */
export interface GuideState { phase: GuidePhase; progress?: number; error?: string }

export interface GuideLibraryState {
  catalogue: Catalogue;
  /** A missing id means { phase: 'none' }. */
  guides: Record<string, GuideState>;
  /** Downloaded guides the catalogue no longer lists. */
  delisted: GuideEntry[];
  refreshing: boolean;
}

const ON_PHONE: readonly GuidePhase[] = ['downloaded', 'teaching', 'taught'];

/** True when the guide's file is on the phone (it can be opened). A missing state means not downloaded. */
export const isOnPhone = (state: GuideState | undefined): boolean => !!state && ON_PHONE.includes(state.phase);

/** How many guides are on the phone and how many are taught, over every guide the library tracks
 *  (including ones the catalogue no longer lists). */
export function libraryCounts(guides: Record<string, GuideState>): { onPhone: number; taught: number } {
  const states = Object.values(guides);
  return { onPhone: states.filter(isOnPhone).length, taught: states.filter(g => g.phase === 'taught').length };
}

/** Read-only projection of the guide library for the UI. Only guideLibraryService writes it. */
export const useGuideLibraryStore = create<GuideLibraryState>(() => ({
  catalogue: bundledCatalogue,
  guides: {},
  delisted: [],
  refreshing: false,
}));
