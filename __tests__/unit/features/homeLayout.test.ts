import { DEFAULT_ORDER, readLayout, shownCards } from '../../../src/features/home/homeLayout';

describe('home layout', () => {
  it('gives the default layout for a value that is not an object', () => {
    expect(readLayout(undefined)).toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
    expect(readLayout('junk')).toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
    expect(readLayout(null)).toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
  });

  it('drops unknown and duplicate ids, places missing cards after their predecessor, and keeps always-shown cards visible', () => {
    expect(readLayout({ order: ['phone', 'assistant', 'radio', 'phone'], hidden: ['assistant', 'today', 'x'] }))
      .toEqual({ order: ['phone', 'assistant', 'fieldKit', 'library', 'checklists', 'today'], hidden: ['today'] });
  });

  it('puts a missing first card first, and tolerates fields of the wrong type', () => {
    expect(readLayout({ order: ['fieldKit', 'library', 'checklists', 'today', 'phone'], hidden: 'no' }))
      .toEqual({ order: ['assistant', 'fieldKit', 'library', 'checklists', 'today', 'phone'], hidden: [] });
    expect(readLayout({ order: 7, hidden: [1, 'today', 'today'] }))
      .toEqual({ order: [...DEFAULT_ORDER], hidden: ['today'] });
  });

  it('lists the shown cards in order, leaving hidden ones out', () => {
    expect(shownCards({ order: ['today', 'assistant', 'fieldKit', 'library', 'checklists', 'phone'], hidden: ['checklists'] }))
      .toEqual(['today', 'assistant', 'fieldKit', 'library', 'phone']);
  });
});
