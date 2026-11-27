/**
 * The user's own checklists: packing lists and check lists with tick boxes, kept on the phone. Owns every
 * change; checklistStore is the screen's read-only copy. A change that can't be made throws an Error whose
 * message is written for the user.
 */
import { appLockService } from '../../services/appLockService';
import { Share } from 'react-native';
import { generateId } from '../../utils/generateId';
import logger from '../../utils/logger';
import { oneLine } from '../../utils/oneLine';
import { type Checklist, savedChecklists, useChecklistStore } from './checklistStore';
import { STARTER_LISTS } from './starterLists';

// Everything is saved as one value, and Android reads back about 2 MB at most: 30 lists of 100 items of 100
// characters stay under that even when every character is an emoji.
const MAX_LISTS = 30;
const MAX_ITEMS = 100;
/** The longest name and item kept; the screen's fields stop typing at the same lengths. */
export const CHECKLIST_LIMITS = { name: 60, item: 100 };

const LOADING = 'Your lists are still loading. Try again in a moment.';
const UNREADABLE = 'Your saved lists could not be read, so nothing can be changed. Close the app and open it again.';

const store = useChecklistStore;
// generateId falls back to the clock on an engine with no Web Crypto, and a starter list's items are all made
// in the same millisecond: the counter keeps their ids apart.
let made = 0;
const newId = () => `${generateId()}-${(made++).toString(36)}`;
const newItem = (text: string) => ({ id: newId(), text, done: false });

/** Every change goes through here. Nothing is written until the saved lists are in memory: it would replace them. */
function write(update: (lists: Checklist[]) => Checklist[]): void {
  const state = savedChecklists();
  if (state !== 'ready') throw new Error(state === 'loading' ? LOADING : UNREADABLE);
  store.setState(s => ({ lists: update(s.lists) }));
}

function change(listId: string, edit: (list: Checklist) => Checklist): void {
  write(lists => lists.map(list => (list.id === listId ? { ...edit(list), changedAt: Date.now() } : list)));
}

export const checklistService = {
  /** Makes a list above the others and returns its id. */
  create(name: string, items: string[] = []): string {
    const clean = oneLine(name, CHECKLIST_LIMITS.name);
    if (!clean) throw new Error('Give the list a name.');
    if (store.getState().lists.length >= MAX_LISTS) {
      throw new Error(`You have ${MAX_LISTS} lists, the most this screen keeps. Delete one first.`);
    }
    const texts = items.map(text => oneLine(text, CHECKLIST_LIMITS.item)).filter(Boolean).slice(0, MAX_ITEMS);
    const list: Checklist = { id: newId(), name: clean, items: texts.map(newItem), changedAt: Date.now() };
    write(lists => [list, ...lists]);
    return list.id;
  },

  /** A new name for a list; its items and their ticks stay as they are. */
  rename(listId: string, name: string): void {
    const clean = oneLine(name, CHECKLIST_LIMITS.name);
    if (!clean) throw new Error('Give the list a name.');
    change(listId, l => ({ ...l, name: clean }));
  },

  createFromStarter(starterId: string): string {
    const starter = STARTER_LISTS.find(s => s.id === starterId);
    if (!starter) throw new Error('That starter list is not available.');
    return checklistService.create(starter.name, starter.items);
  },

  addItem(listId: string, text: string): void {
    const list = store.getState().lists.find(l => l.id === listId);
    if (!list) return;
    const clean = oneLine(text, CHECKLIST_LIMITS.item);
    if (!clean) throw new Error('Type the item first.');
    if (list.items.length >= MAX_ITEMS) throw new Error(`A list holds ${MAX_ITEMS} items at most.`);
    change(listId, l => ({ ...l, items: [...l.items, newItem(clean)] }));
  },

  toggle(listId: string, itemId: string): void {
    change(listId, l => ({ ...l, items: l.items.map(item => (item.id === itemId ? { ...item, done: !item.done } : item)) }));
  },

  removeItem(listId: string, itemId: string): void {
    change(listId, l => ({ ...l, items: l.items.filter(item => item.id !== itemId) }));
  },

  /** Every tick cleared, so the list is ready for the next trip. */
  untickAll(listId: string): void {
    change(listId, l => ({ ...l, items: l.items.map(item => ({ ...item, done: false })) }));
  },

  remove(listId: string): void {
    write(lists => lists.filter(l => l.id !== listId));
  },

  /**
   * Hands the list to the phone's share sheet as plain text: its name, then one item to a line with its tick.
   * Nothing leaves the phone until the user picks where to send it.
   */
  async share(listId: string): Promise<void> {
    const list = store.getState().lists.find(l => l.id === listId);
    if (!list) return;
    const lines = list.items.map(item => `${item.done ? '[x]' : '[ ]'} ${item.text}`);
    try {
      appLockService.openingSystemScreen();
      await Share.share({ title: list.name, message: [list.name, ...lines].join('\n') });
    } catch (error) {
      // The user closing the sheet is not an error on Android; anything that lands here is the sheet failing to open.
      logger.error('[Checklists] Could not open the share sheet for a list:', error);
    }
  },
};
