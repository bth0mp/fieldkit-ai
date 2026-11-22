/**
 * The Kiwix files the user added, for the screen to render. Only kiwixService writes it.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createHydrationGatedStorage } from '../../utils/hydrationGatedStorage';

export interface KiwixFile {
  id: string;
  uri: string;
  fileName: string;
  title: string;
  description: string;
  bytes: number;
  category: string;
}

interface KiwixRefusal { fileName: string; reason: string }

interface KiwixState {
  files: Record<string, KiwixFile>;
  /** Granted folders (tree uris) that "Check for new files" lists again. */
  folders: string[];
  /** Files the user removed: a folder check skips them; picking one with "Add Kiwix file" brings it back. */
  removed: string[];
  refused: KiwixRefusal[];
  adding: { done: number; total: number } | null;
}

const kiwixStorage = createHydrationGatedStorage<Omit<KiwixState, 'adding'>>();

export const useKiwixStore = create<KiwixState>()(persist(
  (): KiwixState => ({ files: {}, folders: [], removed: [], refused: [], adding: null }),
  {
    name: '@fieldkit/kiwix_files',
    storage: kiwixStorage.storage,
    onRehydrateStorage: kiwixStorage.onRehydrateStorage(),
    merge: kiwixStorage.merge<KiwixState>(),
    partialize: ({ adding: _adding, ...saved }) => saved,
  },
));
kiwixStorage.attach(useKiwixStore);
