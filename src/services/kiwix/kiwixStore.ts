/**
 * The Kiwix files the user added, for the screen to render. Only kiwixService writes it.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const useKiwixStore = create<KiwixState>()(persist(
  (): KiwixState => ({ files: {}, folders: [], removed: [], refused: [], adding: null }),
  {
    name: '@fieldkit/kiwix_files',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ adding: _adding, ...saved }) => saved,
  },
));
