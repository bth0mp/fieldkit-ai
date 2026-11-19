/**
 * The user's checklists, for the screen to render. Only checklistService writes it.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ChecklistItem { id: string; text: string; done: boolean }
export interface Checklist { id: string; name: string; items: ChecklistItem[] }

interface ChecklistState {
  /** Newest first. */
  lists: Checklist[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The well-formed lists and items in a saved value; anything of another shape is left out, not trusted. */
function readLists(saved: unknown): Checklist[] {
  const lists = isRecord(saved) ? saved.lists : undefined;
  if (!Array.isArray(lists)) return [];
  const read: Checklist[] = [];
  for (const list of lists) {
    if (!isRecord(list) || typeof list.id !== 'string' || typeof list.name !== 'string' || !Array.isArray(list.items)) continue;
    const items: ChecklistItem[] = [];
    for (const item of list.items) {
      if (isRecord(item) && typeof item.id === 'string' && typeof item.text === 'string') {
        items.push({ id: item.id, text: item.text, done: item.done === true });
      }
    }
    read.push({ id: list.id, name: list.name, items });
  }
  return read;
}

let unreadable = false;

export const useChecklistStore = create<ChecklistState>()(persist(
  (): ChecklistState => ({ lists: [] }),
  {
    name: '@fieldkit/checklists',
    storage: createJSONStorage(() => AsyncStorage),
    merge: (saved, current) => ({ ...current, lists: readLists(saved) }),
    onRehydrateStorage: () => (_state, error) => { unreadable = error !== undefined; },
  },
));

/**
 * Whether the saved lists are in memory yet. Until they are, a change would be written over them, so the service
 * makes none: 'loading' passes in a moment, 'unreadable' means the saved value could not be read this time.
 */
export function savedChecklists(): 'ready' | 'loading' | 'unreadable' {
  if (useChecklistStore.persist.hasHydrated()) return 'ready';
  return unreadable ? 'unreadable' : 'loading';
}
