# Library projects and Kiwix files: design

Date: 2026-11-18. Branch `claude/gracious-kare-00c8d7`, rebased onto GitHub `main` (`1a880b597`, guide library)
with the 15 local calendar and tools commits on top.

## Intent

The owner wants the assistant to read Kiwix `.zim` files already on the phone (Wikipedia, WikiMed, iFixit,
Wikivoyage) and answer from them, offline. In the owner's words, the library should be sorted "by medical, hiking,
maps etc", and a chat should "only read those files rather than all".

So the library is organised by topic, as projects. Each topic is a project that holds that topic's field guides
and Kiwix files, and a chat inside a project searches only that project's files. The single Field guides project
goes away; its guides move into the topic projects.

## Owner's decisions (2026-11-18)

1. The assistant looks things up when the model decides to, through tool calls (not an automatic lookup on every
   message).
2. Kiwix files are sorted into a topic automatically.
3. A topic covers both its field guides and its Kiwix files.
4. Topics are Projects, one per category, made for each category in use.
5. The per-category projects replace the Field guides project.
6. The owner has downloaded hundreds of Kiwix files. The reader is tested on a small file downloaded from
   download.kiwix.org, or one from the phone.

## Goals

- One project per library category, created the first time a guide or Kiwix file lands in it.
- Taught guides (the guide library) and the six bundled guides go into their category's project.
- Existing installs: the Field guides project's documents move into the category projects, then the project is
  deleted.
- The user adds a folder of `.zim` files (or single files) from the Guide library screen. The app reads each
  file's metadata, puts it in a category, and the user can move it to another.
- In a project chat, `search_knowledge_base` searches the project's guides (as today) and the titles of its Kiwix
  files, and returns the best-matching article's text.

## Non-goals (this slice)

- Full-text search inside Kiwix files. Each file's full-text index is a Xapian database (`X/fulltext/xapian`);
  the Xapian library is GPL and its on-disk format is large. Title search only, from the file's own sorted title
  list.
- xz-compressed Kiwix files (made before about 2021). The app says so and refuses them. Current Kiwix files use
  zstd.
- Pictures, links between articles, or showing an article in a viewer. The assistant reads text only.
- Maps. Kiwix files hold articles, not map tiles.
- Chats outside a project. They do not read the library (as today, `search_knowledge_base` needs a project).
- iOS. Nothing here is Android-only code, but iOS ships no guides and is not tested.

## Anti-goals

- Any GPL, AGPL or LGPL code, including libzim, libkiwix and their wrappers. The reader is written from scratch.
- Loading a whole `.zim` file into memory. Files are several GB; reads are by byte range.
- Losing a taught guide during the move out of the Field guides project, or re-embedding guides that are already
  embedded (that takes minutes per guide on the phone).
- A Kiwix logo, or Off Grid or Wednesday names, in the UI.

## Constraints found in the code

- `@dr.pogodin/react-native-fs` `read(path, length, position)` on Android casts `position` to `Int` (Kotlin
  `toInt()` saturates at 2 GB), calls `skip` once and `read` once (both may return short). It does open `content://`
  URIs through `ContentResolver`. A patch-package patch makes it use `toLong()` and loop until it has skipped and
  read everything asked for. No new native module.
- `@react-native-documents/picker` 12.0.1 supports `pick({ mode: 'open', requestLongTermAccess: true })`, which
  keeps the read permission across restarts, and `releaseLongTermAccess(uris)`.
- zstd decoding: `fzstd` 0.1.1 (MIT, pure JavaScript, 65 KB unpacked). Run `node scripts/gen-notices.js` after
  adding it.
- HTML to text: `node-html-parser` is already a dependency (`structuredText`).
- RAG documents carry a `project_id`; moving a document is one `UPDATE rag_documents SET project_id`. Chunks and
  embeddings hang off the document id, so nothing is re-embedded.
- `projectStore.deleteProject` deletes the project's RAG documents and unfiles its chats. The move must run before
  the delete.
- `search_knowledge_base` is enabled by default (`appStore` adds it to `enabledTools`), and `injectRagContext`
  already lists a project's documents in the system prompt and does a semantic search per message.
- The ZIM specification (`wiki.openzim.org`) blocks automated readers, so it could not be read for this design.
  The layout below was checked byte by byte against a real Kiwix file, `wikiciv_en_all_maxi_2025-11.zim` (4.4 MB,
  ZIM 6.3, from download.kiwix.org, kept in the session scratchpad, not in git): header, MIME list, directory
  entries, zstd and uncompressed clusters, metadata, the `W/mainPage` redirect and the title listing all read as
  described.
- The owner has downloaded hundreds of Kiwix files, so adding them one at a time is not enough: the user adds a
  folder. No installed library lists a folder picked through the system picker (`react-native-fs` `readDir` takes
  plain paths only), so a small Android module does it, like the calendar module (Android only; where it is
  missing, the folder button is hidden and single files still work).

## Approaches considered

1. **One knowledge search per project (picked).** A project is the topic. The existing `search_knowledge_base`
   tool also searches the project's Kiwix titles and returns the best article's text. No new tool, no tool
   settings migration, and the project already limits what a chat reads.
2. **A library search tool with a `section` parameter** (offered first). The model picks the section. Dropped
   when the owner chose Projects as the sections: the project already does the scoping.
3. **Separate Kiwix tools beside the knowledge base search.** Two overlapping searches for one question; small
   on-device models pick between overlapping tools badly.
4. **Embedding Kiwix articles into the knowledge base.** WikiMed alone has about 70,000 articles; embedding them on
   the phone would take days and several GB.

A separate `read_article` tool was also dropped. The search already returns the best article's text, and the
model can search again with an exact title from the "other articles" list to read another.

## Design

### Library categories and projects (`src/features/library/libraryProjects.ts`, new)

- Categories are the guide catalogue's categories (`catalogue.categories`, bundled or fetched) plus two the app
  adds for Kiwix files: `travel` "Hiking and travel" and `general` "General reference".
- Project id `library-<categoryId>`, name the category name, description "Field guides and Kiwix files for
  <name>", and one shared system prompt adapted from today's Field guides prompt: answer from this project's guides
  and Kiwix files, name the source, say when they do not cover the question, and add the first-aid caution.
- `ensureCategoryProject(categoryId)` creates the project if it is missing (also when the user deleted it, because
  the user just put something in that category). `isLibraryProject(projectId)` and `libraryProjectIds()` for the
  code that scans documents.

### Guides

- Bundled guides: each of the six gets a fixed category. Survival → `fieldcraft`; Ship's Medicine Chest and
  Casualty Response and First Aid → `medical`; Field Hygiene and Sanitation → `water`; Solar-Powered Water Pump
  Systems and NEETS Module 1 → `power`. `seedFieldGuides` indexes each into its category project. The seed state's
  `projectCreated` / "user deleted the project" rule is replaced: a seeded guide is recorded in `done`, and a guide
  the user later deletes is not re-added.
- Guide library: teaching indexes into `library-<entry.category>`. Every place that reads the Field guides project
  (`libraryDocuments`, `deleteFromKnowledgeBase`, `teachFailure`) scans all library projects instead.
- The Guide library row on the knowledge base screen, shown today only in the Field guides project, shows in every
  library project.

### Moving existing installs off the Field guides project

Runs once at launch before the guide seed and guide library start (an AsyncStorage flag marks it done):

1. If the `field-guides` project exists, for each of its documents find a category: a bundled guide by name, a
   library guide by path (its saved downloaded entry's category), anything else (a document the user added) →
   `general`.
2. Move each document (`ragService.moveDocument(docId, projectId)`), creating category projects as needed.
3. Delete the `field-guides` project. Its chats are unfiled (today's delete behaviour); nothing else is lost.

A move that fails leaves the flag unset and the Field guides project in place, and runs again next launch.

### ZIM reader (`src/services/kiwix/zimReader.ts`, new, written from scratch)

Works over one injected function, `readRange(offset, length) => Promise<Uint8Array>` (RNFS `read` with base64
decode in the app; the in-memory disk in tests). All integers little-endian.

- Header (80 bytes): magic `0x044D495A` at 0; major u16 at 4, minor u16 at 6; uuid 16 bytes at 8; entryCount u32
  at 24; clusterCount u32 at 28; pathPtrPos u64 at 32; titlePtrPos u64 at 40; clusterPtrPos u64 at 48; mimeListPos
  u64 at 56; mainPage u32 at 64; layoutPage u32 at 68; checksumPos u64 at 72.
- MIME list at mimeListPos: zero-terminated strings, ended by an empty string.
- Path pointer list: entryCount u64 offsets to directory entries, sorted by namespace then path.
- Title order: when `titlePtrPos` is all ones (newer files; the sample has it so), the title index is the blob of
  entry `X/listing/titleOrdered/v1`: u32 indexes into the path list, front articles only, sorted by title (in the
  sample it sits in an uncompressed cluster, so a single entry of it is one small read). Otherwise (older files) the
  header's title pointer list: entryCount u32 indexes into the path list, sorted by namespace then title.
- Directory entry: mimetype u16, parameterLen u8, namespace char, revision u32; a redirect (mimetype 0xFFFF) then
  has redirectIndex u32, a content entry has cluster u32 and blob u32; then path and title, each zero-terminated
  (an empty title means the title is the path). Mimetypes 0xFFFE and 0xFFFD are skipped.
- Cluster pointer list: clusterCount u64 offsets; a cluster ends where the next begins (the last at checksumPos).
  Cluster info byte: low 4 bits compression (0 or 1 none, 4 xz, 5 zstd), bit 0x10 extended (8-byte blob offsets,
  else 4). The (decompressed) data starts with the blob offsets; the first offset divided by the offset size is
  the offset count, blob count one less; blob n is `[offset n, offset n+1)`.
- Articles are namespace `C` when minor version is 1 or more (new scheme), else `A`. Metadata is namespace `M`:
  `Name`, `Title`, `Description`, `Tags`, `Language` (the sample: `wikiciv_en_all`, `WikiCiv`, "The wiki manual
  for building civilization from scratch", `preppers;wikiciv;_pictures:yes;...`, `eng`). The main page is the
  header's `mainPage` entry, a redirect (`W/mainPage`) in newer files.
- Title search: binary search the title list for the article namespace. Candidates in order: the query as typed,
  with its first letter capitalised, then each word of three or more letters capitalised. For each, an exact title
  match first, then titles starting with it; HTML entries only; redirects followed. Up to six titles in all.
  `ponytail:` naive title heuristic; full-text search would need its own index.
- Article text: HTML blob → drop `script`, `style` → `structuredText` → collapse whitespace → cut to a character
  budget.
- Reads: each RNFS `read` reopens the file, so a directory entry is read in one go (a fixed 512 bytes, read
  again longer if its path and title run past). A title lookup in full English Wikipedia is about 25 binary-search
  steps of two or three reads each. Builder's call: measure on the phone and batch reads only if it is slow.
- Decompressed clusters: keep the last one only (`ponytail:` single-cluster cache, an LRU if repeated searches are
  slow on the phone).
- Errors the user or model can see: not a ZIM file, xz compression ("made with an older compression Fieldkit
  can't read; download a newer copy in Kiwix"), file can't be opened any more.

### Kiwix service and store (`src/services/kiwix/`, new)

- `kiwixService` owns the list of added files and every reader. `kiwixStore` (zustand, persisted to AsyncStorage
  under `@fieldkit/kiwix_files`) is the read-only projection the screen renders: per file id, uri, file name,
  title, description, size, article count, category, and an error if it failed.
- `addFolder()`: pick a folder (`pickDirectory({ requestLongTermAccess: true })`, one permission for every file in
  it), list it with the folder module, and add each `.zim` in it, with progress ("Adding 37 of 212"). The folder is
  saved, and "Check for new files" lists it again and adds only files not yet added. Kiwix keeps its downloads in
  `Android/media/org.kiwix.kiwixmobile`, which the folder picker can grant.
- `addFile()`: pick one or more files (`mode: 'open'`, `requestLongTermAccess: true`, all files), for files kept
  where a folder cannot be granted (Android refuses the Download folder itself).
- Adding one file: check the header magic, read metadata, check the main page's cluster compression, choose a
  category, ensure its project, save. A file already added (same uri) is not added twice. A file that is refused
  is listed with its reason; the others carry on.
- Folder module (`android/.../kiwix/`, Kotlin): `listFiles(treeUri)` returns each child document's uri, name and
  size (DocumentsContract query on the tree, one level, sub-folders one level deeper).
- Category from metadata: lower-cased `Name`, `Title`, `Description` and `Tags`, first keyword rule that matches.
  Medical (medicine, medical, wikimed, mdwiki, health, anatomy, first aid), mechanical (ifixit, repair, mechanic,
  automotive), power (solar, electric, energy), radio (radio, amateur), food (cooking, food, recipe, garden),
  farming (farm, livestock, agricultur), water (water, sanitation), building (diy, woodworking, construction),
  navigation (map, navigation, weather), travel (wikivoyage, hiking, outdoors, travel, trail), fieldcraft
  (survival, bushcraft, knot, prepper), disasters (disaster, emergency); anything else → general. Rules are a
  table in the service, easy to tune once the owner's own files are seen. The sample sorts to fieldcraft by its
  `preppers` tag.
- `move(id, categoryId)`, `remove(id)` (releases long-term access, drops the record; the file stays on the
  phone, it belongs to Kiwix).
- `search(projectId, query, budgetChars)`: for the project's files, the best article's text plus the other
  matching titles, per file. With hundreds of files, one project (General reference, say) can hold many; a title
  lookup is about 0.1 to 0.5 s per file. So the search stops after about 10 s and says how many files it searched
  (`ponytail:` time budget; batched native reads or a per-file switch if the phone shows it is too slow).
- The system prompt names at most 20 of a project's Kiwix files ("and 34 more").

### Chat

- `search_knowledge_base` handler: guide passages as today, then, if the project has Kiwix files, a "From Kiwix
  files" part: `[<file title>] <article title>`, the article text (about 3,000 characters shared across files),
  then "Other articles in <file title>: …. Search again with an exact title to read one." A file that can't be read
  says so in one line. The tool's description becomes "Search this project's guides, documents and Kiwix files".
- `injectRagContext`: lists the project's Kiwix files next to its documents, and no longer returns early when a
  project has Kiwix files but no documents.
- Guides keep today's automatic search on every message (`injectRagContext`). Decision 1 was asked about the Kiwix
  files only. So guides help every model, while Kiwix text reaches only models that can call tools, with the
  knowledge base tool on (it is on by default). Gemma 4 and Qwen3.5 can.

### Screens

- Guide library screen: a "Kiwix files" part above the catalogue with "Add Kiwix folder" (Feather `folder-plus`),
  "Add Kiwix file" (Feather `plus`) and, once a folder is added, "Check for new files" (Feather `refresh-cw`). The
  files are grouped by category with a count, collapsed, so hundreds of rows stay manageable. Each row: file title,
  size; tap opens a sheet to choose a category; a remove button (Feather `trash-2`). Refused files are listed with
  their reasons. Theme tokens only.
- Project knowledge base screen: a library project lists its Kiwix files (title and size, read only) with "Manage
  in Guide library".

## Tests

- One rendered integration test per part, mounting real screens with fakes only at the device boundary:
  1. Category projects: teaching a medical guide from the Guide library puts it in "First aid and medical", and a
     chat there answers from it. The existing Field guides tests (`fieldGuidesAnswer`, `guideLibraryTeach`, …)
     are updated to the new projects.
  2. The move: an install with a Field guides project, its guides and a chat, after launch has the guides in their
     category projects, no Field guides project, and the chat unfiled.
  3. Kiwix: tap "Add Kiwix folder", the picker and folder module (fakes) return a folder holding two `.zim` files
     the test builds in memory (tiny files written with Node's `zlib.zstdCompressSync`, no binary in git), the rows
     show their categories; in one project's chat the model's `search_knowledge_base` call returns the article text
     the user then sees cited.
- Harness: the fs fake's `read(path, length, position)` returns base64 bytes from the in-memory disk instead of
  `'GGUF'` (check the GGUF callers still pass).
- The sample file (`wikiciv_en_all_maxi_2025-11.zim`) must open, sort and return an article through the app's
  reader on this PC (a Node file reader in place of RNFS) before the slice is called done. A run on the phone over
  the owner's own folder is the final check.

## Left to the builder

- Exact text of messages and prompt lines, the character budget, the colours of library projects.
- Order of commits, as long as each green step is its own commit: the RAG move, library projects, guide seeding,
  guide library, the migration, the fs patch, fzstd and notices, the reader, the service and store, the tool and
  prompt, the screens, each test.
