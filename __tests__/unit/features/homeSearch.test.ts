import { searchHome } from '../../../src/features/home/homeSearch';
import { QUICK_REFERENCE_CARDS } from '../../../src/features/quickReference/cards';
import type { Conversation } from '../../../src/types';
import type { GuideEntry } from '../../../src/features/guideLibrary/catalogue';

const conv = { id: 'c1', title: 'Purifying creek water', updatedAt: '2026-11-21T10:00:00Z' } as Conversation;
const guide = { id: 'g1', title: 'Water Treatment in the Backcountry' } as GuideEntry;
const list = { id: 'l1', name: 'Car kit', items: [], changedAt: 0 };
const sources = { conversations: [conv], guides: [guide], checklists: [list] };

describe('searchHome', () => {
  it('gives nothing for blank text', () => {
    expect(searchHome('   ', sources)).toEqual([]);
  });

  it('searches titles of every kind, in kind order', () => {
    expect(searchHome('water', sources)).toEqual([
      { kind: 'chat', id: 'c1', title: 'Purifying creek water' },
      { kind: 'guide', id: 'g1', title: 'Water Treatment in the Backcountry' },
      { kind: 'bundledGuide', asset: 'nrcs-tn28-solar-pumps.pdf', title: 'Solar-Powered Water Pump Systems (USDA NRCS Technical Note 28)' },
    ]);
  });

  it('needs every word, in any order and any case', () => {
    expect(searchHome('WATER creek', sources).map(h => h.kind)).toEqual(['chat']);
    expect(searchHome('creek purifying', sources).map(h => h.kind)).toEqual(['chat']);
  });

  it('finds Quick reference cards', () => {
    const morse = QUICK_REFERENCE_CARDS.find(c => c.id === 'morse')!;
    expect(searchHome(morse.title.split(' ')[0], sources)).toContainEqual({ kind: 'reference', id: 'morse', title: morse.title });
  });

  it('puts titles that start with the text first within a kind, and stops at 50', () => {
    const chats = [{ id: 'a', title: 'About a kit' }, { id: 'b', title: 'Kit list' }] as Conversation[];
    expect(searchHome('kit', { ...sources, conversations: chats }).slice(0, 2).map(h => h.title)).toEqual(['Kit list', 'About a kit']);
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `${i}`, title: `Kit ${i}` })) as Conversation[];
    expect(searchHome('kit', { ...sources, conversations: many })).toHaveLength(50);
  });
});
