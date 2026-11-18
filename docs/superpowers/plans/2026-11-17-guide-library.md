# Guide Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Guide library screen where users download checked, copyright-free guides by category, read them at once, and optionally teach each one to the assistant; backed by a catalogue of 100+ checked guides.

**Architecture:** A catalogue JSON file at the repo root is bundled into the app and refreshed from GitHub when the library screen opens. A guide library service owns downloads (verified by size and SHA-256), teaching (the existing RAG index of the Field guides project) and persistence; a zustand store projects its state to one screen. A Node script checks candidate guides and re-verifies the catalogue.

**Tech Stack:** React Native 0.83, TypeScript, zustand, react-native-fs (`downloadFile`, `hash`), `@react-native-documents/viewer`, the existing `ragService`, Jest with the rendered harness in `__tests__/harness/`, Node 22 for the checker.

**Spec:** `docs/superpowers/specs/2026-11-17-guide-library-design.md`. Read it first; this plan argues from it.

**Execution:** subagent-driven (the owner's choice, 2026-11-17): a fresh agent implements each task and a fresh reviewer checks it before the next starts, then a whole-branch review at the end. Use superpowers:subagent-driven-development. The two research tasks (3 and 9) have no code to review; their gate is the checker and the Task 1 test.

## Global Constraints

- Work in this worktree on branch `feat/field-guides`. Commit each green step. Do not push, merge, tag or release. Do not install anything on the phone. Never stash, reset or switch branches.
- Do not touch `src/services/tools`, `src/services/actions` or `generationToolLoop.ts`.
- No new npm dependencies.
- Catalogue licences: only US federal government works by federal employees, CC0, or CC BY, proved as the spec's "What counts as proof" section says. When in doubt, leave it out and add a line to `catalog/REJECTED.md`.
- Network: the app fetches the catalogue only when the Guide library screen opens or the user taps refresh. Never at app start.
- A downloaded file is opened or indexed only after its size and SHA-256 match the catalogue entry.
- UI: theme tokens only (`TYPOGRAPHY`, `COLORS` via `useTheme`, `SPACING`), font weights at or below 400, Feather icons, no emoji, sentence case.
- Services own state and side effects; the store is a read-only projection; the screen holds no business logic.
- Tests: rendered integration tests that mount the real screen and fake only the device boundary (`__tests__/harness/`). Run one file with `npx jest --runInBand <file>`.
- Before every commit: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run depcruise`, `npm run knip`. ESLint limits: 500 lines per file, 350 per function, 3 parameters, complexity 20.
- Downloaded candidate PDFs are untrusted: each in its own new, empty temp directory, paths passed as arguments, deleted after checking, never added to the repo.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. The server answers with something that is not the PDF: an HTML bot-challenge page with status 200, or a 404 or 429. Expected: no file is kept; a 200 with wrong bytes shows the mismatch message, a non-200 shows the "couldn't download" message. (Task 5)
2. A download is cut off part-way (connection drops, app killed). Expected: no `.pdf` and no `.part` file remains after the next launch, the row offers Download again, and a retry works. (Task 5)
3. The taught document, or the whole Field guides project, is deleted outside the library (knowledge base screen, project delete). Expected: the library shows the guide as downloaded, not taught, the next time it is opened. (Task 6)
4. The catalogue says `hasText: true` but the phone extracts no text. Expected: the row shows the service's "scanned PDF" message, the switch returns to off, the file stays downloaded. (Task 6)
5. A fetched catalogue carries a hostile or broken entry: an `id` like `../../x`, a duplicate `id`, an `http:` URL. Expected: the whole fetched catalogue is ignored and the current list stays. (Task 1)

---

## File Structure

| File | Responsibility |
|---|---|
| `catalog/guides.json` | The catalogue: categories and checked guides. Bundled and fetched. |
| `catalog/candidates.json` | Guides proposed for checking (hand-written fields only). Input to the checker. |
| `catalog/REJECTED.md` | Candidates left out, one line each with the reason. |
| `scripts/check-guides.js` | Checks candidates into the catalogue; re-verifies the catalogue. |
| `src/features/guideLibrary/catalogue.ts` | Catalogue types, `parseCatalogue`, the bundled catalogue, `CATALOGUE_URL`. |
| `src/features/guideLibrary/guideLibraryStore.ts` | Zustand projection of library state. |
| `src/features/guideLibrary/guideLibraryService.ts` | State machine: refresh, download, verify, open, teach, remove, persist, reconcile. |
| `src/screens/GuideLibraryScreen.tsx`, `.styles.ts` | The screen. |
| `src/features/fieldGuides/fieldGuides.ts` | Gains `ensureFieldGuidesProject()`, shared by the seed and the library. |
| `__tests__/harness/nativeBoundary.ts` | File-system fake gains real `hash`, scripted `downloadFile`. |

---

### Task 1: Catalogue format and validator

**Files:**
- Create: `catalog/guides.json`, `src/features/guideLibrary/catalogue.ts`
- Test: `__tests__/unit/features/guideLibrary/catalogue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GuideCategory { id: string; name: string }
  export interface GuideEntry {
    id: string; title: string; category: string; publisher: string; year: number;
    licence: string; licenceNote: string; url: string; bytes: number; sha256: string;
    pages: number; hasText: boolean;
  }
  export interface Catalogue { version: 1; updated: string; categories: GuideCategory[]; guides: GuideEntry[] }
  export const CATALOGUE_URL = 'https://raw.githubusercontent.com/bth0mp/fieldkit-ai/main/catalog/guides.json';
  export function parseCatalogue(raw: unknown): Catalogue | null;
  export const bundledCatalogue: Catalogue; // parseCatalogue(require('../../../catalog/guides.json')), throws at import if invalid
  ```

- [x] **Step 1: Create `catalog/guides.json`** with `version: 1`, `updated: "2026-11-17"`, an empty `guides` array and these categories (ids in brackets): First aid and medical (`medical`), Water and sanitation (`water`), Food growing, preserving and foraging (`food`), Shelter and building (`building`), Power and electrical (`power`), Fieldcraft, knots and survival (`fieldcraft`), Navigation and weather (`navigation`), Radio and communications (`radio`), Vehicles, engines and tools (`mechanical`), Disasters and emergencies (`disasters`), Animals and farming (`farming`).

- [x] **Step 2: Write the failing tests**

```ts
const good = { version: 1, updated: '2026-11-17', categories: [{ id: 'medical', name: 'First aid and medical' }],
  guides: [{ id: 'army-x', title: 'X', category: 'medical', publisher: 'US Army', year: 2015, licence: 'Public domain',
    licenceNote: 'n', url: 'https://example.mil/x.pdf', bytes: 10, sha256: 'a'.repeat(64), pages: 3, hasText: true }] };
const withGuide = (patch: object) => ({ ...good, guides: [{ ...good.guides[0], ...patch }] });

it('accepts a well-formed catalogue', () => expect(parseCatalogue(good)).toEqual(good));
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
it('the shipped catalogue is valid and has no duplicate urls', () => {
  expect(bundledCatalogue.version).toBe(1);
  const urls = bundledCatalogue.guides.map(g => g.url);
  expect(new Set(urls).size).toBe(urls.length);
});
```

- [x] **Step 3: Run it.** `npx jest --runInBand __tests__/unit/features/guideLibrary/catalogue.test.ts`. Expected: FAIL, module not found.

- [x] **Step 4: Implement `catalogue.ts`.** `parseCatalogue` returns the catalogue only if every check passes, else `null`: `version === 1`; non-empty string `title`, `publisher`, `licence`, `licenceNote`; `id` matches `/^[a-z0-9][a-z0-9-]{0,63}$/` and is unique; `url` starts with `https://`; `sha256` matches `/^[0-9a-f]{64}$/`; `bytes` and `pages` are positive integers; `year` is an integer; `hasText` is a boolean; `category` is one of the catalogue's category ids. Unknown extra fields are dropped.

- [x] **Step 5: Run the test.** Expected: PASS.

- [x] **Step 6: Checks and commit.** `feat(guides): catalogue format and validator for the guide library`

---

### Task 2: Catalogue checker script

**Files:**
- Create: `scripts/check-guides.js`, `catalog/candidates.json` (an empty array), `catalog/REJECTED.md` (a heading and one line saying what the file is)
- Test: `__tests__/unit/scripts/checkGuides.test.ts`

**Interfaces:**
- Consumes: the `GuideEntry` shape from Task 1 (field names only; the script is plain CommonJS).
- Produces: `module.exports = { hasReleaseStatement, describePdf }` and a CLI:
  - `node scripts/check-guides.js` checks every entry of `catalog/candidates.json` whose `id` is not yet in `catalog/guides.json`, appends the ones that pass to `guides.json` (sorted by category, then title), and prints one line per candidate: `added`, or `FAILED <id>: <reason>`.
  - `node scripts/check-guides.js --verify` re-downloads every guide in `guides.json` and exits 1 if any link is dead or any size or hash differs.
  - A candidate has `id, title, category, publisher, year, licence, licenceNote, url`. The script adds `bytes, sha256, pages, hasText`.

- [x] **Step 1: Write the failing tests**

```ts
const { hasReleaseStatement, describePdf } = require('../../../scripts/check-guides.js');
it('recognises the public-release statement across line breaks and case', () => {
  expect(hasReleaseStatement('DISTRIBUTION RESTRICTION: Approved for public\nrelease; distribution is unlimited.')).toBe(true);
  expect(hasReleaseStatement('Distribution authorized to U.S. Government agencies only')).toBe(false);
});
it('describes a file by size and sha256 and refuses a non-PDF', async () => {
  // write '%PDF-1.4 test' and '<html>blocked</html>' to two files under os.tmpdir()
  await expect(describePdf(pdfPath)).resolves.toMatchObject({ bytes: 13, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  await expect(describePdf(htmlPath)).rejects.toThrow('not a PDF');
});
```

- [x] **Step 2: Run it.** Expected: FAIL, module not found.

- [x] **Step 3: Implement the script.** Decisions the tests do not fix:
  - Download with Node's `fetch`, following redirects, header `User-Agent: Dalvik/2.1.0 (Linux; U; Android 14)` (what the phone's downloader sends), one request at a time, 2 seconds between requests to the same host, 3 tries with a growing wait. Refuse a response over 60 MB (`MAX_BYTES`) or one that does not start with `%PDF-`.
  - Each file goes into its own `fs.mkdtempSync(path.join(os.tmpdir(), 'guide-'))` directory and that directory is removed afterwards, also on failure.
  - `pages` = number of form feeds in `pdftotext <file> -` output. `hasText` = at least 2,000 non-whitespace characters in `pdftotext -l 30 <file> -`. Run `pdftotext` with `execFileSync` and the path as an argument. If `pdftotext` is not on the PATH, stop with a message naming Git Bash's `/mingw64/bin`.
  - If the candidate's `licenceNote` claims a distribution statement (contains "approved for public release") and `hasReleaseStatement` does not find it in the first 30 pages of text, fail the candidate with `release statement not found in the document`. A scanned document cannot be confirmed this way: fail it with `scanned, statement must be confirmed by eye` unless the candidate has `"statementSeen": true`.
  - `--verify` only compares `bytes` and `sha256`.
  - Run only when `require.main === module`, so the tests can import the helpers.

- [x] **Step 4: Run the tests.** Expected: PASS. Then run `node scripts/check-guides.js` with the empty candidates file. Expected: prints `0 candidates` and exits 0.

- [x] **Step 5: Checks and commit.** `feat(guides): script that checks candidate guides into the catalogue`

---

### Task 3: First batch of the catalogue (at least 30 guides)

**Files:**
- Modify: `catalog/candidates.json`, `catalog/guides.json`, `catalog/REJECTED.md`

This is research, not code. Its test is the checker and the Task 1 unit test.

- [x] **Step 1: Collect candidates**, at least three per category where they exist. Start where proof is printed in the document: Army ATP, TC, TM and FM publications on armypubs.army.mil marked "approved for public release; distribution is unlimited" (medical, field sanitation, map reading and land navigation, engineering, carpentry, plumbing, electrical, vehicle recovery, cold-weather and mountain operations), the remaining Navy NEETS modules and NAVEDTRA rate training manuals (Builder, Construction Electrician, Utilitiesman, Hospital Corpsman), Marine Corps and Coast Guard manuals. Then civilian agencies whose document or site states public domain (FEMA, CDC, USDA, NOAA/NWS, USGS, NPS, EPA). Skip the six guides already bundled (`scripts/gen-notices.js` lists them).
- [x] **Step 2: For each candidate, read the document's front matter** and write the `licenceNote` from what it says, following the spec's proof and source rules. Anything that fails goes to `catalog/REJECTED.md` with its reason.
- [x] **Step 3: Run `node scripts/check-guides.js`.** Expected: every candidate prints `added` or a `FAILED` reason. Fix or reject each failure.
- [x] **Step 4: Run the Task 1 test file.** Expected: PASS with at least 30 guides.
- [x] **Step 5: Commit** in batches of about ten guides: `feat(guides): add <n> checked <category> guides to the catalogue`

---

### Task 4: Device-boundary fakes for downloads

**Files:**
- Modify: `__tests__/harness/nativeBoundary.ts` (the `FsFake` interface and `makeFsFake`, near lines 866-933)
- Test: `__tests__/harness/nativeBoundary.smoke.test.ts`

**Interfaces:**
- Produces, on `FsFake`:
  ```ts
  /** What a URL serves to downloadFile. A string is a 200 body; an unseeded URL fails like no connection. */
  seedDownload(url: string, response: string | { status: number; body?: string } | { failAfter: string }): void;
  ```
  - `downloadFile({ fromUrl, toFile, progress })` returns `{ jobId, promise }`. For a string or `{ status, body }` it writes the body to `toFile`, calls `progress({ bytesWritten, contentLength })` once, and resolves `{ statusCode, bytesWritten }`. For `{ failAfter }` it writes that partial text to `toFile` and rejects with `Error('Network request failed')`. For an unseeded URL it rejects with the same error and writes nothing.
  - `hash(path, 'sha256')` resolves the real SHA-256 hex of the file in the fake volume (Node `crypto`).

- [x] **Step 1: Add smoke tests** that seed a URL, download it to `/docs/a.pdf`, and assert the file content, the resolved `statusCode` and that `hash` equals `crypto.createHash('sha256').update(body).digest('hex')`; and that an unseeded URL rejects and leaves no file.
- [x] **Step 2: Run.** Expected: FAIL (`seedDownload` is not a function).
- [x] **Step 3: Implement.**
- [x] **Step 4: Run the smoke file and `__tests__/integration/knowledge-base/fieldGuidesAnswer.rendered.test.tsx`.** Expected: both PASS.
- [x] **Step 5: Checks and commit.** `test(harness): scripted downloads and real hashes on the file-system fake`

---

### Task 5: Library screen with refresh, download, open and remove

**Files:**
- Create: `src/features/guideLibrary/guideLibraryStore.ts`, `src/features/guideLibrary/guideLibraryService.ts`, `src/screens/GuideLibraryScreen.tsx`, `src/screens/GuideLibraryScreen.styles.ts`
- Modify: `src/screens/index.ts`, `src/navigation/types.ts` (add `GuideLibrary: undefined;`), `src/navigation/AppNavigator.tsx` (register the screen next to `KnowledgeBase`)
- Test: `__tests__/integration/knowledge-base/guideLibrary.rendered.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`Catalogue`, `GuideEntry`, `parseCatalogue`, `bundledCatalogue`, `CATALOGUE_URL`), Task 4 (`seedDownload`, real `hash`).
- Produces:
  ```ts
  // guideLibraryStore.ts
  export type GuidePhase = 'none' | 'downloading' | 'downloaded' | 'teaching' | 'taught';
  export interface GuideState { phase: GuidePhase; progress?: number; error?: string }
  export interface GuideLibraryState {
    catalogue: Catalogue;
    guides: Record<string, GuideState>;   // missing id means { phase: 'none' }
    delisted: GuideEntry[];               // downloaded guides the catalogue no longer lists (Task 7)
    refreshing: boolean;
  }
  export const useGuideLibraryStore: UseBoundStore<StoreApi<GuideLibraryState>>;

  // guideLibraryService.ts
  export const GUIDE_LIBRARY_DIR: string;        // `${RNFS.DocumentDirectoryPath}/guide-library`
  export const guideLibraryService: {
    init(): Promise<void>;                        // idempotent: load saved state, clean up, reconcile
    refresh(): Promise<void>;
    download(id: string): Promise<void>;
    open(id: string): Promise<void>;
    remove(id: string): Promise<void>;
  };
  ```
- Persistence: AsyncStorage key `@fieldkit/guide_library` holds `{ downloaded: Record<string, GuideEntry> }`, the catalogue entry each file was checked against. Files are `${GUIDE_LIBRARY_DIR}/<id>.pdf`; downloads write `<id>.pdf.part` first. The last good fetched catalogue is kept at `${GUIDE_LIBRARY_DIR}/catalogue.json`.
- Exact copy: header `Guide library`; search placeholder `Search guides`; summary `{n} guides · {d} downloaded · {t} taught`; buttons `Download`, `Open`, `Remove`; errors `This file doesn't match the checked copy`, `Couldn't download this guide. Try again.`, `No connection. Try again when you're online.`
- Test ids: `guide-library-search`, `guide-library-refresh`, `guide-row-<id>`, `guide-download-<id>`, `guide-open-<id>`, `guide-remove-<id>`.

- [x] **Step 1: Write the failing rendered tests.** Use `setupChatScreen({ engine: 'llama', pdf: true, sqlite: true })` for the boundary, the navigation mock and `openRoute` pattern from `fieldGuidesAnswer.rendered.test.tsx`, and render `GuideLibraryScreen`. A helper builds a catalogue of two test guides (`test-knots` titled `Test knots`, `test-water` titled `Test water`, both with publisher `Test publisher`) whose `bytes` and `sha256` are computed from their fake bodies, and seeds it at `CATALOGUE_URL`.
  - `shows the bundled catalogue when there is no connection`: nothing seeded; before the screen is rendered, expect `boundary.fs.module.downloadFile` not to have been called (the app fetches nothing until the library opens); after rendering, expect the summary to start with `${bundledCatalogue.guides.length} guides` and a category heading to be visible.
  - `a refreshed catalogue adds guides, and a malformed one changes nothing`: seed the two-guide catalogue, open the screen, expect `test-knots`'s title; seed `'{ not json'` at `CATALOGUE_URL`, press `guide-library-refresh`, expect the title still shown.
  - `downloads a guide, opens it and removes it`: press `guide-download-test-knots`; expect `guide-open-test-knots`; press it and expect the viewer mock (`@react-native-documents/viewer`, mocked in `jest.setup.ts`) called with `{ uri: 'file:///docs/guide-library/test-knots.pdf', mimeType: 'application/pdf', grantPermissions: 'read' }`; press `guide-remove-test-knots`; expect the Download button back and the file gone.
  - `a response that is not the checked file is refused`: serve `'<html>Access denied</html>'` for the guide; expect `This file doesn't match the checked copy`, no `.pdf` and no `.part` file. Then serve `{ status: 404 }`; expect `Couldn't download this guide. Try again.`
  - `a download cut off part-way leaves nothing behind and can be retried`: serve `{ failAfter: 'partial' }`; expect `No connection. Try again when you're online.` and no `.part` file; re-seed the full body, press Download, expect Open. Also: a `test-water.pdf.part` file seeded into `/docs/guide-library` before the screen mounts is gone after `init`.
  - `a second tap while downloading does not start a second download`: press Download twice; expect `boundary.fs.module.downloadFile` called once for that URL.
  - `search filters by title and publisher`.
- [x] **Step 2: Run.** Expected: FAIL, screen not found.
- [x] **Step 3: Implement the store and service.** Decisions:
  - `init` loads the saved catalogue file if it parses, else `bundledCatalogue`; loads `downloaded`; deletes every `*.part` in `GUIDE_LIBRARY_DIR`; drops saved entries whose file is missing; sets each remaining guide to `downloaded`.
  - `refresh` downloads `CATALOGUE_URL` to `catalogue.json.part` with `RNFS.downloadFile`, reads and parses it with `parseCatalogue`; on success renames it over `catalogue.json` and publishes it; on any failure deletes the part file and changes nothing. It never throws.
  - `download` ignores a guide that is not in phase `none`; verifies status 200, then `bytes` (`RNFS.stat`) and `RNFS.hash(path, 'sha256')` against the entry; renames on success; deletes the part file on every failure. A rejected download promise maps to the no-connection message.
  - Progress comes from `downloadFile`'s `progress` callback with `progressDivider: 5`.
- [x] **Step 4: Implement the screen** as a `SectionList` grouped by category, modelled on `src/screens/OpenSourceLicensesScreen.tsx` (header, expandable rows). It calls `guideLibraryService.init()` then `refresh()` on mount and reads everything from the store. A row shows title, then `publisher · size · licence`; expanded, it adds year, pages, `licenceNote` and the URL as selectable text. Empty categories are hidden.
- [x] **Step 5: Run the test file.** Expected: PASS.
- [x] **Step 6: Checks and commit.** `feat(guides): guide library screen with checked downloads`

---

### Task 6: Teach a guide to the assistant

**Files:**
- Modify: `src/features/guideLibrary/guideLibraryService.ts`, `src/screens/GuideLibraryScreen.tsx`, `src/features/fieldGuides/fieldGuides.ts`
- Test: `__tests__/integration/knowledge-base/guideLibraryTeach.rendered.test.tsx`

**Interfaces:**
- Consumes: Task 5; `ragService.indexDocument`, `getDocumentsByProject`, `deleteDocument` (`src/services/rag/index.ts`); `FIELD_GUIDES_PROJECT_ID`.
- Produces:
  ```ts
  // fieldGuides.ts
  /** If the Field guides project is missing, creates it and marks every bundled guide as handled in the
   *  seed's saved state, so the first-launch seed does not re-add guides to a project the user had deleted. */
  export function ensureFieldGuidesProject(): Promise<void>;
  // guideLibraryService
  teach(id: string): Promise<void>;
  unteach(id: string): Promise<void>;
  export const SLOW_SEARCH_TAUGHT_GUIDES = 10;        // tune after measuring on the phone
  ```
- The knowledge-base document for a guide is named `` `${title} (${publisher}).pdf` `` and has `path` = the guide's file path. "Taught" means a document with that path exists in project `field-guides`.
- Exact copy: switch label `Assistant knows this`; `Scanned, read only`; note `The assistant searches every guide it has learned. More guides make answers slower.`
- Test ids: `guide-teach-<id>` (the switch).

- [x] **Step 1: Write the failing rendered tests** (same setup as Task 5, plus `boundary.llama.scriptEmbedding` and the embedding model asset as in `fieldGuidesAnswer.rendered.test.tsx`):
  - `a taught guide answers in a Field guides chat`: download `test-knots` (body contains `pass the running end up through the loop`), switch `guide-teach-test-knots` on, wait for it to show on; open a chat with `projectId: 'field-guides'`, send `How do I tie a bowline?`; expect the last completion call to contain `[Source: Test knots (Test publisher).pdf (part 1)]` and the passage.
  - `switching it off removes the guide from the knowledge base and keeps the file`.
  - `a guide marked scanned cannot be taught`: `hasText: false` shows `Scanned, read only` and no switch.
  - `a guide the phone cannot read shows why and stays downloaded`: the body is empty text; expect the row to show the service's scanned-PDF message and the switch off.
  - `a guide deleted from the knowledge base shows as downloaded again`: teach, delete the document with `ragService.deleteDocument`, re-mount the screen; expect the switch off.
  - `teaching recreates the Field guides project if it was deleted`.
  - `the slow-search note appears at the threshold`: with `SLOW_SEARCH_TAUGHT_GUIDES` taught documents present, the note is visible.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.** Decisions:
  - Move the `createProject({...})` call in `seedFieldGuides` into one private helper (same name, description, prompt and colour). The seed keeps calling that helper directly; `ensureFieldGuidesProject` calls it and then saves the seed state with every bundled asset in `done`. The seed's rule that a project the user deleted is not re-seeded stays.
  - `teach` runs one guide at a time through a promise chain; phase `teaching` while it runs; awaits `ensureFieldGuidesProject()` then `ragService.indexDocument({ projectId, filePath, fileName, fileSize: entry.bytes, bundled: true })`. An "already in the knowledge base" error counts as taught. Any other error sets `error` to its message and returns the phase to `downloaded`.
  - `init` (and the screen on focus) reconciles `taught` from `ragService.getDocumentsByProject('field-guides')` by path.
  - `remove` un-teaches first.
- [x] **Step 4: Run both library test files and `fieldGuidesAnswer.rendered.test.tsx`.** Expected: PASS.
- [x] **Step 5: Checks and commit.** `feat(guides): teach a downloaded guide to the assistant`

---

### Task 7: Guides the catalogue no longer lists

**Files:**
- Modify: `src/features/guideLibrary/guideLibraryService.ts`, `src/screens/GuideLibraryScreen.tsx`
- Test: `__tests__/integration/knowledge-base/guideLibrary.rendered.test.tsx`

**Interfaces:**
- Consumes: the saved `downloaded` entries from Task 5.
- Exact copy: section heading `No longer listed`; row line `Removed from the library. Your copy still works.`

- [x] **Step 1: Write the failing rendered tests:**
  - `a downloaded guide dropped by a refresh stays usable under "No longer listed"`: download `test-knots`, refresh with a catalogue that only has `test-water`; expect the heading, the row line, and `guide-open-test-knots` still working; `guide-remove-test-knots` removes the row entirely.
  - `a changed hash in a refreshed catalogue leaves the downloaded copy alone`: refresh with a different `sha256` for `test-knots`; expect Open still shown and no error.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.** After every catalogue change, `delisted` = saved entries whose id is not in the catalogue. The section renders last and its rows have no Download button.
- [x] **Step 4: Run.** Expected: PASS.
- [x] **Step 5: Checks and commit.** `feat(guides): keep downloaded guides usable after they leave the catalogue`

---

### Task 8: Entry points and credits

**Files:**
- Modify: `src/screens/KnowledgeBaseScreen.tsx`, `src/screens/SettingsScreen.tsx` (a nav item above About, near line 237), `src/screens/OpenSourceLicensesScreen.tsx`
- Test: `__tests__/integration/knowledge-base/guideLibraryEntry.rendered.test.tsx`

**Interfaces:**
- Exact copy: knowledge base row `Guide library` with description `Download more free guides`; Settings item `Guide library` with description `Free guides to download and use offline`; licences intro gains the sentence `Guides you download from the Guide library are listed there with their licences.`
- Test ids: `kb-open-guide-library`, `settings-guide-library`.

- [x] **Step 1: Write the failing rendered tests:** the Field guides knowledge base screen shows `kb-open-guide-library` and pressing it navigates to `GuideLibrary` (capture `navigate` in the navigation mock); a knowledge base for any other project does not show it; the licences screen shows the new sentence.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.** The knowledge base row renders only when `projectId === FIELD_GUIDES_PROJECT_ID`, above the document list and also in the empty state.
- [x] **Step 4: Run.** Expected: PASS.
- [x] **Step 5: Checks and commit.** `feat(guides): reach the guide library from the knowledge base and Settings`

---

### Task 9: Grow the catalogue past 100 guides

**Files:**
- Modify: `catalog/candidates.json`, `catalog/guides.json`, `catalog/REJECTED.md`

- [ ] **Step 1: Repeat Task 3's steps** in batches of about ten until the catalogue has at least 100 guides, then keep going while time allows. Fill thin categories first. Commit each batch.
  - **Not reached (2026-11-18): 36 guides.** Five batches, a cleanup and two text checks ran. About 400 documents were examined and 121 proposed; licence reviews, the third-party scan, the second-copy rule and the readability check removed the rest. Every removal has its reason in `catalog/REJECTED.md`; candidates held for the owner's decisions are in `catalog/pending/`. Growing the list depends on those decisions (see the morning report in the shared notes).
- [x] **Step 2: Run `node scripts/check-guides.js --verify`.** Expected: exit 0. Remove or fix any guide that fails.
- [x] **Step 3: Set `updated`** in `catalog/guides.json` to the date of the last batch and commit.

---

### Task 10: Final checks and hand-over

- [x] **Step 1: Run** `npx tsc --noEmit`, `npx eslint src __tests__ scripts/check-guides.js`, `npm run depcruise`, `npm run knip`. Expected: clean, apart from the one existing `App.tsx` warning.
- [x] **Step 2: Run** `npx jest --findRelatedTests $(git diff --name-only 8ac90f404 -- '*.ts' '*.tsx' '*.js')`. Expected: PASS. Rerun a timed-out heavy suite alone with `--runInBand --testTimeout=40000` before treating it as real.
- [x] **Step 3: Update the shared notes file** `C:\Users\bth0m\AppData\Roaming\Claude\side-session-notes\local_6f40378b-e99c-44e6-abbf-796c9a64ce81\field-guides.md`: commits, guide count per category, what was skipped, and what still needs the owner (phone check, merge and push so the catalogue URL goes live, release).
- [x] **Step 4: Stop.** Do not push or merge.

---

### Task 11: The owner's rulings (added 18 November 2026)

The owner ruled on the five open catalogue questions the morning after the build. The rulings and the one test for reproduced material are in the design doc, section "Owner's rulings, 18 November 2026".

- [x] **Step 1: Record the rulings** in the design doc.
- [x] **Step 2: Read only.** The library row for a guide with `hasText: false` says "Read only. The assistant can't learn this guide." The checker ships `hasText: false` for a candidate with `readOnly: true` and a `readOnlyNote`, and `--verify` reports a mismatch.
- [x] **Step 3: Read every document the rulings affect** (ruling 1: eight; ruling 2: ten; ruling 4: eight), including every page a program cannot read, by eye.
- [x] **Step 4: Add the cleared guides** and have the batch reviewed by a licence reviewer who opens the documents. Result: 36 to 54 guides, seven of them read only, after three review rounds.
- [x] **Step 5: Exact page counts.** The checker subtracts form feeds that are text, not page breaks.
- [x] **Step 6: Final checks**: tsc, eslint, depcruise, knip, the whole Jest suite, and `--verify` of every guide.

Still open, for the owner: a by-eye audit of about 2,750 pages with scanned figures in the guides whose pictures were not all looked at (a credit can sit inside a picture, and a maker's catalogue photograph carries none); a phone test of teaching a Navy module, which the checker's PDF tool misreads and the app's does not; the close calls listed in the shared notes.
