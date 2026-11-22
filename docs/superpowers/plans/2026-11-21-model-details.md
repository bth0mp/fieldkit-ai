# Model Details and "Which model?" Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Hugging Face popularity on model cards, add sorts that ask Hugging Face directly (limited to models that fit the phone), and add a bundled, offline "Which model?" guide with hand-written notes and phone tiers.

**Architecture:**
- `huggingFaceService` gains fields and a `browseModels` call. Pure tier, fit and label logic, plus the notes data, live in `src/features/modelGuide/`.
- The Text tab hook picks the call by sort, and `ModelCard` renders the new lines.
- A new `ModelGuide` stack screen reads only bundled data and the phone's memory.

**Tech Stack:** React Native 0.83, React Navigation 7 native stack, Jest + RNTL rendered tests, plain `fetch` to `https://huggingface.co/api`.

**Spec:** `docs/superpowers/specs/2026-11-21-model-details-design.md`

## Global Constraints

- Theme tokens only (`TYPOGRAPHY`, `COLORS` via `useTheme`, `SPACING`).
- Font weights 400 or less.
- Feather icons from `react-native-vector-icons`.
- No emoji in UI text.
- No business logic or authoritative state in screens or hooks; services and `src/features/` modules own it.
- One rendered integration test per behaviour. Mount the real screen, reach the state through real gestures, and fake only at the device boundary (network = `global.fetch`, RAM = `__tests__/harness/deviceMemory.ts`, connection = `__tests__/harness/netInfoFake.ts`). Never `jest.mock` our own modules in new tests.
- No new dependencies. Plain `fetch`, as `huggingface.ts` does today.
- Never request `expand[]=gguf` for lists (it sends each model's whole chat template).
- Card number format: "1.2M downloads this month · 9.8M all time" and "2.3K likes · updated 3 days ago" (reuse the existing `formatNumber`, which prints K and M).
- New releases publishers, exactly: `unsloth`, `bartowski`, `ggml-org`, `lmstudio-community`, `QuantFactory`.
- Memory tiers, exactly: 4, 6, 8, 12, 16 GB. The phone's tier is the smallest at or above `hardwareService.getTotalMemoryGB()`, and 16 above 16. The owner's S24 Ultra reports 10.8 GB, so it is tier 12.
- Size limit sent to Hugging Face: `num_parameters=min:0,max:<N>B`, where N is `maxParams` of the `MODEL_RECOMMENDATIONS.memoryToParams` row with `minRam <= tier < maxRam`.
- Fit rules:
  - A text pick is "Runs well" on tiers above its `minRam`.
  - It is "Tight" on the tier equal to its `minRam`, but only when `minRam` is itself a tier (4, 6, 8, 12 or 16).
  - It is not listed below its `minRam`, nor above its `maxRam`.
  - Whisper, image and LiteRT files fit a tier when `!fileExceedsBudget(sizeBytes, tierGB * 0.9)`.
- Labels: "Vision", "Coding", "Small, fast", in that order, at most two.
- Notes:
  - Each note is written from the model's own Hugging Face model card and states no more than the card supports.
  - Each note keeps the card's URL in `source`, which is not shown to the user.
  - A model with no honest note gets none. Never write placeholder text.
- Offline copy, exactly: "Needs a connection to search, sort or show download numbers."
- No Off Grid or Wednesday names, logos or links in anything the user sees.
- Each green step is its own commit, with a per-concern message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run git commands one per call; the worktree guard refuses compound git commands.
- Checks before each commit:
  - `npx tsc --noEmit`;
  - `npx eslint <changed files>`;
  - `npm run depcruise`;
  - `npm run knip`;
  - the task's test files.

## Review Focus

1. **A Hugging Face result with missing fields** (no `downloadsAllTime`, `lastModified` or `createdAt`; downloads 0): the card shows only the parts it has, never "undefined", "NaN" or an empty "·". Task 4's test pins it.
2. **Quick sort switching:** when Trending is tapped and then New releases before the first answer arrives, the slower first answer must not replace the second. Task 5's test pins it.
3. **Connection lost mid-request:** the fetch rejects while `useOffline()` is true. The user sees the offline notice, not a "Search Error" alert. Task 6's test pins it.
4. **Typed query plus a server sort:** typing "qwen" and then choosing Most liked sends `search=qwen&sort=likes`. Clearing the query keeps showing the sorted results, not the picks, until Smart is chosen. Task 5's test pins it.
5. **Everything filtered away:** the server sort returns only text-to-speech repos or repos too big for the phone, so the empty text "No models found. Try a different search term." shows, not a blank list. Task 5's test pins it.

---

### Task 1: Hugging Face fake, stats fields and `browseModels`

**Files:**
- Create: `__tests__/harness/hfApiFake.ts`
- Modify: `src/types/index.ts` (`ModelInfo` at 11-25, `HFModelSearchResult` at 255-274)
- Modify: `src/services/huggingface.ts` (`searchModels` 16-26, `getModelDetails` 28-31, `transformModelResult` 81-101)
- Test: `__tests__/unit/services/huggingfaceBrowse.test.ts`

**Interfaces:**
- Produces:
  - `ModelInfo` gains `downloadsAllTime?: number; createdAt?: string; pipelineTag?: string`. Its `downloads` stays the 30-day count.
  - `HFModelSearchResult` gains `downloadsAllTime?: number; createdAt?: string; pipeline_tag?: string`.
  - `export type BrowseSort = 'trending' | 'downloads' | 'likes' | 'newest'` (in `huggingface.ts`).
  - `huggingFaceService.browseModels(query: string, opts: { sort: BrowseSort; maxParamsB: number; pipelineTag?: string; limit?: number }): Promise<ModelInfo[]>`.
  - `export const NEW_RELEASE_PUBLISHERS = ['unsloth', 'bartowski', 'ggml-org', 'lmstudio-community', 'QuantFactory'] as const`.
  - Harness: `installHfApiFake(): HfApiFake` with `requests(): URL[]`, `setList(fn: (url: URL) => Partial<HFModelSearchResult>[] | Error): void`, `setDetails(d: Record<string, Partial<HFModelSearchResult>>): void`, and `hold(): { count(): number; release(i: number, answer?: Partial<HFModelSearchResult>[] | Error): void }`. After `hold()`, list answers wait until `release(i)` is called for the i-th held request, in any order. `answer` overrides what `setList` would give. This serves the ordering test in Task 5 and the mid-request test in Task 6.
  - The fake replaces `global.fetch`:
    - `/api/models?…` answers from `setList` (default `[]`);
    - `/api/models/{id}` answers from `setDetails`, with 404 for unknown ids;
    - `/tree/main` answers `[]`;
    - any other URL rejects with `TypeError('Network request failed')`.

- [ ] **Step 1: Write the failing tests** in `huggingfaceBrowse.test.ts`. Use `installHfApiFake()`; no `jest.mock` of our modules.

```ts
it('asks for every field the card shows, on lists and on details', async () => {
  const hf = installHfApiFake();
  hf.setList(() => [{ id: 'unsloth/Qwen3.5-2B-GGUF', author: 'unsloth', downloads: 547232, downloadsAllTime: 2572970,
    likes: 180, lastModified: '2026-03-02T14:07:35.000Z', createdAt: '2026-02-28T10:00:00.000Z', tags: ['gguf'], pipeline_tag: 'image-text-to-text' }]);
  const [m] = await huggingFaceService.searchModels('qwen');
  const url = hf.requests()[0];
  expect(url.searchParams.getAll('expand[]')).toEqual(expect.arrayContaining(
    ['author', 'downloads', 'downloadsAllTime', 'likes', 'lastModified', 'createdAt', 'tags', 'pipeline_tag']));
  expect(url.searchParams.getAll('expand[]')).not.toContain('gguf');
  expect(m).toMatchObject({ downloads: 547232, downloadsAllTime: 2572970, likes: 180,
    lastModified: '2026-03-02T14:07:35.000Z', createdAt: '2026-02-28T10:00:00.000Z', pipelineTag: 'image-text-to-text' });
});

it('getModelDetails expands downloadsAllTime and still returns the gguf files', async () => {
  const hf = installHfApiFake();
  hf.setDetails({ 'unsloth/Qwen3.5-2B-GGUF': { id: 'unsloth/Qwen3.5-2B-GGUF', downloads: 1, downloadsAllTime: 9,
    siblings: [{ rfilename: 'Qwen3.5-2B-Q4_K_M.gguf' }] } });
  const m = await huggingFaceService.getModelDetails('unsloth/Qwen3.5-2B-GGUF');
  expect(hf.requests()[0].searchParams.getAll('expand[]')).toEqual(expect.arrayContaining(['downloadsAllTime', 'siblings', 'cardData']));
  expect(m.downloadsAllTime).toBe(9);
  expect(m.files.map(f => f.name)).toEqual(['Qwen3.5-2B-Q4_K_M.gguf']);
});

it.each([['trending', 'trendingScore'], ['downloads', 'downloads'], ['likes', 'likes']] as const)(
  'browse %s sorts on Hugging Face with the size limit', async (sort, hfSort) => {
    const hf = installHfApiFake();
    await huggingFaceService.browseModels('qwen', { sort, maxParamsB: 13 });
    const url = hf.requests()[0];
    expect(url.searchParams.get('sort')).toBe(hfSort);
    expect(url.searchParams.get('direction')).toBe('-1');
    expect(url.searchParams.get('num_parameters')).toBe('min:0,max:13B');
    expect(url.searchParams.get('search')).toBe('qwen');
    expect(url.searchParams.get('filter')).toBe('gguf');
  });

it('browse keeps chat and vision models and drops other pipelines', async () => {
  const hf = installHfApiFake();
  hf.setList(() => [{ id: 'a/tts-GGUF', pipeline_tag: 'text-to-speech' }, { id: 'a/chat-GGUF', pipeline_tag: 'text-generation' },
    { id: 'a/vlm-GGUF', pipeline_tag: 'image-text-to-text' }, { id: 'a/untagged-GGUF' }, { id: 'a/img-GGUF', pipeline_tag: 'text-to-image' }]);
  const out = await huggingFaceService.browseModels('', { sort: 'trending', maxParamsB: 8 });
  expect(out.map(m => m.id)).toEqual(['a/chat-GGUF', 'a/vlm-GGUF', 'a/untagged-GGUF']);
});

it('new releases asks each publisher, merges newest first, and survives one failure', async () => {
  const hf = installHfApiFake();
  hf.setList(url => {
    const author = url.searchParams.get('author');
    if (author === 'bartowski') return new Error('boom');
    if (author === 'unsloth') return [{ id: 'unsloth/Old-GGUF', createdAt: '2026-11-01T00:00:00.000Z' }];
    if (author === 'ggml-org') return [{ id: 'ggml-org/New-GGUF', createdAt: '2026-11-20T00:00:00.000Z' }];
    return [];
  });
  const out = await huggingFaceService.browseModels('', { sort: 'newest', maxParamsB: 13 });
  expect(hf.requests().map(u => u.searchParams.get('author')).sort())
    .toEqual(['QuantFactory', 'bartowski', 'ggml-org', 'lmstudio-community', 'unsloth']);
  expect(hf.requests().every(u => u.searchParams.get('sort') === 'createdAt')).toBe(true);
  expect(out.map(m => m.id)).toEqual(['ggml-org/New-GGUF', 'unsloth/Old-GGUF']);
});

it('new releases rejects when every publisher fails', async () => {
  const hf = installHfApiFake();
  hf.setList(() => new Error('down'));
  await expect(huggingFaceService.browseModels('', { sort: 'newest', maxParamsB: 8 })).rejects.toThrow();
});
```

- [ ] **Step 2: Run them to see them fail.** Run `npx jest __tests__/unit/services/huggingfaceBrowse.test.ts`. Expected: FAIL (`installHfApiFake` missing, `browseModels` not a function).

- [ ] **Step 3: Write `hfApiFake.ts`, then the service changes.**
  - One `LIST_EXPAND` array is used by both `searchModels` and `browseModels`. A `DETAIL_EXPAND` array is `LIST_EXPAND` plus `siblings`, `cardData` and every other field that `transformModelResult` and its helpers read. With `expand[]`, Hugging Face returns only the fields asked for (checked live 2026-11-21).
  - `browseModels` maps `trending→trendingScore`, `downloads→downloads`, `likes→likes` and `newest→createdAt`.
  - For `newest` it makes one call per publisher with `author=`, using `Promise.allSettled`. It throws only when all of them reject, then sorts by `createdAt` descending and slices to `limit` (default 30).
  - The pipeline rule keeps `pipeline_tag` undefined, `text-generation` or `image-text-to-text`. It applies in `browseModels` only.

- [ ] **Step 4: Run them to see them pass.** Run the same command, plus `npx jest __tests__/unit/services/huggingface.test.ts __tests__/unit/services/huggingface.branches.test.ts`. Expected: all PASS. Update an existing assertion only where it pinned the old URL string exactly.

- [ ] **Step 5: Commit** with the message `feat(models): Hugging Face stats fields and browse sorts with a size limit`.

---

### Task 2: Tier, fit, label and "updated" helpers

**Files:**
- Create: `src/features/modelGuide/guide.ts`
- Test: `__tests__/unit/features/modelGuide/guide.test.ts`

**Interfaces:**
- Consumes: `MODEL_RECOMMENDATIONS`, `RECOMMENDED_MODELS` (`src/constants/models.ts`), `fileExceedsBudget` (`src/services/memoryBudget.ts`).
- Produces:
  - `export type MemoryTier = 4 | 6 | 8 | 12 | 16`
  - `export const MEMORY_TIERS: MemoryTier[]`
  - `export function memoryTierGB(reportedGB: number): MemoryTier`
  - `export function maxParamsForTier(tier: MemoryTier): number`
  - `export function textPickFit(pick: { minRam: number; maxRam?: number }, tier: MemoryTier): 'runs-well' | 'tight' | null`
  - `export function fileFitsTier(sizeBytes: number, tier: MemoryTier): boolean`
  - `export function smallestFittingTier(sizeBytes: number): MemoryTier | null`
  - `export function autoLabels(m: { name: string; tags?: string[]; pipelineTag?: string; paramCount?: number }): string[]`
  - `export function formatUpdatedAgo(iso: string | undefined, now: Date): string | null`

- [ ] **Step 1: Write the failing tests.**

```ts
const GB = 1024 ** 3;
it.each([[0, 4], [3, 4], [4, 4], [5.5, 6], [7.3, 8], [8, 8], [10.82, 12], [12, 12], [14.5, 16], [16, 16], [23, 16]])(
  'memoryTierGB(%p) = %p', (gb, tier) => expect(memoryTierGB(gb)).toBe(tier));
it.each([[4, 3], [6, 4], [8, 8], [12, 13], [16, 30]] as const)('maxParamsForTier(%p) = %p', (t, p) => expect(maxParamsForTier(t)).toBe(p));
it('text pick fit', () => {
  const smol = { minRam: 3, maxRam: 6 }, e4b = { minRam: 6 }, q9 = { minRam: 8 };
  expect([4, 6, 8].map(t => textPickFit(smol, t as MemoryTier))).toEqual(['runs-well', 'runs-well', null]);
  expect([4, 6, 12].map(t => textPickFit(e4b, t as MemoryTier))).toEqual([null, 'tight', 'runs-well']);
  expect([6, 8, 12].map(t => textPickFit(q9, t as MemoryTier))).toEqual([null, 'tight', 'runs-well']);
});
it('file fit uses the load budget at 90% of the tier', () => {
  expect(fileFitsTier(1.5 * GB, 4)).toBe(true);
  expect(fileFitsTier(2 * GB, 4)).toBe(false);
  expect(fileFitsTier(5 * GB, 8)).toBe(false);
  expect(fileFitsTier(5 * GB, 12)).toBe(true);
  expect(smallestFittingTier(2 * GB)).toBe(6);
  expect(smallestFittingTier(40 * GB)).toBeNull();
});
it('labels', () => {
  expect(autoLabels({ name: 'Qwen2.5-Coder-1.5B-Instruct-GGUF', tags: ['gguf'], paramCount: 1.5 })).toEqual(['Coding', 'Small, fast']);
  expect(autoLabels({ name: 'gemma-4-E4B-it-GGUF', pipelineTag: 'image-text-to-text', paramCount: 4 })).toEqual(['Vision']);
  expect(autoLabels({ name: 'Llama-3.2-1B-Instruct-GGUF', paramCount: 1 })).toEqual(['Small, fast']);
  expect(autoLabels({ name: 'SmolVLM-256M', tags: ['code'], pipelineTag: 'image-text-to-text', paramCount: 0.256 })).toEqual(['Vision', 'Coding']);
  expect(autoLabels({ name: 'encoder-3B-GGUF', paramCount: 3 })).toEqual([]);
  expect(autoLabels({ name: 'CodeLlama-7B-GGUF' })).toEqual(['Coding']);
});
it('updated ago', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  expect(formatUpdatedAgo(ago(0.5), now)).toBe('updated today');
  expect(formatUpdatedAgo(ago(1), now)).toBe('updated yesterday');
  expect(formatUpdatedAgo(ago(3), now)).toBe('updated 3 days ago');
  expect(formatUpdatedAgo(ago(45), now)).toBe('updated 1 month ago');
  expect(formatUpdatedAgo(ago(70), now)).toBe('updated 2 months ago');
  expect(formatUpdatedAgo(ago(400), now)).toBe('updated 1 year ago');
  expect(formatUpdatedAgo(ago(800), now)).toBe('updated 2 years ago');
  expect(formatUpdatedAgo(undefined, now)).toBeNull();
  expect(formatUpdatedAgo('not a date', now)).toBeNull();
});
```

- [ ] **Step 2: Run it to see it fail.** Run `npx jest __tests__/unit/features/modelGuide/guide.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `guide.ts`.**
  - Vision: `pipelineTag === 'image-text-to-text'` or that value in `tags`.
  - Coding: the regex `/(^|[^a-z])cod(e|er|ing)/i` on `name`, or `tags` containing `code`.
  - Small, fast: `paramCount` of 2 or less. When `paramCount` is missing, parse it from the name with the regex that `useTextModels.ts` uses at line 20. Move that regex here and import it there.
  - Updated: whole days (floored) of 0 is "today", 1 is "yesterday", under 30 is "N days ago", under 365 is `floor(days/30)` months, and otherwise `floor(days/365)` years, using "1 month" and "1 year" in the singular.

- [ ] **Step 4: Run it to see it pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(models): memory tiers, fit rules and labels for model details`.

---

### Task 3: Hand-written notes and phone tiers (content)

**Files:**
- Create: `src/features/modelGuide/notes.ts`
- Test: `__tests__/unit/features/modelGuide/notes.test.ts`

**Interfaces:**
- Consumes: `MemoryTier` (Task 2); `RECOMMENDED_MODELS`; `WHISPER_MODELS` (`src/services/whisperModels.ts`); `CURATED_LITERT_ENTRIES` (`src/services/curatedLiteRTRegistry.ts`).
- Produces:
  - `export interface ModelNote { goodFor: string; notFor: string; source: string }`
  - `export const TEXT_NOTES: Record<string, ModelNote>`, keyed by `RECOMMENDED_MODELS[].id`.
  - `export const WHISPER_NOTES: Record<string, ModelNote>`, keyed by `WHISPER_MODELS[].id`. English and multilingual pairs may share one object.
  - `export const LITERT_NOTES: Record<string, ModelNote>`, keyed by `CURATED_LITERT_ENTRIES[].fileName`.
  - `export interface ImageModelNote extends ModelNote { name: string; sizeBytes: number }`
  - `export const IMAGE_BACKEND_NOTES: { mnn: string; qnn: string }`
  - `export const IMAGE_NOTES: ImageModelNote[]`
  - `export interface PhoneTier { gb: MemoryTier; examples: string[]; sources: string[] }`
  - `export const PHONE_TIERS: PhoneTier[]`, ordered 4, 6, 8, 12, 16.
  - `export const PHONE_TIPS: string[]`
  - `export function noteFor(id: string): ModelNote | undefined`, which looks up text, whisper and LiteRT notes.

- [ ] **Step 1: Write the failing test.**
  - Every `RECOMMENDED_MODELS` id, every `WHISPER_MODELS` id and every LiteRT `fileName` either has a note or appears in an exported `NO_NOTE: Record<string, string>` (id → reason).
  - Every note's `source` matches `^https://huggingface\.co/`. Every `PhoneTier.sources` entry starts with `https://`.
  - `goodFor` and `notFor` are each 1-70 characters, have no emoji (`/\p{Extended_Pictographic}/u`), and contain no "Off Grid" or "Wednesday" (case-insensitive).
  - `PHONE_TIERS.map(t => t.gb)` equals `[4, 6, 8, 12, 16]`. Each tier has at most 3 examples, and `examples.length === sources.length` (one spec page per phone, in the same order).
  - Each `IMAGE_NOTES[].sizeBytes` is greater than 0.

- [ ] **Step 2: Run it to see it fail.** Run `npx jest __tests__/unit/features/modelGuide/notes.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Write the content.**
  - **Text, Whisper and LiteRT notes:** fetch each model's Hugging Face model card. For quantized repos, read the base model's card that the repo links to, and put the URL you actually read in `source`.
    - Write "Good for" from what the card says the model is for.
    - Write "Not for" from what the card states, or from its size or modality, for example "Not for: images" on a text-only model.
    - Plain words, no marketing.
  - **Image notes:**
    - List today's models from `https://huggingface.co/api/models/xororz/sd-mnn/tree/main` and `.../sd-qnn/tree/main`. There is one note per distinct model, with `sizeBytes` taken from the smallest MNN file.
    - Each `source` is the base model's page where there is one, otherwise the repo.
    - `IMAGE_BACKEND_NOTES` explains that MNN runs on the CPU on any phone, and that QNN uses the Snapdragon NPU and is faster. State only what `src/services/hardware.ts` and the local-dream README support.
  - **Phone tiers:** up to three current, widely sold phones per tier. Check each phone's memory on the maker's own spec page, and put that page's URL in `sources`. Include the Samsung Galaxy S24 Ultra in tier 12. If a tier can't be checked, leave its `examples` empty.
  - **`PHONE_TIPS`:** plugged in and cool for long jobs, close other apps, and the Snapdragon NPU line for images.
  - Anything the card does not support goes in `NO_NOTE` with the reason.

- [ ] **Step 4: Run it to see it pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(models): hand-written model notes and phone tiers`.

The reviewer for this task re-reads every `source` page and checks each line against it. That is the second reader the spec requires.

---

### Task 4: Numbers, "Good for" and labels on model cards

**Files:**
- Create: `__tests__/harness/modelsApp.ts`
- Modify: `src/components/ModelCard.tsx` (model prop type at 20-68)
- Modify: `src/components/ModelCardContent.tsx` (compact header 131-136, props 43-59)
- Modify: `src/screens/ModelsScreen/useTextModels.ts` (`mapCuratedModel` 56-61, `computeFilteredResults` 72-97)
- Modify: `src/screens/ModelsScreen/TextModelsTab.tsx` (`ModelListItem` 289-302)
- Test: `__tests__/integration/models/modelCardDetails.rendered.test.tsx`

**Interfaces:**
- Consumes: `installHfApiFake` (Task 1); `formatUpdatedAgo` and `autoLabels` (Task 2); `noteFor` (Task 3).
- Produces:
  - `ModelCard` `model` gains `downloadsAllTime?: number; lastModified?: string`, and new props `goodFor?: string; labels?: string[]`.
  - The compact card renders three lines, with testIDs `${testID}-stats`, `${testID}-good-for` and `${testID}-labels`:
    - "{downloads} downloads this month · {all} all time", where the all-time part only shows when it is above 0, and the whole line only when downloads > 0;
    - "{likes} likes · updated …", showing whichever parts exist, with no line when neither does;
    - "Good for: …" when there is a note, otherwise the labels joined by " · ".
  - The compact "N dl" badge is removed.
  - Rendered-test helper `openModelsFromHome(opts: { totalGB: number; platform?: 'android' | 'ios'; hf?: (hf: HfApiFake) => void }): Promise<{ rtl; ui; hf: HfApiFake }>`. It copies the boot from `__tests__/integration/app/tabBar.rendered.test.tsx:25-55`, installs `installHfApiFake()` in place of the throwing fetch, calls `setDeviceMemory({ platform, totalGB, availGB: totalGB / 2 })`, renders `AppNavigator`, presses `home-phone-models` and waits for `models-screen`.

- [ ] **Step 1: Write the failing rendered test.**
  - Use `openModelsFromHome({ totalGB: 10.82, platform: 'ios' })`, with `hf.setDetails` giving `unsloth/Qwen3.5-2B-GGUF` the values `downloads: 1234567`, `downloadsAllTime: 9800000`, `likes: 2300` and `lastModified: new Date(Date.now() - 3 * 86400000).toISOString()`. Do not use fake timers in rendered tests; they stall `waitFor`.
  - Assert that the card containing "Qwen 3.5 2B" shows "1.2M downloads this month · 9.8M all time", "2.3K likes · updated 3 days ago" and `` `Good for: ${TEXT_NOTES['unsloth/Qwen3.5-2B-GGUF'].goodFor}` ``. Skip that last line if the id is in `NO_NOTE`.
  - Type `coder` in `search-input`. The fake returns `{ id: 'x/Qwen2.5-Coder-1.5B-GGUF', tags: ['gguf'] }`, with no downloads and no dates. Assert that the card shows "Coding · Small, fast", and that no text in it matches `/undefined|NaN|downloads this month|likes/`. This is Review Focus 1.

- [ ] **Step 2: Run it to see it fail.** Run `npx jest --runInBand __tests__/integration/models/modelCardDetails.rendered.test.tsx`. Expected: FAIL (the text is not found).

- [ ] **Step 3: Implement.**
  - `useTextModels` attaches `goodFor` (from `noteFor(id)?.goodFor`) and `labels` (from `autoLabels`, only when there is no note) to each list item, where it already maps items.
  - `TextModelsTab` passes them to `ModelCard`.
  - `ModelCardContent` renders the lines with `TYPOGRAPHY` and `COLORS` tokens.

- [ ] **Step 4: Run it to see it pass.** Same command, plus `npx jest __tests__/rntl/components/ModelCard.test.tsx __tests__/rntl/screens/ModelsScreen.test.tsx`. Expected: PASS. Update existing assertions on the removed "dl" badge.

- [ ] **Step 5: Commit** with the message `feat(models): download counts, likes, last update and notes on model cards`.

---

### Task 5: Sorts that ask Hugging Face

**Files:**
- Modify: `src/screens/ModelsScreen/types.ts:42` (`SortOption`)
- Modify: `src/screens/ModelsScreen/constants.ts:65-71` (`SORT_OPTIONS`)
- Modify: `src/screens/ModelsScreen/useTextModels.ts` (`applySort` 34-44, `runSearch` 141-162, effects 170-183)
- Modify: `src/screens/ModelsScreen/TextModelsTab.tsx` (`SortPanel` 311-328)
- Test: `__tests__/integration/models/serverSorts.rendered.test.tsx`

**Interfaces:**
- Consumes: `browseModels`, `BrowseSort` (Task 1); `memoryTierGB`, `maxParamsForTier` (Task 2); `openModelsFromHome` (Task 4).
- Produces:
  - `SortOption = 'recommended' | 'bestfit' | 'size' | 'trending' | 'downloads' | 'likes' | 'newest'`. `'recency'` is removed.
  - `SORT_OPTIONS`, in this order with these labels and Feather icons:
    - recommended: 'Smart', `zap`;
    - bestfit: 'For You', `smartphone`;
    - size: 'Size', `database`;
    - trending: 'Trending', `trending-up`;
    - downloads: 'Most downloaded', `download`;
    - likes: 'Most liked', `heart`;
    - newest: 'New releases', `clock`.
  - Each sort chip has `testID={`sort-option-${key}`}`.

- [ ] **Step 1: Write the failing rendered test.** Use `openModelsFromHome({ totalGB: 10.82 })`, then press `sort-pill`.
  1. Press `sort-option-trending`. The last list request has `sort=trendingScore` and `num_parameters=min:0,max:13B`. The faked results show in `models-list`, and "Recommended for your device" is gone.
  2. Press `sort-option-newest`. There are 5 requests with `author=`, and the merged list shows. Make `bartowski` fail; the others still show.
  3. Review Focus 2: call `hf.hold()`, press Trending (held request 0), then press Most liked (held request 1). Call `release(1)` and then `release(0)`. Only the Most liked results show.
  4. Review Focus 4: type `qwen`, then press `sort-option-likes`. The request has `search=qwen&sort=likes`. Clear `search-input`, and the results stay. Then press `sort-option-recommended`, and "Recommended for your device" is back.
  5. Review Focus 5: the fake returns only `{ id: 'a/tts-GGUF', pipeline_tag: 'text-to-speech' }`. Press Trending, and "No models found. Try a different search term." shows.

- [ ] **Step 2: Run it to see it fail.** Run `npx jest --runInBand __tests__/integration/models/serverSorts.rendered.test.tsx`. Expected: FAIL (`sort-option-trending` not found).

- [ ] **Step 3: Implement.**
  - A server sort runs `browseModels(query, { sort, maxParamsB: maxParamsForTier(memoryTierGB(ramGB)), pipelineTag, limit: 30 })`, even with an empty query. Client sorts keep calling `searchModels`.
  - Changing `filterState.sort` to a server sort runs the search. Changing it to a client sort with no query and no filters shows the picks again.
  - `applySort` returns server-sorted lists unchanged.
  - Ignore stale answers with a request counter held in a `useRef`. A later `runSearch` makes earlier answers no-ops.

- [ ] **Step 4: Run it to see it pass.** Same command, plus `npx jest __tests__/unit/screens/ModelsScreen __tests__/rntl/screens/ModelsScreen.test.tsx`. Expected: PASS. Update tests that used `'recency'` or expected a client-side Downloads reorder.

- [ ] **Step 5: Commit** with the message `feat(models): Trending, Most downloaded, Most liked and New releases ask Hugging Face`.

---

### Task 6: Works with no connection

**Files:**
- Modify: `src/screens/ModelsScreen/useTextModels.ts` (`runSearch`)
- Modify: `src/screens/ModelsScreen/TextModelsTab.tsx` (under the search row, about line 412)
- Test: `__tests__/integration/models/modelsOffline.rendered.test.tsx`

**Interfaces:**
- Consumes: `useOffline()` (`src/services/networkStatus.ts`); `netInfoFake.setConnected` (`__tests__/harness/netInfoFake.ts`); `openModelsFromHome` (Task 4).
- Produces: the notice `<Text testID="models-offline-notice">Needs a connection to search, sort or show download numbers.</Text>`, shown while offline.

- [ ] **Step 1: Write the failing rendered test.** Call `netInfoFake.setConnected(false)` before `openModelsFromHome({ totalGB: 10.82 })`, and set it back to `true` in `afterEach`.
  - The notice shows, and the picks list shows with "Good for:" lines and no "downloads this month".
  - Type `qwen` and press Trending. No new list request is made (count `hf.requests()` before and after), and no "Search Error" text appears.
  - Call `netInfoFake.setConnected(true)`. The notice goes away, and the pending search runs (a request with `search=qwen&sort=trendingScore`).
  - Review Focus 3: while online, call `hf.hold()`, type `gemma`, call `setConnected(false)`, then `release(0, new Error('Network request failed'))`. The notice shows, and no "Search Error" appears.

- [ ] **Step 2: Run it to see it fail.** Run `npx jest --runInBand __tests__/integration/models/modelsOffline.rendered.test.tsx`. Expected: FAIL (the notice is not found).

- [ ] **Step 3: Implement.**
  - `useTextModels` reads `useOffline()`. While offline, `runSearch` returns before fetching and leaves the picks showing.
  - A failure that arrives while offline sets no alert. Read the offline state through a `useRef`, so that a late failure sees the current value and not the one captured when the search started.
  - On the change from offline to online, rerun `runSearch` when a query, filter or server sort is set.

- [ ] **Step 4: Run it to see it pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(models): Text tab says when it needs a connection`.

---

### Task 7: The "Which model?" guide screen

**Files:**
- Create: `src/screens/ModelGuideScreen.tsx`. Split section components into `src/screens/ModelGuideScreen/` if it would exceed 300 lines.
- Modify: `src/navigation/types.ts` (add `ModelGuide: undefined` to `RootStackParamList`)
- Modify: `src/navigation/AppNavigator.tsx` (register beside `Models`, at line 238)
- Modify: `src/screens/index.ts` (export)
- Modify: `src/screens/ModelsScreen/TextModelsTab.tsx` (button above the search row, at 383)
- Test: `__tests__/integration/models/modelGuide.rendered.test.tsx`

**Interfaces:**
- Consumes: everything in Task 2 and Task 3; `hardwareService.getTotalMemoryGB()`; `useOffline` is not needed.
- Produces:
  - Entry button `models-guide-button`, labelled "Which model?" with the Feather `compass` icon.
  - Screen testIDs:
    - `model-guide-screen` and `model-guide-back`;
    - `guide-your-phone`, with the text "Your phone: {tier} GB memory";
    - `guide-tier-{gb}`, where only the phone's tier has `accessibilityState={{ selected: true }}`;
    - `guide-note-{id}` for each note row (text id, whisper id, LiteRT file name, or image note name).
  - Each tier row shows its examples, "Runs well: …" and "Tight: …" from `textPickFit` over `RECOMMENDED_MODELS`, with names from `RECOMMENDED_MODELS[].name`. A part with no models is left out.
  - Under the tiers is the line "Fit comes from each model's size, not a speed test.", followed by `PHONE_TIPS`.
  - Sections:
    - **Text models:** name, "Good for: …", "Not for: …", and "Fits: {memoryTierGB(minRam)} GB and up", or "Fits: {min} to {maxRam} GB phones" when the pick has a `maxRam`.
    - **Image models:** `IMAGE_BACKEND_NOTES`, then each `IMAGE_NOTES` row with "Fits: {smallestFittingTier(sizeBytes)} GB and up".
    - **Transcription:** each Whisper note, with its fit from `smallestFittingTier(size * 1024 * 1024)`. A shared note is shown once, naming both models.
    - **LiteRT:** shown only where the Models list shows the LiteRT card (Android), with its fit from `sizeBytes`.

- [ ] **Step 1: Write the failing rendered test.** Use `openModelsFromHome({ totalGB: 10.82 })` and press `models-guide-button`. Then:
  - `model-guide-screen` shows, with `guide-your-phone` reading "Your phone: 12 GB memory";
  - `guide-tier-12` is selected and `guide-tier-8` is not;
  - the tier 12 row contains "Gemma 4 E4B";
  - `guide-note-unsloth/gemma-4-E4B-it-GGUF` shows `` `Good for: ${TEXT_NOTES[...].goodFor}` `` and "Fits: 6 GB and up".
  - Press `model-guide-back`, and `models-screen` shows.
  - In a second test, call `netInfoFake.setConnected(false)` first. The same guide content shows, because it needs no connection.

- [ ] **Step 2: Run it to see it fail.** Run `npx jest --runInBand __tests__/integration/models/modelGuide.rendered.test.tsx`. Expected: FAIL (`models-guide-button` not found).

- [ ] **Step 3: Implement.** Copy the screen, header and back pattern from `ModelsScreen` (SafeAreaView `edges={['top','bottom']}`, `models-back`-style back button). Use a `ScrollView`; no network.

- [ ] **Step 4: Run it to see it pass.** Same command, then the gate:
  - `npx tsc --noEmit`;
  - `npx eslint` on the changed files;
  - `npm run depcruise`;
  - `npm run knip`;
  - `npx jest __tests__/integration/models __tests__/integration/app/tabBar.rendered.test.tsx`.

  Expected: all clean and PASS.

- [ ] **Step 5: Commit** with the message `feat(models): Which model guide with phone tiers and notes`.
