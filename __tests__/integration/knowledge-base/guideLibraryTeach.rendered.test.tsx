/**
 * Guide library teaching (rendered) — the user switches "Assistant knows this" on for a downloaded guide, the
 * guide is indexed into the Field guides knowledge base and a Field guides chat cites it like the bundled
 * guides. Switching it off (or removing the guide) takes it out of the knowledge base again.
 *
 * Real stack: the real GuideLibraryScreen, guide library service and store, ragService.indexDocument →
 * documentService → chunking → embedding → real SQL, the project store and the real ChatScreen send path.
 * Device leaves only: memfs behind react-native-fs (downloadFile serves what each test seeds), the native PDF
 * extractor (a file's contents are its text layer), the llama.rn context (keyword embedding vectors) and
 * op-sqlite on node:sqlite.
 */
import { createHash } from 'crypto';
import { readdirSync } from 'fs';
import { join } from 'path';
import { setupChatScreen } from '../../harness/chatHarness';
import { CATALOGUE_URL } from '../../../src/features/guideLibrary/catalogue';
import { SLOW_SEARCH_TAUGHT_GUIDES } from '../../../src/features/guideLibrary/guideLibraryService';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  // The screen is focused while it is mounted: a focus effect runs on mount, like the first focus.
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  useIsFocused: () => true,
}));

const BOWLINE = 'To tie a bowline, form a small overhand loop in the standing part, pass the running end up through the loop, around behind the standing part and back down through the loop.';
const WATER_TEXT = 'Boil water for one minute to kill germs before drinking it.';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const guide = (id: string, title: string, body: string, extra: Record<string, unknown> = {}) => ({
  id, title, category: 'fieldcraft', publisher: 'Test publisher', year: 2020, licence: 'Public domain',
  licenceNote: 'US government work (17 U.S.C. 105).', url: `https://guides.example.gov/${id}.pdf`,
  bytes: Buffer.byteLength(body), sha256: sha256(body), pages: 12, hasText: true, ...extra,
});
const KNOTS = guide('test-knots', 'Test knots', BOWLINE);
// A positive size that holds no text the knowledge base can index.
const BLANK_BODY = ' \n \n ';
const BLANK = guide('test-blank', 'Test blank', BLANK_BODY);
const SCANNED = guide('test-scanned', 'Test scanned', 'scanned pages', { hasText: false });
const catalogueOf = (guides: unknown[]) => JSON.stringify({
  version: 1, updated: '2026-11-17', categories: [{ id: 'fieldcraft', name: 'Fieldcraft and knots' }], guides,
});
const KEYWORDS = ['bowline', 'boil'];
const keywordVector = (text: string) => [0.1, ...KEYWORDS.map(k => (text.toLowerCase().includes(k) ? 1 : 0))];
const openRoute = (params: Record<string, unknown>) => { require('../../harness/chatHarness').routeHolder.params = params; };
const asyncStorage = () => {
  const m = require('@react-native-async-storage/async-storage');
  return m.default ?? m;
};
const rag = () => require('../../../src/services/rag').ragService;
const docsInFieldGuides = async (): Promise<{ id: number; name: string; path: string }[]> => rag().getDocumentsByProject('field-guides');

type Opened = Awaited<ReturnType<typeof setupChatScreen>>;
type Fs = NonNullable<Opened['boundary']['fs']>;
type View = ReturnType<Opened['rtl']['render']>;
const downloadsOf = (fs: Fs, url: string) =>
  (fs.module.downloadFile as jest.Mock).mock.calls.filter(([opts]) => opts.fromUrl === url).length;
const exists = (fs: Fs, path: string) => (fs.module.exists as (p: string) => Promise<boolean>)(path);

/** Boot the app with the embedding model shipped, let `seed` set up the device, then open the Guide library. */
async function openLibrary(guides: unknown[], seed: (fs: Fs, dir: string) => void | Promise<void> = () => {}) {
  const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
  const fs = h.boundary.fs!;
  fs.seedAsset('models/all-MiniLM-L6-v2-Q8_0.gguf', 'GGUF');
  h.boundary.llama!.scriptEmbedding(keywordVector);
  const { GUIDE_LIBRARY_DIR } = require('../../../src/features/guideLibrary/guideLibraryService');
  fs.seedDownload(CATALOGUE_URL, catalogueOf(guides));
  await seed(fs, GUIDE_LIBRARY_DIR);
  const view = await mountLibrary(h);
  return { ...h, fs, view, dir: GUIDE_LIBRARY_DIR as string };
}

async function mountLibrary(h: Opened): Promise<View> {
  const before = downloadsOf(h.boundary.fs!, CATALOGUE_URL);
  const { GuideLibraryScreen } = require('../../../src/screens/GuideLibraryScreen');
  const view = h.rtl.render(h.React.createElement(GuideLibraryScreen, {}));
  await h.rtl.waitFor(() => {
    expect(downloadsOf(h.boundary.fs!, CATALOGUE_URL)).toBe(before + 1);
    expect(view.getByTestId('guide-library-refresh')).not.toBeBusy();
  }, { timeout: 4000 });
  return view;
}

async function downloadGuide(h: Opened, view: View, entry: { id: string; url: string }, body: string) {
  h.boundary.fs!.seedDownload(entry.url, body);
  h.rtl.fireEvent.press(view.getByTestId(`guide-download-${entry.id}`));
  await h.rtl.waitFor(() => { expect(view.getByTestId(`guide-open-${entry.id}`)).toBeTruthy(); }, { timeout: 4000 });
}

/** The row's Switch as the screen renders it (its value and disabled props are what the user sees). */
const switchOf = (view: View, id: string) => {
  const { Switch } = require('react-native');
  const found = view.UNSAFE_getAllByType(Switch).find(s => s.props.testID === `guide-teach-${id}`);
  if (!found) throw new Error(`no teach switch for ${id}`);
  return found;
};

async function setTaught(h: Opened, view: View, id: string, on: boolean) {
  h.rtl.fireEvent(switchOf(view, id), 'valueChange', on);
  await h.rtl.waitFor(() => {
    expect(switchOf(view, id).props.value).toBe(on);
    expect(switchOf(view, id).props.disabled).toBeFalsy();
  }, { timeout: 6000 });
}

/** A guide downloaded in an earlier run: its checked file and the saved record of it. */
async function seedDownloaded(fs: Fs, dir: string, entries: { id: string }[], bodyOf: (id: string) => string) {
  for (const e of entries) await (fs.module.writeFile as (p: string, c: string) => Promise<void>)(`${dir}/${e.id}.pdf`, bodyOf(e.id));
  await asyncStorage().setItem('@fieldkit/guide_library', JSON.stringify({ downloaded: Object.fromEntries(entries.map(e => [e.id, e])) }));
}

const NOTE = 'The assistant searches every guide it has learned. More guides make answers slower.';

describe('Guide library teaching (rendered)', () => {
  it('a taught guide answers in a Field guides chat', async () => {
    const h = await openLibrary([KNOTS]);
    const { rtl, view, boundary } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);
    expect(view.getByText('Assistant knows this')).toBeTruthy();
    expect(switchOf(view, 'test-knots').props.value).toBe(false);

    await setTaught(h, view, 'test-knots', true);
    expect(view.getByText('1 guides · 1 downloaded · 1 taught')).toBeTruthy();
    view.unmount();

    openRoute({ projectId: 'field-guides' });
    h.render();
    await h.send('How do I tie a bowline?', { text: 'Form a small loop, pass the end up through it, around the standing part and back down.' });
    await rtl.waitFor(() => { expect(h.view!.queryByText(/around the standing part and back down/)).not.toBeNull(); }, { timeout: 6000 });
    const sent = JSON.stringify(boundary.llama!.calls.completion.at(-1));
    expect(sent).toContain('[Source: Test knots (Test publisher).pdf (part 1)]');
    expect(sent).toContain('pass the running end up through the loop');
  }, 40000);

  it('a taught guide the catalogue drops still answers in a Field guides chat and can be switched off', async () => {
    const OTHER = guide('test-other', 'Test other', WATER_TEXT);
    const h = await openLibrary([KNOTS, OTHER]);
    const { rtl, view, fs, dir, boundary } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);
    await setTaught(h, view, 'test-knots', true);

    fs.seedDownload(CATALOGUE_URL, catalogueOf([OTHER]));
    rtl.fireEvent.press(view.getByTestId('guide-library-refresh'));
    await rtl.waitFor(() => {
      expect(downloadsOf(fs, CATALOGUE_URL)).toBe(2);
      expect(view.getByText('No longer listed')).toBeTruthy();
    }, { timeout: 4000 });
    expect(switchOf(view, 'test-knots').props.value).toBe(true);
    expect(view.getByText('2 guides · 1 downloaded · 1 taught')).toBeTruthy();
    view.unmount();

    openRoute({ projectId: 'field-guides' });
    h.render();
    await h.send('How do I tie a bowline?', { text: 'Form a small loop, pass the end up through it, around the standing part and back down.' });
    await rtl.waitFor(() => { expect(h.view!.queryByText(/around the standing part and back down/)).not.toBeNull(); }, { timeout: 6000 });
    const sent = JSON.stringify(boundary.llama!.calls.completion.at(-1));
    expect(sent).toContain('[Source: Test knots (Test publisher).pdf (part 1)]');
    h.view!.unmount();

    const again = await mountLibrary(h);
    await rtl.waitFor(() => { expect(switchOf(again, 'test-knots').props.value).toBe(true); }, { timeout: 4000 });
    rtl.fireEvent(switchOf(again, 'test-knots'), 'valueChange', false);
    // Once off, a guide the catalogue no longer lists cannot be taught again, so the switch goes.
    await rtl.waitFor(() => { expect(again.queryByTestId('guide-teach-test-knots')).toBeNull(); }, { timeout: 6000 });
    expect(await docsInFieldGuides()).toEqual([]);
    expect(again.getByText('No longer listed')).toBeTruthy();
    expect(again.getByTestId('guide-open-test-knots')).toBeTruthy();
    expect(await exists(fs, `${dir}/test-knots.pdf`)).toBe(true);
  }, 60000);

  it('switching it off removes the guide from the knowledge base and keeps the file', async () => {
    const h = await openLibrary([KNOTS]);
    const { view, fs, dir } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);
    await setTaught(h, view, 'test-knots', true);
    expect((await docsInFieldGuides()).map(d => d.name)).toEqual(['Test knots (Test publisher).pdf']);

    await setTaught(h, view, 'test-knots', false);
    expect(await docsInFieldGuides()).toEqual([]);
    expect(await exists(fs, `${dir}/test-knots.pdf`)).toBe(true);
    expect(view.getByTestId('guide-open-test-knots')).toBeTruthy();
    expect(view.getByText('1 guides · 1 downloaded · 0 taught')).toBeTruthy();
  }, 40000);

  it('removing a taught guide takes it out of the knowledge base and deletes the file', async () => {
    const h = await openLibrary([KNOTS]);
    const { rtl, view, fs, dir } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);
    await setTaught(h, view, 'test-knots', true);

    rtl.fireEvent.press(view.getByTestId('guide-remove-test-knots'));
    await rtl.waitFor(() => { expect(view.getByTestId('guide-download-test-knots')).toBeTruthy(); }, { timeout: 4000 });
    expect(await docsInFieldGuides()).toEqual([]);
    expect(await exists(fs, `${dir}/test-knots.pdf`)).toBe(false);
  }, 40000);

  it('a guide marked scanned cannot be taught', async () => {
    const h = await openLibrary([SCANNED, KNOTS]);
    const { view } = h;
    // Said before downloading, and only for the scanned guide.
    expect(view.getAllByText('Scanned, read only')).toHaveLength(1);
    await downloadGuide(h, view, SCANNED, 'scanned pages');
    expect(view.getAllByText('Scanned, read only')).toHaveLength(1);
    expect(view.queryByTestId('guide-teach-test-scanned')).toBeNull();
    expect(view.queryByText('Assistant knows this')).toBeNull();
  }, 40000);

  it('a guide the phone cannot read shows why and stays downloaded', async () => {
    const h = await openLibrary([BLANK]);
    const { rtl, view, fs, dir } = h;
    await downloadGuide(h, view, BLANK, BLANK_BODY);

    rtl.fireEvent(switchOf(view, 'test-blank'), 'valueChange', true);
    // The knowledge base's own words for a file with no text it can index.
    await rtl.waitFor(() => { expect(view.getByText('Document produced no indexable content')).toBeTruthy(); }, { timeout: 6000 });
    expect(switchOf(view, 'test-blank').props.value).toBe(false);
    expect(view.getByTestId('guide-open-test-blank')).toBeTruthy();
    expect(await exists(fs, `${dir}/test-blank.pdf`)).toBe(true);
    expect(await docsInFieldGuides()).toEqual([]);
  }, 40000);

  it('a teach that fails inside the app shows the fixed message, not the internal error', async () => {
    const h = await openLibrary([KNOTS]);
    const { rtl, view, boundary } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);
    boundary.llama!.scriptEmbedding(() => { throw new Error('Embedding failed (native error) at ggml_compute'); });

    rtl.fireEvent(switchOf(view, 'test-knots'), 'valueChange', true);
    await rtl.waitFor(() => { expect(view.getByText("Couldn't teach this guide to the assistant. Try again.")).toBeTruthy(); }, { timeout: 6000 });
    expect(view.queryByText(/native error|ggml/)).toBeNull();
    expect(switchOf(view, 'test-knots').props.value).toBe(false);
    expect(await docsInFieldGuides()).toEqual([]);
  }, 40000);

  it('a guide whose name is taken by another document in Field guides is not counted as taught', async () => {
    const h = await openLibrary([KNOTS], async fs => {
      // The user added their own file under the same name to the Field guides knowledge base.
      const other = `${fs.DocumentDirectoryPath}/picked/knots.pdf`;
      await (fs.module.writeFile as (p: string, c: string) => Promise<void>)(other, 'My own notes on the bowline.');
      await rag().indexDocument({ projectId: 'field-guides', filePath: other, fileName: 'Test knots (Test publisher).pdf', fileSize: 28, bundled: true });
    });
    const { rtl, view } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);

    rtl.fireEvent(switchOf(view, 'test-knots'), 'valueChange', true);
    await rtl.waitFor(() => { expect(view.getByText('A document with this name is already in Field guides. Remove it there first.')).toBeTruthy(); }, { timeout: 6000 });
    expect(switchOf(view, 'test-knots').props.value).toBe(false);
    expect(view.getByText('1 guides · 1 downloaded · 0 taught')).toBeTruthy();
  }, 40000);

  it('removing a guide while it is being switched off leaves it removed', async () => {
    const h = await openLibrary([KNOTS]);
    const { rtl, view, fs, dir } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);
    await setTaught(h, view, 'test-knots', true);

    await rtl.act(async () => {
      rtl.fireEvent(switchOf(view, 'test-knots'), 'valueChange', false);
      rtl.fireEvent.press(view.getByTestId('guide-remove-test-knots'));
    });
    await rtl.waitFor(() => { expect(view.getByTestId('guide-download-test-knots')).toBeTruthy(); }, { timeout: 4000 });
    // Let anything still running finish: the row must not come back as downloaded with no file.
    await rtl.act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(view.getByTestId('guide-download-test-knots')).toBeTruthy();
    expect(view.queryByTestId('guide-open-test-knots')).toBeNull();
    expect(view.getByText('1 guides · 0 downloaded · 0 taught')).toBeTruthy();
    expect(await exists(fs, `${dir}/test-knots.pdf`)).toBe(false);
    expect(await docsInFieldGuides()).toEqual([]);
  }, 40000);

  it('a guide switched on while another is being taught waits its turn, even when the first fails', async () => {
    const h = await openLibrary([BLANK, KNOTS]);
    const { rtl, view } = h;
    await downloadGuide(h, view, BLANK, BLANK_BODY);
    await downloadGuide(h, view, KNOTS, BOWLINE);

    rtl.act(() => {
      rtl.fireEvent(switchOf(view, 'test-blank'), 'valueChange', true);
      rtl.fireEvent(switchOf(view, 'test-knots'), 'valueChange', true);
    });
    // Both show as being taught until their turn ends.
    expect(switchOf(view, 'test-knots').props.value).toBe(true);
    expect(switchOf(view, 'test-knots').props.disabled).toBe(true);
    await rtl.waitFor(() => {
      expect(view.getByText('Document produced no indexable content')).toBeTruthy();
      expect(switchOf(view, 'test-knots').props.disabled).toBeFalsy();
    }, { timeout: 6000 });
    expect(switchOf(view, 'test-blank').props.value).toBe(false);
    expect(switchOf(view, 'test-knots').props.value).toBe(true);
    expect((await docsInFieldGuides()).map(d => d.name)).toEqual(['Test knots (Test publisher).pdf']);
  }, 40000);

  it('a guide deleted from the knowledge base shows as downloaded again', async () => {
    const h = await openLibrary([KNOTS]);
    const { view } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);
    await setTaught(h, view, 'test-knots', true);
    view.unmount();

    // Elsewhere in the app, the user deletes the document from the Field guides knowledge base.
    const [doc] = await docsInFieldGuides();
    await rag().deleteDocument(doc.id);

    const again = await mountLibrary(h);
    await h.rtl.waitFor(() => { expect(switchOf(again, 'test-knots').props.value).toBe(false); }, { timeout: 4000 });
    expect(again.getByTestId('guide-open-test-knots')).toBeTruthy();
    expect(again.getByText('1 guides · 1 downloaded · 0 taught')).toBeTruthy();
  }, 40000);

  it('teaching recreates the Field guides project if it was deleted', async () => {
    const h = await openLibrary([KNOTS], async () => {
      // An earlier launch created the project, which the user then deleted.
      await asyncStorage().setItem('@fieldkit/field_guides_seeded', JSON.stringify({ projectCreated: true, done: [] }));
    });
    const { view, boundary } = h;
    const { useProjectStore } = require('../../../src/stores/projectStore');
    expect(useProjectStore.getState().getProject('field-guides')).toBeUndefined();

    await downloadGuide(h, view, KNOTS, BOWLINE);
    await setTaught(h, view, 'test-knots', true);
    const project = useProjectStore.getState().getProject('field-guides');
    expect(project?.name).toBe('Field guides');

    // The next launch's seed does not put back the bundled guides the user had removed.
    boundary.fs!.seedAsset('guides/atp-3-50-21-survival.pdf', 'A survival manual.');
    const { seedFieldGuides } = require('../../../src/features/fieldGuides/fieldGuides');
    await seedFieldGuides();
    expect((await docsInFieldGuides()).map(d => d.name)).toEqual(['Test knots (Test publisher).pdf']);
  }, 40000);

  it('teaching before the first-launch seed made the project leaves the bundled guides for the seed to add', async () => {
    // A launch whose seed never got as far as creating the project (nothing saved).
    const h = await openLibrary([KNOTS]);
    const { view, boundary } = h;
    await downloadGuide(h, view, KNOTS, BOWLINE);
    await setTaught(h, view, 'test-knots', true);
    const { useProjectStore } = require('../../../src/stores/projectStore');
    expect(useProjectStore.getState().projects.filter((p: { id: string }) => p.id === 'field-guides')).toHaveLength(1);

    // The next launch's seed adds every shipped guide to the project the teach created, and no second project.
    const shipped = readdirSync(join(__dirname, '../../../android/app/src/main/assets/guides'));
    for (const file of shipped) boundary.fs!.seedAsset(`guides/${file}`, `Shipped guide ${file}.`);
    const { seedFieldGuides } = require('../../../src/features/fieldGuides/fieldGuides');
    await seedFieldGuides();
    const names = (await docsInFieldGuides()).map(d => d.name);
    expect(names).toContain('Test knots (Test publisher).pdf');
    expect(names).toContain('Survival (US Army ATP 3-50.21).pdf');
    expect(names).toHaveLength(shipped.length + 1);
    expect(useProjectStore.getState().projects.filter((p: { id: string }) => p.id === 'field-guides')).toHaveLength(1);
  }, 40000);

  it('the slow-search note appears at the threshold', async () => {
    const many = Array.from({ length: SLOW_SEARCH_TAUGHT_GUIDES }, (_, i) => guide(`test-g${i}`, `Test guide ${i}`, `${WATER_TEXT} ${i}`));
    const bodyOf = (id: string) => `${WATER_TEXT} ${id.slice('test-g'.length)}`;
    const h = await openLibrary(many, async (fs, dir) => {
      await seedDownloaded(fs, dir, many, bodyOf);
      // All but one were taught in an earlier run.
      for (const g of many.slice(1)) {
        await rag().indexDocument({ projectId: 'field-guides', filePath: `${dir}/${g.id}.pdf`, fileName: `${g.title} (${g.publisher}).pdf`, fileSize: g.bytes, bundled: true });
      }
    });
    const { view } = h;
    const below = SLOW_SEARCH_TAUGHT_GUIDES - 1;
    await h.rtl.waitFor(() => { expect(view.getByText(`${many.length} guides · ${many.length} downloaded · ${below} taught`)).toBeTruthy(); }, { timeout: 4000 });
    expect(view.queryByText(NOTE)).toBeNull();

    await setTaught(h, view, 'test-g0', true);
    expect(view.getByText(NOTE)).toBeTruthy();
    // The note explains; it does not stop the user teaching or un-teaching.
    expect(switchOf(view, 'test-g1').props.disabled).toBeFalsy();
  }, 60000);
});
