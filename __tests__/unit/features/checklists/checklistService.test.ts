/**
 * The checklist service with its real store: making lists, adding, ticking and removing items, resetting and
 * deleting, the limits that keep the saved value small, the starter list, and what happens while the saved
 * lists are still loading or cannot be read. Device leaf only: AsyncStorage (the jest mock).
 *
 * The starter list's expected items are typed here from Ready.gov's "Basic Disaster Supplies Kit" as read on
 * 18 November 2026 (https://www.ready.gov/kit, last updated 07/01/2026), not read from the code.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHECKLIST_LIMITS, checklistService } from '../../../../src/features/checklists/checklistService';
import { useChecklistStore } from '../../../../src/features/checklists/checklistStore';
import { STARTER_LISTS } from '../../../../src/features/checklists/starterLists';

const KEY = '@fieldkit/checklists';
const lists = () => useChecklistStore.getState().lists;
const only = () => lists()[0];
const saved = (value: unknown) => JSON.stringify({ state: value, version: 0 });
const inStorage = () => AsyncStorage.getItem(KEY);

/**
 * A fresh copy of the service and its store, as after the app starts, reading whatever storage holds. With
 * holdRead the read stays on its way until deliver() is called.
 */
function restart(holdRead = false) {
  let fresh!: { service: typeof checklistService; store: typeof useChecklistStore; deliver: () => void };
  jest.isolateModules(() => {
    // The storage mock's functions are made anew for this copy of the modules; what is stored is shared.
    const storage = require('@react-native-async-storage/async-storage');
    const read = storage.getItem.getMockImplementation();
    let deliver = () => {};
    if (holdRead) {
      storage.getItem.mockImplementationOnce((key: string) => new Promise(resolve => { deliver = () => resolve(read(key)); }));
    }
    fresh = {
      service: require('../../../../src/features/checklists/checklistService').checklistService,
      store: require('../../../../src/features/checklists/checklistStore').useChecklistStore,
      deliver: () => deliver(),
    };
  });
  return fresh;
}
const settle = () => new Promise(resolve => setImmediate(resolve));

const READY_BASIC_KIT = [
  'Water (one gallon per person per day for several days, for drinking and sanitation)',
  'Food (at least a several-day supply of non-perishable food)',
  'Battery-powered or hand crank radio and a NOAA Weather Radio with tone alert',
  'Flashlight',
  'First aid kit',
  'Extra batteries',
  'Whistle (to signal for help)',
  'Dust mask (to help filter contaminated air)',
  'Plastic sheeting, scissors and duct tape (to shelter in place)',
  'Moist towelettes, garbage bags and plastic ties (for personal sanitation)',
  'Wrench or pliers (to turn off utilities)',
  'Manual can opener (for food)',
  'Local maps',
  'Cell phone with chargers and a backup battery',
];

describe('checklist service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    // Loads the (empty) saved value, which also empties the lists left in memory by the test before.
    await useChecklistStore.persist.rehydrate();
  });

  it('makes a list, adds items, ticks one and counts', () => {
    const id = checklistService.create('  Day   hike ');
    expect(only()).toMatchObject({ id, name: 'Day hike', items: [] });

    checklistService.addItem(id, 'Map');
    checklistService.addItem(id, ' Water,  2 litres ');
    expect(only().items.map(i => [i.text, i.done])).toEqual([['Map', false], ['Water, 2 litres', false]]);

    checklistService.toggle(id, only().items[1].id);
    expect(only().items.map(i => i.done)).toEqual([false, true]);
    checklistService.toggle(id, only().items[1].id);
    expect(only().items.map(i => i.done)).toEqual([false, false]);
  });

  it('unticks everything, removes an item and deletes a list', () => {
    const id = checklistService.create('Car kit');
    for (const text of ['Jack', 'Jump leads', 'Blanket']) checklistService.addItem(id, text);
    for (const item of only().items) checklistService.toggle(id, item.id);
    expect(only().items.every(i => i.done)).toBe(true);

    checklistService.untickAll(id);
    expect(only().items.some(i => i.done)).toBe(false);

    checklistService.removeItem(id, only().items[1].id);
    expect(only().items.map(i => i.text)).toEqual(['Jack', 'Blanket']);

    checklistService.remove(id);
    expect(lists()).toEqual([]);
  });

  it('renames a list, keeping its items and their ticks', () => {
    const id = checklistService.create('Day hke');
    checklistService.addItem(id, 'Map');
    checklistService.toggle(id, only().items[0].id);

    checklistService.rename(id, '  Day   hike ');
    expect(only()).toMatchObject({ id, name: 'Day hike', items: [{ text: 'Map', done: true }] });

    expect(() => checklistService.rename(id, ' \n ')).toThrow('Give the list a name.');
    checklistService.rename(id, 'x'.repeat(100));
    expect(only().name).toHaveLength(60);
    expect(() => checklistService.rename('nope', 'Other')).not.toThrow();
    expect(lists()).toHaveLength(1);
  });

  it('keeps a new list above older ones', () => {
    checklistService.create('First');
    checklistService.create('Second');
    expect(lists().map(l => l.name)).toEqual(['Second', 'First']);
  });

  it('refuses an empty name or item, and says so', () => {
    expect(() => checklistService.create('   ')).toThrow('Give the list a name.');
    const id = checklistService.create('Kit');
    expect(() => checklistService.addItem(id, ' \n ')).toThrow('Type the item first.');
    expect(only().items).toEqual([]);
  });

  it('keeps names and items to one short line of plain text', () => {
    const id = checklistService.create(`Kit\n\u0007${'x'.repeat(100)}`);
    expect(only().name).toBe(`Kit ${'x'.repeat(56)}`);
    checklistService.addItem(id, `Rope\t30 m\n${'y'.repeat(300)}`);
    expect(only().items[0].text).toHaveLength(100);
    expect(only().items[0].text.startsWith('Rope 30 m y')).toBe(true);
  });

  it('cleans the items a list is made with, and takes no more than a list holds', () => {
    checklistService.create('Made whole', ['  Map  and compass ', ' \n ', 'c'.repeat(300), ...Array.from({ length: 150 }, (_, i) => `Item ${i}`)]);
    const texts = only().items.map(i => i.text);
    expect(texts.slice(0, 3)).toEqual(['Map and compass', 'c'.repeat(100), 'Item 0']);
    expect(texts).toHaveLength(100);
  });

  it('stops at 30 lists and at 100 items in a list, which keeps the saved value well under what the phone can read back', () => {
    for (let i = 0; i < 30; i++) checklistService.create(`List ${i}`);
    expect(() => checklistService.create('One more')).toThrow('You have 30 lists, the most this screen keeps. Delete one first.');
    expect(lists()).toHaveLength(30);

    const id = lists()[0].id;
    for (let i = 0; i < 100; i++) checklistService.addItem(id, `Item ${i}`);
    expect(() => checklistService.addItem(id, 'One more')).toThrow('A list holds 100 items at most.');
    expect(lists()[0].items).toHaveLength(100);
  });

  it('ignores a list or item that is not there', () => {
    const id = checklistService.create('Kit');
    expect(() => checklistService.addItem('nope', 'Map')).not.toThrow();
    expect(() => checklistService.toggle(id, 'nope')).not.toThrow();
    expect(() => checklistService.removeItem('nope', 'nope')).not.toThrow();
    expect(() => checklistService.remove('nope')).not.toThrow();
    expect(lists()).toHaveLength(1);
    expect(only().items).toEqual([]);
  });

  it("starts a list from Ready.gov's basic kit, item for item, with nothing ticked", () => {
    expect(STARTER_LISTS.map(s => s.id)).toEqual(['ready-basic-kit', 'ready-car-kit', 'ready-pet-kit']);
    const id = checklistService.createFromStarter('ready-basic-kit');
    expect(only()).toMatchObject({ id, name: 'Emergency kit' });
    expect(only().items.map(i => i.text)).toEqual(READY_BASIC_KIT);
    expect(only().items.some(i => i.done)).toBe(false);
    expect(STARTER_LISTS[0].source).toBe('Ready.gov, Basic Disaster Supplies Kit, as updated 1 July 2026');
  });

  // Typed from the two Ready.gov pages as read on 19 November 2026, not read from the code:
  // https://www.ready.gov/car, "Emergency Kit for the Car" (last updated 03/12/2026), and
  // https://www.ready.gov/pets, "Build a Kit for Your Pet" (last updated 03/20/2026).
  it("starts a list from Ready.gov's car extras, item for item, and says they are extras", () => {
    // The page: "keep an emergency supply kit in your car with these automobile extras". The seven items are
    // additions to a kit, not a kit: no water, food or first aid kit is among them.
    checklistService.createFromStarter('ready-car-kit');
    expect(only().name).toBe('Car kit extras');
    expect(only().items.map(i => i.text)).toEqual([
      'Jumper cables',
      'Flares or reflective triangle',
      'Ice scraper',
      'Car cell phone charger',
      'Blanket',
      'Map',
      'Cat litter or sand (for better tire traction)',
    ]);
    expect(only().items.some(i => i.done)).toBe(false);
    expect(STARTER_LISTS[1]).toMatchObject({
      label: 'Start from the Ready.gov car extras',
      source: 'Ready.gov, Emergency Kit for the Car, as updated 12 March 2026. Extras to keep in the car with an emergency kit.',
    });
  });

  it("starts a list from Ready.gov's pet kit, with what each item is for, and says it is adapted", () => {
    // The page prints ten items, each a name and a sentence or two of explanation. A bare name loses what to
    // pack ("Sanitation needs", "Medicine"), and the full text does not fit a line, so each item here is the
    // name with the page's own words cut down, and the two long items are split into the things they name:
    //   "Collar with ID tag and a harness or leash. Include a backup leash, collar and ID tag. Have copies of
    //    your pet's registration information and other relevant documents in a waterproof container and
    //    available electronically."
    //   "Sanitation needs. Include pet litter and litter box (if appropriate), newspapers, paper towels,
    //    plastic trash bags and household chlorine bleach to provide for your pet's sanitation needs."
    checklistService.createFromStarter('ready-pet-kit');
    expect(only().name).toBe('Pet emergency kit');
    expect(only().items.map(i => i.text)).toEqual([
      "Food (several days' supply in an airtight, waterproof container)",
      "Water (a water bowl and several days' supply of water)",
      'Medicine (an extra supply of the medicine your pet takes regularly, in a waterproof container)',
      'First aid kit (talk to your veterinarian about what is most appropriate for your pet)',
      'Collar with ID tag and a harness or leash',
      'Backup leash, collar and ID tag',
      "Copies of your pet's registration information and other relevant documents in a waterproof container",
      // Each item must make sense alone: a list can be reordered by removing items, and bleach needs its reason.
      "Electronic copies of your pet's registration information and other relevant documents",
      'Traveling bag, crate or sturdy carrier, ideally one for each pet',
      'Grooming items (pet shampoo, conditioner and other items)',
      'For sanitation: pet litter and litter box (if appropriate)',
      'For sanitation: newspapers, paper towels, plastic trash bags and household chlorine bleach',
      'A picture of you and your pet together',
      'Familiar items (favorite toys, treats or bedding)',
    ]);
    expect(STARTER_LISTS[2]).toMatchObject({
      label: 'Start from the Ready.gov pet kit',
      source: 'Adapted from Ready.gov, Build a Kit for Your Pet, as updated 20 March 2026',
    });
  });

  it('has no starter item or name too long to be kept whole', () => {
    // A longer item would be cut short without a word when the list is made.
    for (const starter of STARTER_LISTS) {
      expect(starter.name.length).toBeLessThanOrEqual(CHECKLIST_LIMITS.name);
      for (const item of starter.items) expect({ item, fits: item.length <= CHECKLIST_LIMITS.item }).toEqual({ item, fits: true });
    }
  });

  it('gives every list and item its own id, even on an engine with no Web Crypto and within one millisecond', () => {
    // The phone's engine may lack crypto.getRandomValues; ids then come from the clock, and a starter list's
    // items are all made in the same millisecond.
    const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1795000000000);
    try {
      checklistService.createFromStarter('ready-basic-kit');
      checklistService.createFromStarter('ready-basic-kit');
    } finally {
      now.mockRestore();
      if (realCrypto) Object.defineProperty(globalThis, 'crypto', realCrypto);
    }
    const ids = lists().flatMap(l => [l.id, ...l.items.map(i => i.id)]);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  describe('what is saved on the phone', () => {
    const OLD = { id: 'old-1', name: 'Saved list', items: [{ id: 'old-1-a', text: 'Tent', done: true }] };

    it('changes nothing until the saved lists have loaded, so a quick tap cannot replace them', async () => {
      await AsyncStorage.setItem(KEY, saved({ lists: [OLD] }));
      // The read is still on its way when the first changes are tried.
      const { service, store, deliver } = restart(true);

      const loading = 'Your lists are still loading. Try again in a moment.';
      expect(() => service.create('Too soon')).toThrow(loading);
      expect(() => service.createFromStarter('ready-basic-kit')).toThrow(loading);
      expect(() => service.remove('old-1')).toThrow(loading);
      expect(() => service.toggle('old-1', 'old-1-a')).toThrow(loading);
      await settle();
      expect(await inStorage()).toBe(saved({ lists: [OLD] }));

      deliver();
      await settle();
      expect(store.getState().lists).toEqual([{ ...OLD, changedAt: 0 }]);
      service.create('In time');
      expect(store.getState().lists.map(l => l.name)).toEqual(['In time', 'Saved list']);
      await settle();
      expect(await inStorage()).toContain('In time');
      expect(await inStorage()).toContain('Saved list');
    });

    it('leaves saved lists it cannot read alone, and says what to do', async () => {
      const damaged = '{"state":{"lists":[{"id":"old-1","name":"Saved li';
      await AsyncStorage.setItem(KEY, damaged);
      const { service, store } = restart();
      await settle();

      expect(store.getState().lists).toEqual([]);
      expect(() => service.create('New')).toThrow('Your saved lists could not be read, so nothing can be changed. Close the app and open it again.');
      await settle();
      expect(await inStorage()).toBe(damaged);
    });

    it('takes only well-formed lists and items from storage', async () => {
      await AsyncStorage.setItem(KEY, saved({
        lists: [
          OLD,
          null,
          { id: 7, name: 'Bad id', items: [] },
          { id: 'no-items', name: 'No items' },
          { id: 'mixed', name: 'Mixed', changedAt: 1234, items: [{ id: 'm-1', text: 'Stove' }, 7, null, { id: 'm-2', text: 9, done: true }, { id: 'm-3', text: 'Fuel', done: 'yes' }] },
        ],
      }));
      const { store } = restart();
      await settle();
      expect(store.getState().lists).toEqual([
        { ...OLD, changedAt: 0 },
        { id: 'mixed', name: 'Mixed', items: [{ id: 'm-1', text: 'Stove', done: false }, { id: 'm-3', text: 'Fuel', done: false }], changedAt: 1234 },
      ]);
    });

    it.each([[{ lists: null }], [{ lists: 'none' }], [{}], [null]])('reads %j as no lists, without failing', async value => {
      await AsyncStorage.setItem(KEY, saved(value));
      const { service, store } = restart();
      await settle();
      expect(store.getState().lists).toEqual([]);
      expect(() => service.create('Fresh start')).not.toThrow();
    });
  });
});
