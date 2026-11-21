/**
 * Which of Home's cards show, and in what order. The owner sets it on Edit home. Only homeLayoutService writes
 * the store, which is the screens' read-only copy. The Downloads card is not part of the layout: it stays right
 * after the Assistant card, and shows only while something is downloading.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type HomeCardId = 'assistant' | 'fieldKit' | 'library' | 'checklists' | 'today' | 'phone';

export const DEFAULT_ORDER: readonly HomeCardId[] = ['assistant', 'fieldKit', 'library', 'checklists', 'today', 'phone'];
/** Cards the owner can move but not hide. */
export const ALWAYS_SHOWN: readonly HomeCardId[] = ['assistant', 'library', 'phone'];

export interface HomeLayout { order: HomeCardId[]; hidden: HomeCardId[] }

const isCardId = (value: unknown): value is HomeCardId => DEFAULT_ORDER.some(id => id === value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const known = (value: unknown): HomeCardId[] => (Array.isArray(value) ? value.filter(isCardId) : []);

/**
 * A saved layout made safe: unknown and repeated ids are dropped, a card the saved order lacks (one added by a
 * newer build) goes right after the nearest card before it in the default order, or first when none is there,
 * and a card that must stay on Home is never hidden. Anything that is not an object gives the default layout.
 */
export function readLayout(saved: unknown): HomeLayout {
  const order = [...new Set(known(isRecord(saved) ? saved.order : undefined))];
  DEFAULT_ORDER.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = DEFAULT_ORDER.slice(0, index).reverse().find(other => order.includes(other));
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, id);
  });
  const hidden = [...new Set(known(isRecord(saved) ? saved.hidden : undefined))].filter(id => !ALWAYS_SHOWN.includes(id));
  return { order, hidden };
}

export const useHomeLayoutStore = create<HomeLayout>()(persist(
  (): HomeLayout => ({ order: [...DEFAULT_ORDER], hidden: [] }),
  {
    name: '@fieldkit/home_layout',
    storage: createJSONStorage(() => AsyncStorage),
    merge: (saved, current) => ({ ...current, ...readLayout(saved) }),
  },
));

/** The cards to show, in order. */
export function shownCards(layout: HomeLayout): HomeCardId[] {
  return layout.order.filter(id => !layout.hidden.includes(id));
}

export const homeLayoutService = {
  /** Moves a card one place up (-1) or down (1). A card at the end stays where it is. */
  move(id: HomeCardId, by: -1 | 1): void {
    const order = [...useHomeLayoutStore.getState().order];
    const from = order.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    useHomeLayoutStore.setState({ order });
  },

  /** Hides a card or brings it back. Throws an Error written for the user for a card that stays on Home. */
  setHidden(id: HomeCardId, hidden: boolean): void {
    if (ALWAYS_SHOWN.includes(id)) throw new Error('This card stays on Home.');
    const rest = useHomeLayoutStore.getState().hidden.filter(other => other !== id);
    useHomeLayoutStore.setState({ hidden: hidden ? [...rest, id] : rest });
  },

  reset(): void {
    useHomeLayoutStore.setState({ order: [...DEFAULT_ORDER], hidden: [] });
  },
};
