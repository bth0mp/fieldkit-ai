# Library projects and Kiwix files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One project per library category holds that category's field guides and Kiwix `.zim` files, and a chat
in it can look up and read Kiwix articles offline.

**Architecture:** `src/features/library/` owns the category projects and the one-time move off the Field guides
project. `src/services/kiwix/` holds a from-scratch ZIM reader over byte-range reads, and a service that owns the
added files (store is a read-only projection). The existing `search_knowledge_base` tool gains a Kiwix part. A
small Android module lists a picked folder.

**Tech Stack:** React Native 0.83, TypeScript, zustand, op-sqlite (RAG), `react-native-fs` (dr.pogodin fork,
patched), `@react-native-documents/picker` 12, `fzstd` 0.1.1 (MIT), `node-html-parser`, Kotlin, Jest with the
`__tests__/harness` device fakes.

**Spec:** `docs/superpowers/specs/2026-11-18-kiwix-library-design.md`

## Global Constraints

- No GPL, AGPL or LGPL code or dependencies; no code from libzim or libkiwix. The ZIM reader is written from scratch.
- No names from the app this one started from, and no Kiwix logo in the UI. Naming `.zim` and Kiwix as a file source is fine.
- UI: theme tokens only (`TYPOGRAPHY`, `COLORS` via `useTheme`, `SPACING`), font weight ≤ 400, Feather icons, no emoji.
- Screens and hooks hold no business logic; services own state and side effects; stores are read-only projections.
- Never read a whole `.zim` file; reads are byte ranges.
- Project id for a category: `library-<categoryId>`. Extra categories: `travel` "Hiking and travel", `general`
  "General reference".
- New storage keys use the `@fieldkit/` prefix: `@fieldkit/kiwix_files`, `@fieldkit/field_guides_moved`.
- After adding `fzstd`: `node scripts/gen-notices.js` and commit `src/generated/thirdPartyNotices.json`.
- Each green step is its own commit, message `type(scope): ...` ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push to `main`; never `--no-verify`.
- Checks before each commit: `npx tsc --noEmit`, `npx eslint <changed files>`, `npx jest --findRelatedTests
  <changed files>`; before the PR also `npm run depcruise` and `npm run knip`. A rendered suite that times out in a
  parallel run is rerun alone with `npx jest --runInBand <file>` before it counts as failing.
- Do not upgrade `llama.rn`.

## Review Focus

1. A Kiwix file deleted or moved after it was added (its uri no longer opens): the search names that file as
   unreadable in one line and still searches the others; nothing crashes. Test in Task 6.
2. Adding the same folder twice, or "Check for new files" with nothing new: no file is listed twice. Test in Task 6.
3. A lower-case or non-English query ("burn", "café"): finds "Burn" and "Café" by the capitalised candidate, and
   titles compare as UTF-8 bytes, the order the file is sorted in. Test in Task 5.
4. The user deletes a category project that holds Kiwix files: those files leave the Kiwix list too (as the
   project's documents do), and adding a file of that category again brings the project back. Test in Task 8.
5. Adding hundreds of files is cut short (a refused file, or the app killed): every file added before stays saved,
   and "Check for new files" adds the rest. Test in Task 6.

---

### Task 1: Category projects, bundled guides go into them

**Files:**
- Create: `src/features/library/libraryProjects.ts`
- Modify: `src/features/fieldGuides/fieldGuides.ts` (FIELD_GUIDES gains `category`; seed indexes into category
  projects; `createFieldGuidesProject`, `ensureFieldGuidesProject`, `FIELD_GUIDES_PROJECT_ID` stay exported only
  until Task 3 removes their callers)
- Modify: `src/screens/KnowledgeBaseScreen.tsx:183` (Guide library row when `isLibraryProject(projectId)`)
- Test: `__tests__/integration/knowledge-base/fieldGuidesAnswer.rendered.test.tsx` (updated)

**Interfaces:**
- Produces (`libraryProjects.ts`):
  - `LIBRARY_PROJECT_PREFIX = 'library-'`
  - `libraryProjectId(categoryId: string): string` → `library-<categoryId>`
  - `isLibraryProject(projectId: string | undefined): boolean`
  - `libraryCategories(): GuideCategory[]` — `useGuideLibraryStore.getState().catalogue.categories` followed by
    `{ id: 'travel', name: 'Hiking and travel' }`, `{ id: 'general', name: 'General reference' }` (no duplicates)
  - `categoryName(categoryId: string): string` (falls back to the id)
  - `projectStoreHydrated(): Promise<void>` (moved here from fieldGuides.ts)
  - `ensureCategoryProject(categoryId: string): Promise<string>` — waits for hydration, creates the project if
    missing with `id`, `name: categoryName(id)`, `description: \`Field guides and Kiwix files for ${name}\``,
    `systemPrompt: LIBRARY_SYSTEM_PROMPT`, `icon: '#84CC16'`; returns the project id
  - `libraryProjectIds(): string[]` — ids of existing projects that pass `isLibraryProject`
- `LIBRARY_SYSTEM_PROMPT`: today's Field guides `SYSTEM_PROMPT`, with "the field guides in your knowledge base"
  changed to "this project's field guides and Kiwix files" and "name the guide you used" to "name the guide or
  article you used".
- Bundled categories (by asset): `atp-3-50-21-survival.pdf` fieldcraft; `ships-medicine-chest.pdf` medical;
  `atp-4-02-11-first-aid.pdf` medical; `tc-4-02-3-field-hygiene.pdf` water; `nrcs-tn28-solar-pumps.pdf` power;
  `neets-1-direct-current.pdf` power.
- Seed state keeps `done: string[]`; `projectCreated` is no longer read. A guide in `done` is never re-added.

- [ ] **Step 1: Update the test to the category projects**

In `fieldGuidesAnswer.rendered.test.tsx`: after `seedFieldGuides()`, open the knowledge base of
`library-fieldcraft` and expect `Survival (US Army ATP 3-50.21).pdf`; open `library-medical` and expect exactly the
two medical guides (`queryAllByText(/\.pdf$/)` length 2) and the `kb-open-guide-library` row; start the chat in
`library-fieldcraft` and keep the two `sent` assertions. Also assert
`useProjectStore.getState().getProject('field-guides')` is undefined and `getProject('library-medical')?.name`
is `'First aid and medical'`.

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest --runInBand __tests__/integration/knowledge-base/fieldGuidesAnswer.rendered.test.tsx`
Expected: FAIL (no `library-fieldcraft` project).

- [ ] **Step 3: Implement `libraryProjects.ts`, the seed change and the KB row**

`seedFieldGuides`: for each guide not in `done`: copy, `ensureCategoryProject(guide.category)`, index into it
unless a document with that name is already there, push to `done`, save.

- [ ] **Step 4: Run it and see it pass; run the related suites**

Run: `npx jest --runInBand __tests__/integration/knowledge-base/fieldGuidesAnswer.rendered.test.tsx` → PASS.
Run: `npx jest --findRelatedTests src/features/fieldGuides/fieldGuides.ts src/screens/KnowledgeBaseScreen.tsx src/features/library/libraryProjects.ts` → PASS
(fix tests that expected the Field guides project from the seed).

- [ ] **Step 5: Commit** — `feat(library): bundled guides go into one project per category`

### Task 2: Teaching a library guide puts it in its category project

**Files:**
- Modify: `src/features/guideLibrary/guideLibraryService.ts` (`teachNow`, `libraryDocuments`, `teachFailure`)
- Modify: `src/features/guideLibrary/guideLibraryDisk.ts` (`deleteFromKnowledgeBase`)
- Test: `__tests__/integration/knowledge-base/guideLibraryTeach.rendered.test.tsx`,
  `guideLibraryEntry.rendered.test.tsx` (updated)

**Interfaces:**
- Consumes: `ensureCategoryProject`, `libraryProjectIds`, `libraryProjectId` (Task 1).
- `teachNow` indexes into `await ensureCategoryProject(entry.category)`.
- `libraryDocuments()` and `deleteFromKnowledgeBase(id)` read the documents of every `libraryProjectIds()` project.

- [ ] **Step 1: Update the tests**

`guideLibraryTeach`: the taught guide's document appears in the knowledge base of `library-<its category>` (read
the category from the test's catalogue entry), and not in any other project. `guideLibraryEntry`: the Guide
library row shows in a library project's knowledge base and not in an ordinary project's.

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest --runInBand __tests__/integration/knowledge-base/guideLibraryTeach.rendered.test.tsx __tests__/integration/knowledge-base/guideLibraryEntry.rendered.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the three service changes and the disk change**

- [ ] **Step 4: Run them, then all guide library suites**

Run: `npx jest --runInBand __tests__/integration/knowledge-base/` → PASS.

- [ ] **Step 5: Commit** — `feat(guides): a taught guide goes into its category's project`

### Task 3: Existing installs move off the Field guides project

**Files:**
- Modify: `src/services/rag/database.ts` (`moveDocument`), `src/services/rag/index.ts` (`ragService.moveDocument`)
- Create: `src/features/library/moveFieldGuides.ts`
- Modify: `App.tsx:305` (`moveOffFieldGuidesProject().then(seedFieldGuides)`, one `.catch` logging both)
- Modify: `src/features/fieldGuides/fieldGuides.ts` (drop `createFieldGuidesProject`, `ensureFieldGuidesProject`;
  keep `FIELD_GUIDES_PROJECT_ID = 'field-guides'` and export `BUNDLED_GUIDE_CATEGORY_BY_NAME: Record<string, string>`)
- Test: `__tests__/integration/projects/fieldGuidesMove.rendered.test.tsx` (new)

**Interfaces:**
- `ragDatabase.moveDocument(docId: number, projectId: string): void` — `UPDATE rag_documents SET project_id = ? WHERE id = ?`
- `ragService.moveDocument(docId: number, projectId: string): Promise<void>`
- `moveOffFieldGuidesProject(): Promise<void>` — no-op when `@fieldkit/field_guides_moved` is `'1'`. Otherwise,
  if project `field-guides` exists: each document's category is `BUNDLED_GUIDE_CATEGORY_BY_NAME[doc.name]`, else
  for a path `${GUIDE_LIBRARY_DIR}/<id>.pdf` the category of catalogue guide `<id>`
  (`useGuideLibraryStore.getState().catalogue.guides`), else `general`; move each, then
  `useProjectStore.getState().deleteProject('field-guides')`. Then set the flag. Any throw leaves the flag unset.

- [ ] **Step 1: Write the failing test**

`fieldGuidesMove.rendered.test.tsx` (real sqlite, `setupChatScreen({ engine: 'llama', pdf: true, sqlite: true })`):
create project `field-guides` with `createProject`; index three documents into it with `ragService.indexDocument`
(`Survival (US Army ATP 3-50.21).pdf`, a library guide path `${GUIDE_LIBRARY_DIR}/<id>.pdf` for a catalogue id whose
category is `power`, and `my-notes.txt`); create a conversation filed in `field-guides`. Run
`moveOffFieldGuidesProject()`. Render `KnowledgeBaseScreen` for `library-fieldcraft` → shows the survival guide;
for `library-power` → the library guide; for `library-general` → `my-notes.txt`. Render `ProjectsScreen` → no
"Field guides" text. The conversation's `projectId` is undefined. Embedding count unchanged
(`boundary.llama!.calls.embedding` length before and after the move is equal).

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest --runInBand __tests__/integration/projects/fieldGuidesMove.rendered.test.tsx` → FAIL.

- [ ] **Step 3: Implement `moveDocument` and `moveOffFieldGuidesProject`, wire App.tsx**

- [ ] **Step 4: Run it and the related suites**

Run the test → PASS; `npx jest --findRelatedTests src/services/rag/database.ts src/services/rag/index.ts App.tsx src/features/fieldGuides/fieldGuides.ts` → PASS.

- [ ] **Step 5: Commit** — `feat(library): existing installs move their guides off the Field guides project`

### Task 4: Reads past 2 GB

**Files:**
- Create: `patches/@dr.pogodin+react-native-fs+2.38.1.patch`

`ReactNativeFsModule.kt` `read`: `position.toLong()`; skip in a loop until `position` bytes are skipped (stop on
a 0 result followed by a `read()` of -1); read in a loop until `length` bytes or end of file; encode the bytes
read. Edit the file in `node_modules`, then `npx patch-package @dr.pogodin/react-native-fs`. (The worktree's
`node_modules` is a junction to the main checkout's, so the main checkout gets the patched file too; it only
changes Android behaviour.)

- [ ] **Step 1: Make the edit and create the patch**
- [ ] **Step 2: Verify the patch re-applies**

Run: `npx patch-package` → lists `@dr.pogodin/react-native-fs@2.38.1 ✔`. The Kotlin compiles in Task 9's debug build.

- [ ] **Step 3: Commit** — `fix(fs): read at offsets past 2 GB and fill short reads`

### Task 5: ZIM reader

**Files:**
- Modify: `package.json`, `package-lock.json` (`fzstd@0.1.1`, exact), `src/generated/thirdPartyNotices.json`
- Create: `src/services/kiwix/zimReader.ts`
- Create: `__tests__/harness/zimFixture.ts`
- Test: `__tests__/integration/kiwix/zimReader.test.ts`, `__tests__/integration/kiwix/zimRealFile.test.ts`

**Interfaces:**
- Produces (`zimReader.ts`):
  - `type ReadRange = (offset: number, length: number) => Promise<Uint8Array>`
  - `interface ZimMetadata { name: string; title: string; description: string; tags: string; language: string }`
  - `class ZimError extends Error { code: 'not-zim' | 'xz' | 'compression' | 'unreadable' }`, messages for the
    user: `not-zim` "This isn't a Kiwix file."; `xz` "This Kiwix file uses an older compression Fieldkit can't read.
    Download a newer copy in Kiwix."; `compression` "This Kiwix file uses a compression Fieldkit can't read.";
    `unreadable` "This Kiwix file can't be opened any more."
  - `interface ZimArchive { metadata: ZimMetadata; articleCount: number; findTitles(query: string, limit?: number):
    Promise<string[]>; readArticle(title: string, maxChars: number): Promise<{ title: string; text: string } | null> }`
  - `openZim(read: ReadRange): Promise<ZimArchive>` — throws `ZimError`; checks magic, reads metadata, and the main
    page's cluster compression (`xz` / `compression` refused)
  - `zimHtmlToText(html: string, maxChars: number): string`
- Produces (`zimFixture.ts`): `buildZim(opts: { name: string; title: string; description?: string; tags?: string;
  articles: Array<{ path: string; title: string; html: string }>; redirects?: Array<{ path: string; title: string;
  to: string }>; compression?: 'zstd' | 'none' | 'xz'; scheme?: 'new' | 'old' }): Uint8Array` — builds a valid file
  per the spec's layout (new scheme: namespaces C/M/W/X, `titlePtrPos` all ones, `X/listing/titleOrdered/v1`;
  old scheme: namespace A, header title list), zstd via Node's `zlib.zstdCompressSync`; `xz` writes info byte 4 with
  junk data. And `rangeReader(bytes: Uint8Array): ReadRange`.
- Format details, title-search candidates and the `ponytail:` comments: the spec's "ZIM reader" section.

- [ ] **Step 1: Write the failing tests**

`zimReader.test.ts` (each builds a fixture with `buildZim`):
- metadata: `openZim` → `metadata.title === 'WikiMed test'`, `name === 'wikipedia_en_medicine'`, `articleCount === 3`
- `findTitles('burn')` → first is `'Burn'`; `findTitles('Bur')` contains `'Burn'` and `'Bursitis'`;
  `findTitles('how to treat a burn')` contains `'Burn'`; `findTitles('café')` → `['Café']`
- `readArticle('Burns', 200)` follows the redirect to `'Burn'`; text contains `'Cool the burn'` and no `<p>`
  or script text; `length <= 200`
- `scheme: 'old'` → `findTitles('Burn')[0] === 'Burn'`
- `compression: 'none'` → reads the same article
- `compression: 'xz'` → `openZim` rejects with `code === 'xz'`; four zero bytes → `code === 'not-zim'`
- a reader that throws → `code === 'unreadable'`

`zimRealFile.test.ts`: `const sample = process.env.ZIM_SAMPLE; (sample ? it : it.skip)(...)` — opens the file with
a Node `fs.readSync` reader: `metadata.title === 'WikiCiv'`, `findTitles('abacus')[0] === 'Abacus'`,
`readArticle('Abacus', 2000)` text length > 200.

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest __tests__/integration/kiwix/zimReader.test.ts` → FAIL (no module).

- [ ] **Step 3: `npm install fzstd@0.1.1 --save-exact` (from PowerShell), `node scripts/gen-notices.js`, implement
  `zimReader.ts` and `zimFixture.ts`**

- [ ] **Step 4: Run them; run the real file**

Run: `npx jest __tests__/integration/kiwix/zimReader.test.ts` → PASS.
Run (PowerShell): `$env:ZIM_SAMPLE='C:\Users\bth0m\AppData\Local\Temp\claude\4c5f15a04aa10e59\09b3b464-3fa4-4140-ac41-07c24039c6d8\scratchpad\kiwix-sample\wikiciv_en_all_maxi_2025-11.zim'; npx jest __tests__/integration/kiwix/zimRealFile.test.ts` → PASS (1 test, not skipped).

- [ ] **Step 5: Commit** — `feat(kiwix): read titles and articles from .zim files` (fzstd and notices in the same commit)

### Task 6: Kiwix service, store and folder module

**Files:**
- Create: `src/services/kiwix/kiwixCategory.ts` (`categoryFor(meta: ZimMetadata): string`, the spec's rule table)
- Create: `src/services/kiwix/kiwixStore.ts`, `src/services/kiwix/kiwixService.ts`, `src/services/kiwix/index.ts`
- Create: `android/app/src/main/java/com/bth0mp/fieldkit/kiwix/FieldkitDocumentTreeModule.kt`, `FieldkitDocumentTreePackage.kt`
- Modify: `android/app/src/main/java/com/bth0mp/fieldkit/MainApplication.kt` (register the package)
- Modify: `jest.setup.ts` (picker mock: `pickDirectory`, `releaseLongTermAccess`)
- Modify: `__tests__/harness/chatHarness.ts` (option `documents?: boolean`, passed through)
- Modify: `__tests__/harness/nativeBoundary.ts` (option `documents: true`: `boundary.documents.seed(uri, bytes)`,
  `boundary.documents.remove(uri)`;
  fs fake `read(path, length, position, encoding)` serves `content://` paths from that map, base64 or ascii, and
  rejects with ENOENT for an unknown `content://` uri; other paths keep returning `'GGUF'`;
  `NativeModules.FieldkitDocumentTree.listFiles(treeUri)` lists seeded uris that start with `treeUri + '/'`)
- Test: `__tests__/integration/kiwix/kiwixService.test.ts`

**Interfaces:**
- Native: `FieldkitDocumentTree.listFiles(treeUri: string): Promise<Array<{ uri: string; name: string; size: number }>>`
  — children of the tree root and of its direct sub-folders.
- `KiwixFile { id: string; uri: string; fileName: string; title: string; description: string; bytes: number;
  articleCount: number; category: string }`; `KiwixRefusal { fileName: string; reason: string }`
- `useKiwixStore` (zustand `persist`, key `@fieldkit/kiwix_files`): `{ files: Record<string, KiwixFile>; folders:
  string[]; refused: KiwixRefusal[]; adding: { done: number; total: number } | null }`
- `kiwixService`:
  - `canAddFolder(): boolean` (native module present)
  - `addFolder(): Promise<void>` — `pickDirectory({ requestLongTermAccess: true })`, save the folder, `checkForNewFiles()`
  - `checkForNewFiles(): Promise<void>` — lists every saved folder, adds `.zim` files whose uri is not in `files`
  - `addFiles(): Promise<void>` — `pick({ mode: 'open', requestLongTermAccess: true, allowMultiSelection: true,
    type: [types.allFiles] })`
  - `move(id: string, categoryId: string): Promise<void>`; `remove(id: string): Promise<void>`
  - `filesInProject(projectId: string): KiwixFile[]`
  - `search(projectId: string, query: string, opts: { budgetChars: number; timeBudgetMs: number }):
    Promise<{ hits: KiwixHit[]; searched: number; total: number }>` with `KiwixHit = { file: KiwixFile; article:
    { title: string; text: string } | null; otherTitles: string[]; error?: string }`; `searched < total` when the
    time budget ran out
  - `reconcile(): void` — drops files whose category project no longer exists (Review Focus 4)
- Each file added is saved to the store at once (Review Focus 5); a refused file goes to `refused` and the loop
  carries on. Readers are opened on demand and cached by file id.

- [ ] **Step 1: Write the failing test**

`kiwixService.test.ts` with `installNativeBoundary({ fs: true, documents: true })` and real stores: seed tree
`content://tree/kiwix` with `wikimed.zim` (`name: 'wikipedia_en_medicine'`), `wikivoyage.zim`
(`name: 'wikivoyage_en_all'`), an xz `old.zim`; `pickDirectory` resolves `{ uri: 'content://tree/kiwix' }`.
- `addFolder()` → two files, categories `medical` and `travel`; projects `library-medical`, `library-travel`
  exist; `refused` holds `old.zim` with the xz message
- `checkForNewFiles()` again → still two files (Review Focus 2); seed a third file → three
- `search('library-medical', 'burn', …)` → hit with article title `'Burn'`
- remove the seeded bytes of `wikimed.zim` (`boundary.documents.remove(uri)`) → `search` hit has `error` "This
  Kiwix file can't be opened any more." and no throw (any failed read during a search means unreadable; Review
  Focus 1)
- a picker that returns three files where the second reader throws → first and third saved (Review Focus 5)

- [ ] **Step 2: Run it and see it fail** — `npx jest __tests__/integration/kiwix/kiwixService.test.ts` → FAIL
- [ ] **Step 3: Implement the category table, store, service, harness fakes and the Kotlin module**
- [ ] **Step 4: Run it, the harness smoke test and the GGUF callers**

Run: `npx jest __tests__/integration/kiwix/ __tests__/harness/nativeBoundary.smoke.test.ts` and
`npx jest --findRelatedTests __tests__/harness/nativeBoundary.ts jest.setup.ts` (in the background; long) → PASS.

- [ ] **Step 5: Commit** — `feat(kiwix): add folders of Kiwix files and sort them into category projects`

### Task 7: The knowledge base search reads Kiwix articles

**Files:**
- Modify: `src/services/tools/handlers.ts` (`handleSearchKnowledgeBase`)
- Modify: `src/services/tools/registry.ts` (`search_knowledge_base` description: "Search this project's guides,
  documents and Kiwix files")
- Modify: `src/screens/ChatScreen/useChatGenerationActions.ts` (`injectRagContext`)
- Test: `__tests__/integration/kiwix/kiwixChatAnswer.rendered.test.tsx` (new; Task 8 extends it to start from
  the screen)

**Interfaces:**
- Consumes: `kiwixService.search`, `kiwixService.filesInProject` (Task 6).
- Output after the guide passages (or alone):
  ```
  From Kiwix files:
  [WikiMed test] Burn
  <article text>
  Other articles in WikiMed test: Burn (disambiguation), Bursitis. Search again with an exact title to read one.
  ```
  Budget 3,000 characters shared across files, time budget 10,000 ms; an unreadable file is one line
  `[<title>] <error>`; a cut-short search adds `Searched <n> of <m> Kiwix files.` When guides and Kiwix both have
  nothing, today's "No results found" line.
- `injectRagContext`: lists up to 20 Kiwix file titles (`Kiwix files: A, B, … and 34 more`) with "Use the
  search_knowledge_base tool to look up articles in them."; runs when the project has documents or Kiwix files.

- [ ] **Step 1: Write the failing test**

`setupChatScreen({ engine: 'llama', sqlite: true, documents: true })`; add `wikimed.zim` through
`kiwixService.addFiles()` (picker fake returns its uri); route to `library-medical`; `h.send('How do I treat a
burn?', { text: toolCallText('search_knowledge_base', { query: 'burn' }) })`; script the next completion "Cool it
under running water."; expand `tool-result-label-search_knowledge_base` → shows `[WikiMed test] Burn` and
`Cool the burn`; the last completion's messages contain `Cool the burn`; the system prompt of the first completion
contains `Kiwix files: WikiMed test`.

- [ ] **Step 2: Run it and see it fail**
- [ ] **Step 3: Implement the handler, description and prompt changes**
- [ ] **Step 4: Run it and `npx jest --findRelatedTests src/services/tools/handlers.ts src/services/tools/registry.ts src/screens/ChatScreen/useChatGenerationActions.ts` (background) → PASS**
- [ ] **Step 5: Commit** — `feat(kiwix): project chats look up Kiwix articles through the knowledge base search`

### Task 8: Kiwix files screen

**Files:**
- Create: `src/screens/KiwixFilesScreen.tsx`, `src/screens/KiwixFilesScreen.styles.ts`
- Modify: `src/screens/GuideLibraryScreen.tsx` (a "Kiwix files" row in `ListHeaderComponent`, Feather `archive`,
  "<n> added", `testID="guide-library-open-kiwix"`, navigates to `KiwixFiles`)
- Modify: `src/navigation/types.ts`, `src/navigation/AppNavigator.tsx`, `src/screens/index.ts` (`KiwixFiles` route)
- Modify: `src/screens/KnowledgeBaseScreen.tsx` (a library project lists its Kiwix files, title and size, read
  only, `testID="kb-kiwix-<id>"`, and "Manage in Guide library")
- Test: `__tests__/integration/kiwix/kiwixChatAnswer.rendered.test.tsx` (extended)

The screen is the "Kiwix files" part of the spec, opened from a row at the top of the Guide library so the
catalogue list stays as it is. Buttons: "Add Kiwix folder" (`folder-plus`, only when `canAddFolder()`), "Add Kiwix
file" (`plus`), "Check for new files" (`refresh-cw`, once a folder is saved); progress "Adding 37 of 212"; files
grouped by category with counts, collapsed by default; a row tap opens an `AppSheet` with the categories
(`libraryCategories()`); remove (`trash-2`) confirms with `CustomAlert`; refused files listed with reasons. Calls
`kiwixService.reconcile()` on focus.

- [ ] **Step 1: Extend the test to start from the screen**

Render `GuideLibraryScreen`, press `guide-library-open-kiwix`, render `KiwixFilesScreen`, press "Add Kiwix
folder" (fakes from Task 6 serve the tree), see "First aid and medical (1)" and "Hiking and travel (1)"; expand
medical, see "WikiMed test"; then the chat flow from Task 7 in `library-medical`. Then move WikiMed to General
reference through the sheet and see it under "General reference (1)". Then delete project `library-travel` with
`deleteProject`, refocus, and see "Hiking and travel" gone (Review Focus 4).

- [ ] **Step 2: Run it and see it fail**
- [ ] **Step 3: Implement the screen, the header row, the route and the KB rows**
- [ ] **Step 4: Run it and the related suites for the changed screens (background) → PASS**
- [ ] **Step 5: Commit** — `feat(kiwix): Kiwix files screen to add, sort and remove files`

### Task 9: Whole-branch checks, phone build, PR

- [ ] **Step 1:** `npx tsc --noEmit`, `npx eslint` on every changed file, `npm run depcruise`, `npm run knip`,
  `npx jest --findRelatedTests <all changed files>` (background) → all clean.
- [ ] **Step 2:** Debug APK from Git Bash after `subst F: "<repo folder>\.claude\worktrees\gracious-kare-00c8d7"`:
  `cd /f/android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` → BUILD SUCCESSFUL (proves the
  patch and the Kotlin module compile).
- [ ] **Step 3:** Run `.husky/pre-push` by hand (hooks do not run in worktrees), push the branch, open a PR to
  `main`, bind it with the ccd_pr tools.
- [ ] **Step 4:** Phone check is the owner's: add their Kiwix folder, ask a question in a category project.
