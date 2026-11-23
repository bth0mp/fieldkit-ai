# Model explanations and run answer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Image and Whisper cards show the original model's Hugging Face numbers and notes like text cards do, and every model card says whether it runs on this phone.

**Architecture:** A hand-made map sends each image and Whisper model to the page of the model it was converted from (`src/features/modelGuide/origins.ts`). A service fetches those pages' numbers through the existing `huggingFaceService.getModelDetails`. One owned primitive in `memoryBudget.ts` gives the run verdict, and the load pre-check and the cards both use it. `ModelCard` gains two optional lines, the run answer and "Original: ...".

**Tech Stack:** React Native 0.83, TypeScript, Jest with the rendered harness in `__tests__/harness/`.

**Spec:** `docs/superpowers/specs/2026-11-23-model-explanations-design.md`

## Global Constraints

- No new dependencies.
- UI uses theme tokens only: `TYPOGRAPHY`, `COLORS` via `useTheme`, `SPACING`. Font weights 400 or lower. Feather icons. No emoji in UI text.
- The app carries no name of the project it started from (CLAUDE.md), in code, comments or commit messages; `__tests__/unit/ownName.test.ts` guards it.
- Screens and hooks hold no business logic. Pure rules live in services or `src/utils/`; services own fetching and caches.
- One rendered integration test per task that changes what the user sees: mount the real screen with `openModelsFromHome` (`__tests__/harness/modelsApp.ts`), reach the state through real taps, assert visible text. Fake only at the device boundary (`__tests__/harness/`), never our own modules.
- Exact copy:
  - `Runs on this phone`
  - `Tight on this phone: needs about {need} GB of {allow} GB`
  - `Won't run: needs about {need} GB, this phone allows {allow} GB`
  - `Won't run: {reason}` for a chip, where `{reason}` is `getImageModelCompatibility`'s `incompatibleReason` with its first letter lower-cased (`Won't run: requires Snapdragon 8 Gen 2+`)
  - `Original: {owner/name}`
  - `{need}` and `{allow}` are GB with one decimal (`toFixed(1)`).
- Notes follow `__tests__/unit/features/modelGuide/notes.test.ts`: 70 characters or fewer, source is a `https://huggingface.co/` page, no speed or quality claims.
- LF line endings. Each green step is its own commit; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before each commit: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run depcruise`, `npm run knip`, and the task's tests.

## Review Focus

1. **No connection or a Hugging Face error:** image and Whisper cards still show the run answer, the "Original:" line and the notes, and show no numbers, no "undefined", no "NaN" and no empty lines. Task 3's test covers offline.
2. **A model both on the wrong chip and too big:** the chip reason wins, because no amount of memory fixes it. Task 2's test covers it.
3. **Aggressive load policy:** the run answer follows the policy setting the way the load check does (a bigger budget). Task 2 unit test covers it.
4. **Several variants of one image model** (GPU, NPU min, 8gen1, 8gen2): all show the same original page and numbers from one request per page, not one per card. Task 3's test counts requests.
5. **RAM not read yet:** `hardwareService.getTotalMemoryGB()` returns a 4 GB fallback before device info loads (`activeModelService/index.ts:261`). The run answer must not show "Won't run" for a model that fits once RAM is known; the cards re-render when device info arrives. Task 2's implementer checks what the Models screen already does for `ramGB` and follows it.

---

### Task 1: Original pages and image notes (data)

**Files:**
- Create: `src/features/modelGuide/origins.ts`
- Modify: `src/features/modelGuide/notes.ts` (`IMAGE_NOTES`, and its comment above it)
- Test: `__tests__/unit/features/modelGuide/origins.test.ts`
- Test: `__tests__/integration/models/modelGuide.rendered.test.tsx` (add one assertion)

**Interfaces:**
- Produces:
  - `WHISPER_ORIGINS: Record<string, string>`: Whisper id (`WHISPER_MODELS[].id`) to `owner/name`.
  - `IMAGE_ORIGINS: Record<string, string>`: image name as `parseFileName` derives it (`HFImageModel.name`) to `owner/name`.
  - `NO_ORIGIN: Record<string, string>`: image name to the reason it has no original page.
  - `originFor(kind: 'image' | 'whisper', key: string): string | undefined`.
  - `IMAGE_NOTES` entries for the names whose original page supports one.

The 20 image names the app derives today (from the file lists of `xororz/sd-qnn` and `xororz/sd-mnn`): `AbsoluteReality`, `AnythingV5`, `ChilloutMix`, `CrossKemono2.5`, `CuteYukiMix`, `DarkSushiV4`, `DreamShaperV8`, `HyperSpireV5`, `MajicmixRealisticV7`, `MeinaMixV12`, `MistoonAnimeV3`, `NaiAnimeV2`, `NeverEndingDreamV122`, `QteaMix`, `RealisianV6`, `RealisticVisionHyper`, `SweetMixV22Flat`, `counterfeitV30`, `superinvinciblev2`, `unStableIllusion`.

Rules for an original page: it is on huggingface.co, it is the maker's own account (not a re-upload account such as `digiplay` or `stablediffusionapi`), and it describes that model or its family (a family page such as `Lykon/DreamShaper` counts for `DreamShaperV8` when the page lists that version). Whisper ids map to `openai/whisper-<id>` (for example `large-v3-turbo` to `openai/whisper-large-v3-turbo`); check each page exists. Look at the page through the Hugging Face API (`https://huggingface.co/api/models/<owner/name>`) and its model card (`https://huggingface.co/<owner/name>/raw/main/README.md`).

An image note is added only when the original page says what the model is for. `sizeBytes` is the smallest zip the app offers for that name (from the two repos' `tree/main` listings). `source` is `https://huggingface.co/<owner/name>`.

- [ ] **Step 1: Write the failing test** `origins.test.ts`:
  - every `WHISPER_MODELS` id has a `WHISPER_ORIGINS` entry starting with `openai/whisper-`;
  - each of the 20 names above is in exactly one of `IMAGE_ORIGINS` or `NO_ORIGIN`;
  - every origin value matches `/^[\w.-]+\/[\w.-]+$/`;
  - every `NO_ORIGIN` reason is 1 to 120 characters;
  - every `IMAGE_NOTES` name is an `IMAGE_ORIGINS` key and its `source` equals `https://huggingface.co/${IMAGE_ORIGINS[name]}`;
  - `originFor('whisper', 'tiny')` is `'openai/whisper-tiny'` and `originFor('image', 'no-such')` is `undefined`.
- [ ] **Step 2: Run it and see it fail:** `npx jest __tests__/unit/features/modelGuide/origins.test.ts` fails on the missing module.
- [ ] **Step 3: Research and fill `origins.ts` and `IMAGE_NOTES`.** Write each finding into the report file: name, page, what the page says it is for, the zip sizes seen. Rewrite the comment above `IMAGE_NOTES` so it says notes come from the original maker's page.
- [ ] **Step 4: Add to `modelGuide.rendered.test.tsx`:** the "Which model?" image section lists each `IMAGE_NOTES` name with its "Good for" text (skip the assertion when `IMAGE_NOTES` is empty).
- [ ] **Step 5: Run** `npx jest __tests__/unit/features/modelGuide __tests__/integration/models/modelGuide.rendered.test.tsx`; all pass.
- [ ] **Step 6: Commit** `feat(models): original pages for image and Whisper models, notes for image models`.

The task reviewer checks every entry against its page itself, as the second reviewer.

### Task 2: Run answer on every card

**Files:**
- Modify: `src/services/memoryBudget.ts` (add `runVerdict`)
- Modify: `src/services/activeModelService/memory.ts` (severity uses `runVerdict`; export `estimateModelMemoryGB`)
- Create: `src/services/runAnswer.ts`
- Modify: `src/components/ModelCard.tsx`, `src/components/ModelCardContent.tsx` (prop `runAnswer`)
- Modify: `src/screens/ModelsScreen/ImageModelsTab.tsx`, `src/screens/ModelsScreen/TranscriptionModelsTab.tsx`, `src/screens/ModelsScreen/TextModelsTab.tsx` (file cards), `src/screens/ModelDownloadScreen.tsx` (file cards)
- Modify: `src/screens/ModelsScreen/YourModels.tsx` (image RAM hint from `hardwareService.estimateImageModelRam`; drop `IMAGE_RAM_MULTIPLIER`)
- Test: `__tests__/unit/services/memoryBudget.runVerdict.test.ts`
- Test: `__tests__/integration/models/runAnswer.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `type RunVerdict = 'runs' | 'tight' | 'wont'`
  - `runVerdict(requiredMB: number, totalRamMB: number, policy?: LoadPolicy, platform?: Plat): { verdict: RunVerdict; needGB: number; allowGB: number }` in `memoryBudget.ts`. `wont` when `requiredMB > modelMemoryBudgetMB(totalRamMB, platform, policy)`; `tight` when `requiredMB > modelWarningThresholdMB(totalRamMB, platform)`; else `runs`. `allowGB` is the budget in GB.
  - `interface RunAnswer { verdict: RunVerdict; text: string }` and, in `runAnswer.ts`:
    - `textRunAnswer(sizeBytes: number): RunAnswer` (required = `estimateModelMemoryGB({ fileSize: sizeBytes }, 'text')`);
    - `imageRunAnswer(model: { size: number }, chipReason?: string): RunAnswer` (chip reason first; else required = `hardwareService.estimateImageModelRam(model)`);
    - `whisperRunAnswer(model: { size: number; ramGB?: number }): RunAnswer` (required = the larger of the file, `size` in MB, and `ramGB`, as `sections.ts` `whisperEntries` does).
    - All read total RAM from `hardwareService.getTotalMemoryGB()` and the policy from the residency manager's current load policy.
  - `ModelCard` prop `runAnswer?: RunAnswer`, rendered as one line with testID `${testID}-run`. When it is given, the "Too large" / incompatible badge is not rendered.

- [ ] **Step 1: Write the failing unit test** `memoryBudget.runVerdict.test.ts`: on an 8 GB Android phone (`8192` MB), a requirement just under `modelWarningThresholdMB(8192, 'android')` is `runs`, just over it is `tight`, just over `modelMemoryBudgetMB(8192, 'android')` is `wont`; with `'aggressive'` the same `wont` value becomes `tight` or `runs`; `allowGB` equals `modelMemoryBudgetMB(...) / 1024`. Compute every threshold from the owned functions, never hard-coded.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement `runVerdict`**, then make `checkMemoryForModel`'s severity in `memory.ts` call it with the total requirement (this model plus the ones loaded), keeping its messages. Run `npx jest __tests__/unit/services __tests__/integration/models/activeModelService.test.ts`; existing tests still pass.
- [ ] **Step 4: Write the failing rendered test** `runAnswer.rendered.test.tsx` with `openModelsFromHome` on an Android phone (pick RAM so the cases split; compute expected text from `runVerdict`, `estimateImageModelRam` and the copy in Global Constraints):
  - Transcription tab: the `tiny` card shows `Runs on this phone`.
  - Image tab (extend `hfApiFake` with `setTree(repo, entries)` answering `/api/models/<repo>/tree/main` so the image list has models): a small GPU zip shows `Runs on this phone`; a zip whose estimate passes the budget shows `Won't run: needs about ..., this phone allows ...`; an NPU zip on a phone without that chip shows `Won't run: requires ...`, even when it is also too large.
  - Text tab: open a model's detail through a search and tap; a file card shows its run answer.
  - "Your models" with a downloaded image model shows the RAM figure from `estimateImageModelRam` (2.5 times on Android).
- [ ] **Step 5: Run it and see it fail.**
- [ ] **Step 6: Implement** `runAnswer.ts`, the card line, the four call sites and the `YourModels` fix.
- [ ] **Step 7: Run** the unit test, the rendered test, and `npx jest __tests__/integration/models __tests__/rntl/components/TranscriptionModelsTab.test.tsx __tests__/rntl/screens/ModelsScreen.test.tsx`; all pass (a heavy suite that times out under load: rerun alone with `--runInBand`).
- [ ] **Step 8: Commit** in two parts: `feat(models): one run verdict shared by the load check and the cards` (memoryBudget, memory.ts, unit test), then `feat(models): every model card says whether it runs on this phone`.

### Task 3: Numbers and notes from the original page on image and Whisper cards

**Files:**
- Create: `src/services/originStats.ts`
- Create: `src/hooks/useOriginStats.ts`
- Modify: `src/components/ModelCard.tsx`, `src/components/ModelCardContent.tsx` (prop `origin`)
- Modify: `src/screens/ModelsScreen/ImageModelsTab.tsx`, `src/screens/ModelsScreen/TranscriptionModelsTab.tsx`
- Test: `__tests__/integration/models/originStats.rendered.test.tsx`

**Interfaces:**
- Consumes: `originFor`, `IMAGE_NOTES` (Task 1); `ModelCard`'s `runAnswer` (Task 2).
- Produces:
  - `interface OriginStats { downloads: number; likes: number; lastModified?: string; createdAt?: string }`
  - `getOriginStats(repo: string): Promise<OriginStats | null>` through `huggingFaceService.getModelDetails`, cached in memory for the session per repo (a failed fetch is not cached), `null` on any error.
  - `useOriginStats(repos: string[]): Record<string, OriginStats>`: fetches each distinct repo once and returns what arrived.
  - `ModelCard` prop `origin?: string`, rendered as `Original: {origin}` with testID `${testID}-origin`.
- Cards pass `downloads`, `likes` and `lastModified` from the stats into `model`, so the existing stat lines render them unchanged. Image cards pass `goodFor` from the `IMAGE_NOTES` entry whose `name` equals `HFImageModel.name`. Both tabs show the same "needs a connection" notice the Text tab shows (`TextModelsTab.tsx` near line 429), under the same condition, reusing that piece rather than copying it.

- [ ] **Step 1: Write the failing rendered test** `originStats.rendered.test.tsx` (Android, `setTree` from Task 2, `setDetails` for one image origin and one Whisper origin):
  - the image card for a mapped name shows `Original: <repo>`, the downloads line and the likes line exactly as the text cards format them, and `Good for: <note>` when it has a note;
  - all variants of that name show the same numbers and the fake saw one `/api/models/<repo>` request;
  - an unmapped image name shows no `Original:` line and no numbers;
  - the Whisper `large-v3-turbo` card shows `Original: openai/whisper-large-v3-turbo` and its numbers;
  - with `setOffline(true)` before opening: no numbers, no `undefined` or `NaN`, the run answer and notes still show, and the connection notice shows.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement** the service, the hook, the card line and the two tabs.
- [ ] **Step 4: Run** the new test and `npx jest __tests__/integration/models __tests__/rntl/components/TranscriptionModelsTab.test.tsx`; all pass.
- [ ] **Step 5: Commit** `feat(models): image and Whisper cards show the original model's numbers and notes`.

### Task 4: Sort the image tab

**Files:**
- Create: `src/utils/imageModelSort.ts`
- Modify: `src/screens/ModelsScreen/useModelsScreen.ts` (sort state next to the image filters), `src/screens/ModelsScreen/ImageModelsTab.tsx`
- Test: `__tests__/integration/models/imageSort.rendered.test.tsx`

**Interfaces:**
- Consumes: `useOriginStats`, `originFor` (Tasks 1 and 3).
- Produces: `type ImageSort = 'popular' | 'liked' | 'newest' | 'size'` and `sortImageModels(models: HFImageModel[], sort: ImageSort, stats: Record<string, OriginStats>): HFImageModel[]`. Popular by `downloads`, Most liked by `likes`, Newest by `createdAt` (all descending, models without stats last, ties keep list order); Size ascending by `size`.
- Labels: `Popular`, `Most liked`, `Newest`, `Size`. The row looks and behaves like the Text tab's sort row; reuse that piece (extract it with a prop if it is private to `TextModelsTab`) rather than copying it. Default sort: the list's current order until the user picks one.

- [ ] **Step 1: Write the failing rendered test:** three image names with different downloads, likes, creation dates and sizes; tapping each sort option puts the card names in the expected order; a name without stats sits last under Popular.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and `npx jest __tests__/integration/models`; all pass.
- [ ] **Step 5: Commit** `feat(models): sort image models by popularity, likes, age or size`.
