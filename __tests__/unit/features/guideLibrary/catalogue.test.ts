import { bundledCatalogue, parseCatalogue } from '../../../../src/features/guideLibrary/catalogue';

const good = { version: 1, updated: '2026-11-17', categories: [{ id: 'medical', name: 'First aid and medical' }],
  guides: [{ id: 'army-x', title: 'X', category: 'medical', publisher: 'US Army', year: 2015, licence: 'Public domain',
    licenceNote: 'n', url: 'https://example.mil/x.pdf', bytes: 10, sha256: 'a'.repeat(64), pages: 3, hasText: true }] };
const withGuide = (patch: object) => ({ ...good, guides: [{ ...good.guides[0], ...patch }] });

describe('parseCatalogue', () => {
  it('accepts a well-formed catalogue', () => expect(parseCatalogue(good)).toEqual(good));
  it('drops unknown extra fields', () => {
    const parsed = parseCatalogue(withGuide({ extra: 'x' }));
    expect(parsed?.guides[0]).toEqual(good.guides[0]);
  });
  it.each([
    ['not an object', 'nope'],
    ['unsupported version', { ...good, version: 2 }],
    ['http url', withGuide({ url: 'http://example.mil/x.pdf' })],
    ['path-like id', withGuide({ id: '../../x' })],
    ['short sha256', withGuide({ sha256: 'abc' })],
    ['zero bytes', withGuide({ bytes: 0 })],
    ['unknown category', withGuide({ category: 'nope' })],
    ['duplicate id', { ...good, guides: [good.guides[0], good.guides[0]] }],
    ['missing title', withGuide({ title: '' })],
  ])('rejects %s', (_name, raw) => expect(parseCatalogue(raw)).toBeNull());
});

describe('bundledCatalogue', () => {
  it('the shipped catalogue is valid and has no duplicate urls', () => {
    expect(bundledCatalogue.version).toBe(1);
    const urls = bundledCatalogue.guides.map(g => g.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
