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

/** Read-only projection of the guide library for the UI. Only guideLibraryService writes it. */
export const useGuideLibraryStore = create<GuideLibraryState>(() => ({
  catalogue: bundledCatalogue,
  guides: {},
  delisted: [],
  refreshing: false,
}));
