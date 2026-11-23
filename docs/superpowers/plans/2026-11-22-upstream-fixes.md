# Upstream Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the upstream bug fixes Fieldkit still lacks, and the one v0.0.125 speed-up that applies, into Fieldkit.

**Architecture:** Hand-port the final upstream behaviour file by file from the public MIT repo, each with a test. Three lanes in separate worktrees own disjoint files: A (`upstream-fixes`: saved state, server keys, lock screen), B (`upstream-fixes-b`: engine, remote, search, images, tabs), C (`upstream-fixes-c`: Android downloads, voice, model files, lists, chat scroll). Lanes B and C are cherry-picked onto A at the end.

**Tech Stack:** React Native 0.83, TypeScript, zustand 5, AsyncStorage 2.2, op-sqlite 15, Kotlin, Jest + React Native Testing Library.

**Spec:** docs/superpowers/specs/2026-11-22-upstream-fixes-design.md

## Global Constraints

- Upstream source is local: `git show <hash>` for a commit, `git show refs/upstream-tags/v0.0.125:<path>` for the final file. Never fetch, never open the network, never use files under `pro/`, and never port a line that imports an upstream workspace alias or `../shared`.
- Prefer the final v0.0.125 behaviour over the single commit. Do not port unrelated upstream changes that sit in the same file (analytics, sync, Pro, gateway, video, redesign).
- Each commit body names its source: `Ported from upstream <hash> (MIT).` Last line of every commit message: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new dependencies. No change to `package.json` or `package-lock.json`.
- Nothing the user sees may name upstream or its company. No emoji in UI text. Theme tokens only. Font weights at or below 400. Feather icons.
- Files stay at or under 500 lines and functions under 350 (ESLint). `src/services/llm.ts` is at 500 now: move code out, do not squash lines.
- Do not edit a file that `feat/model-marketplace` edits unless the task names it: run `git diff --name-only origin/main feat/model-marketplace` to see the list. Never edit another lane's files.
- TDD: write the test, see it fail for the stated reason, then fix. A rendered test under `__tests__/integration/` mounts the real screen and fakes only the device boundary (`__tests__/harness/`). A unit test is enough where the plan says unit.
- Verify-first: if the bug turns out not to exist in Fieldkit, do not change code. Report it with the evidence.
- Commands run in Git Bash from the worktree root: `npx jest --runInBand <file>`, `npx tsc --noEmit`, `npx eslint <files>`, `npx depcruise src --config .dependency-cruiser.js`, `npx knip`. Capture exit codes; never end a gate in a pipe. While iterating, run only the test file you are working on. Before committing, also run the existing tests that import a file you changed (`npx jest --runInBand --findRelatedTests <changed src files>`; if that is more than about 30 suites, run the ones under `__tests__/unit` and the two or three rendered suites nearest the change, and say so).
- Never push, tag, stash, reset, or switch branches. Commit only your task's files.

## Review Focus

- A chat history saved by v0.4.0 (one plain JSON row) opens unchanged after the update and is saved in parts on the next change. (Task 1)
- A chat whose text has emoji at a part boundary reads back identical. (Task 1)
- Renaming a saved server without retyping its key keeps the key. (Task 3)
- A download that is cut, where the server then answers 200 instead of 206, restarts from zero and never produces a file with mixed bytes. (Task 10)
- A Max Tokens value saved above the context length by an older version is bounded at use, and both sliders still open. (Task 6)

---

## Lane A: saved state (worktree `upstream-fixes`, branch `fix/upstream-0125`)

### Task 1: Saved chats survive a failed, slow or oversized read

**Files:**
- Create: `src/utils/chunkedStorage.ts`, `src/utils/hydrationGatedStorage.ts`, `src/utils/mergeSessionIntoSaved.ts`
- Modify: `src/stores/chatStore.ts` (persist options near line 369), `android/gradle.properties`, `src/screens/ChatsListScreen.tsx` (notice only)
- Test: `__tests__/unit/utils/chunkedStorage.test.ts`, `__tests__/unit/utils/hydrationGatedStorage.test.ts`, `__tests__/unit/utils/mergeSessionIntoSaved.test.ts`, `__tests__/integration/chats/savedChatsAreKept.rendered.test.tsx`

**Interfaces:**
- Produces: `createHydrationGatedStorage<S>(base?: StateStorage, unchanged?: (previous: S, next: S) => boolean): HydrationGatedStorage<S>` with the v0.0.125 members plus `status: StoreApi<{ unreadable: boolean }>` (zustand/vanilla) and `retryNow(): Promise<void>`. `createChunkedStorage(base?, readOversized?)`, `readOversizedRow`. From `chatStore.ts`: `useChatsUnreadable(): boolean`, `retryLoadingChats(): Promise<void>`.
- Task 2 uses `createHydrationGatedStorage` exactly as chatStore does.

**Decisions:** the manifest prefix is `fieldkit-chunked:v1:`. `status.unreadable` turns true when a second read in a row fails and false when a read succeeds. `retryNow` reads again at once, also after the automatic retries have run out. `activeConversationId` follows the session on a late read (`keepCurrent`). The chat store passes the `unchanged` comparison from upstream (`conversations` and `activeConversationId` identical by reference).

- [ ] **Step 1:** Port the three upstream unit test files, adapted to the prefix, and add to `chunkedStorage.test.ts`: `it('reads a value saved by an older build as it is, then writes it in parts')` (base holds a plain JSON string; `getItem` returns it unchanged; after `setItem` the key holds `fieldkit-chunked:v1:1`) and `it('keeps an emoji whole when it falls on a part boundary')` (value `'a'.repeat(256*1024 - 1) + '😀' + 'b'`; round trip equals the input).
- [ ] **Step 2:** Run them. Expected: FAIL, modules not found.
- [ ] **Step 3:** Add the three utilities. `MANIFEST = 'fieldkit-chunked:v1:'`. Add `status` and `retryNow` as above, with unit tests `it('reports unreadable after two failed reads and clears it on a good one')` and `it('retryNow reads again after the automatic retries have run out')`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Write `savedChatsAreKept.rendered.test.tsx` (mount the real app or the Chats screen as the neighbouring chat tests do):
  - `it('keeps saved chats when the first read fails and a chat is started meanwhile')`: seed the key with one chat titled `Saved before`; `AsyncStorage.getItem` rejects once for `local-llm-chat-storage`; start a new chat and send `hello`; after the retry the Chats list shows `Saved before` and the new chat, and the stored value holds both.
  - `it('opens a history too large for Android to read in one row')`: `getItem` for that key always rejects with `Row too big to fit into CursorWindow`; the op-sqlite fake answers the `length(value)` and `substr` queries; the Chats list shows the saved chat; after a change the stored key starts with `fieldkit-chunked:v1:`.
  - `it('says so when saved chats cannot be read, and Try again brings them back')`: reads keep failing and op-sqlite has no row; the Chats screen shows `Your saved chats could not be read. New chats will not be kept until they can be.` and a button `Try again`; nothing is written to the key; when reads work again, `Try again` shows the chats and removes the notice.
  - `it('does not write the chat history while a reply streams')`: after a stored chat exists, 100 `appendToStreamingMessage` calls cause no `setItem` or `multiSet`.
- [ ] **Step 6:** Run. Expected: FAIL (chats lost, no notice, 100 writes).
- [ ] **Step 7:** Wire `chatStore` to the gated, chunked storage; add the notice as a `ListHeaderComponent`-style row using theme tokens and Feather `alert-triangle`, `accessibilityRole="alert"`, button `accessibilityRole="button"`; add `AsyncStorage_db_size_in_MB=64` with a one-line comment to `android/gradle.properties`. An empty Chats list must still show the notice.
- [ ] **Step 8:** Run the four test files plus every existing suite that mentions `chatStore` persistence. Expected: PASS.
- [ ] **Step 9:** Commit: `fix(chat): saved chats survive a failed, slow or oversized read` (d7f8b6057, 664bf0787, 2dd59a417, 6d438b7e0, b95fa466b, b5fd8dc42, d8bdc85c5, 78bfd2290).

### Task 2: Every other saved store is guarded the same way

**Files:**
- Modify: `src/stores/appStore.ts`, `src/stores/authStore.ts`, `src/stores/projectStore.ts`, `src/stores/remoteServerStore.ts`, `src/stores/whisperStore.ts`, `src/stores/speechStore.ts`, `src/features/home/homeLayout.ts`, `src/features/home/homePlace.ts`, `src/services/kiwix/kiwixStore.ts`
- Test: `__tests__/integration/app/settingsSurviveFailedRead.test.ts`, `__tests__/integration/happy/projectsAfterFailedLoad.happy.test.tsx`

**Interfaces:** Consumes `createHydrationGatedStorage` from Task 1.

**Decisions:** keep each store's existing `merge`, `migrate`, `version`, `partialize` and `onRehydrateStorage` behaviour; pass an existing custom merge as `savedOverCurrent` to `gate.merge(...)`. `checklistStore` is not changed. `App.tsx` is not changed unless a test proves startup breaks.

- [ ] **Step 1:** Write `settingsSurviveFailedRead.test.ts`: a table over the nine stores (`describe.each`), each case: seed a distinctive saved value, make `getItem` reject once for that key, load the store fresh (`jest.isolateModules`), change one field, wait for the retry, and assert the stored value still holds the saved field and holds the change. Port `projectsAfterFailedLoad.happy.test.tsx`.
- [ ] **Step 2:** Run. Expected: FAIL for all nine (the saved value is overwritten).
- [ ] **Step 3:** Wire the nine stores.
- [ ] **Step 4:** Run those files, then `npx jest --runInBand __tests__/unit/stores` and the boot test that renders the real App. Expected: PASS.
- [ ] **Step 5:** Commit: `fix(stores): settings, projects, servers and the rest survive a failed read` (664bf0787, 80538cd3f).

### Task 3: Server keys live only in the Keychain

**Files:**
- Modify: `src/services/remoteServerManager.ts`, `src/services/remoteServerManagerUtils.ts`, `src/stores/remoteServerStore.ts`, `src/stores/remoteServerHelpers.ts`, `src/stores/remoteModelCapabilities.ts`, `src/services/httpClientUtils.ts` (401/403 only), `src/screens/RemoteServersScreen.tsx`, `src/components/RemoteServerModal/useRemoteServerForm.ts`
- Test: `__tests__/integration/remote/serverKeyStorage.rendered.test.tsx`

**Interfaces:**
- Produces: `remoteServerManager.moveStoredKeysToKeychain(): Promise<void>`, awaited first in provider initialisation. Store methods become `discoverModels(serverId: string, apiKey?: string)` and `testConnection(serverId: string, apiKey?: string)`; callers pass the Keychain key through `remoteServerManager`.

**Decisions:** `addServer` and `updateServer` in both the manager and the store drop `apiKey` before anything is saved. Migration: for each saved server with an `apiKey`, if the Keychain already has a key for that id, keep the Keychain one; else store it there; drop it from the record only after the Keychain call succeeded; if it fails, leave the record and try again next launch. A key is sent with every probe and model list (73b1b890b). A 401 or 403 is reported as `The server refused the API key.` instead of an empty list (375da8f0f). Do not port `remoteTransportPolicy.ts`.

- [ ] **Step 1:** Write the rendered test:
  - `it('never saves a new server key outside the Keychain')`: add a server with key `sk-secret-1` through the modal; the stored `remote-servers` value does not contain `sk-secret-1`; the Keychain fake holds it.
  - `it('moves a key an older version saved into the Keychain')`: seed `remote-servers` with a server holding `apiKey: 'sk-old'` and an empty Keychain; after startup the Keychain holds `sk-old` and the stored value does not contain it.
  - `it('keeps the newer Keychain key over an old saved one')`: both present, different; the Keychain value is unchanged and the record is clean.
  - `it('keeps the saved copy when the Keychain refuses it')`: the Keychain set rejects; the stored value still holds `sk-old`; no crash.
  - `it('checks each listed server with its saved key')`: opening Remote Servers sends `Authorization: Bearer sk-old` on the test and on the capability probes.
  - `it('says the key was refused')`: the server answers 401; the screen shows `The server refused the API key.`
  - `it('keeps the key when a server is renamed without retyping it')`.
- [ ] **Step 2:** Run. Expected: FAIL on the first two, the fifth, sixth, and possibly the last.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it and every suite matching `remote` under `__tests__/unit` and `__tests__/integration`. Expected: PASS.
- [ ] **Step 5:** Commit: `fix(remote): server keys live only in the Keychain` (eddb566d7, 73b1b890b, 375da8f0f).

### Task 4: A Keychain that cannot be read is not a wrong passphrase

**Files:** Modify `src/services/authService.ts`, `src/screens/LockScreen.tsx`, `src/screens/PassphraseSetupScreen.tsx`. Test: `__tests__/unit/services/authService.test.ts`, `__tests__/rntl/screens/LockScreen.test.tsx`.

- [ ] **Step 1:** Port the b7a95bd66 test changes: a Keychain read that rejects shows `Couldn't check your passphrase` with `Try again`, and five tries leave `failedAttempts` at 0; a wrong passphrase still counts and still locks after five.
- [ ] **Step 2:** Run. Expected: FAIL (lockout).
- [ ] **Step 3:** Port b7a95bd66.
- [ ] **Step 4:** Run. Expected: PASS. Also confirm by test that a Keychain error never unlocks.
- [ ] **Step 5:** Commit: `fix(lock): a Keychain that cannot be read no longer locks you out` (b7a95bd66).

---

## Lane B: engine, remote, search, images, tabs (worktree `upstream-fixes-b`, branch `fix/upstream-0125-b`)

### Task 5: Stop, unload and missing photos in the engine

**Files:** Modify `src/services/llm.ts`, `src/services/llmToolGeneration.ts`, `src/services/llmMessages.ts`. Test: `__tests__/unit/services/llmEarlyStop.test.ts`, `__tests__/unit/services/llm.test.ts`, `__tests__/unit/services/llmToolGeneration.test.ts`.

**Decisions:** three commits. (1) 543c3eb87 with 290bd549d: a Stop before `ctx.completion` starts means the completion is not started, and a Stop that lands as it starts is sent again; a token after Stop never throws. Covers `generateResponse` and the tool path. (2) 7c7245fa9: from the moment `context.release()` begins, no entry point may start work on the old context; a send then gets the same "No model loaded" error as with no model. (3) 4f1ea02ae: every path that builds model input (plain, tool, capped-token) drops image attachments whose file is gone.

- [ ] **Step 1:** Port the upstream tests for (1); add one for the tool path. Run. Expected: FAIL (completion runs to the end).
- [ ] **Step 2:** Implement (1). Run. Expected: PASS. Commit: `fix(chat): Stop pressed before the reply starts now stops it`.
- [ ] **Step 3:** Port the 7c7245fa9 test (a send during `awaitMemoryReclaim` is refused and never reaches the released context). Run: FAIL. Implement: PASS. Commit: `fix(engine): a model being unloaded can no longer be used`.
- [ ] **Step 4:** Port the 4f1ea02ae test for the tool path and add the capped-token path. Run: FAIL. Implement: PASS. Commit: `fix(engine): a photo whose file is gone no longer fails tool turns`.

### Task 6: Context bounds, memory wording, NPU fallback

**Files:** Modify `src/services/llmHelpers.ts` (496 lines: move, do not squash), `src/services/contextCompaction.ts`, `src/services/llm.ts`, `src/services/llmToolGeneration.ts`, `src/services/llmSafetyChecks.ts`, `src/components/GenerationSettingsModal/TextGenerationSection.tsx`, `src/screens/ModelSettingsScreen/TextGenerationSection.tsx`. Test: `__tests__/unit/services/llmHelpers.test.ts`, `__tests__/integration/settings/maxTokensBound.rendered.test.tsx`, `__tests__/integration/memory/memoryRefusalCopyMatchesVerdict.rendered.test.tsx`.

**Decisions:** three commits. (1) 58581c7c8 and 420f81be4: `n_predict` never takes the space the prompt needs; both Max Tokens sliders have the same maximum, derived from the context length by one shared function; a saved value above it is shown and used at the maximum, and the saved value itself is not rewritten. (2) 855f6de3b: the refusal quotes `requiredMB`, the number the check compares. (3) b7312ff71: an NPU (HTP) init that fails tries the GPU before the CPU.

- [ ] **Step 1:** Unit tests for the clamp: context 2048 and Max Tokens 8192 gives `n_predict` below 2048 and leaves prompt space by upstream's rule; context 4096 and Max Tokens 512 gives 512. Rendered: with context 2048 and a saved Max Tokens of 8192, both screens open and show the bounded value. Run: FAIL. Implement: PASS. Commit: `fix(settings): Max Tokens can no longer crowd out the prompt`.
- [ ] **Step 2:** Port the 855f6de3b rendered test. FAIL, implement, PASS. Commit: `fix(memory): the Insufficient Memory sheet quotes the number it checks`.
- [ ] **Step 3:** Unit test: HTP init rejects, GPU init resolves: the GPU context is used and CPU is never tried; HTP and GPU reject: CPU is used. FAIL, implement, PASS. Commit: `fix(engine): when the NPU fails, try the GPU before the CPU`.

### Task 7: Remote Stop, credits message, web search

**Files:** Create `src/utils/abortSignal.ts`. Modify `src/services/httpClient.ts`, `src/services/modelFailureReasons.ts`, `src/services/tools/handlers.ts`. Test: `__tests__/integration/remote/stopBeforeSend.rendered.test.tsx`, `__tests__/unit/screens/modelReadiness.test.ts`, `__tests__/unit/services/tools/handlers.webSearch.test.ts`.

**Decisions:** three commits. (1) d88a16f47 without `remoteMediaRuntime`. (2) 6efbe1948. (3) 8707dc713, 9022536d5, c1c613413: an HTTP 4xx or 5xx search page is a failed search, reported to the model as a failure with the status, never as no results; `&amp;lt;` decodes to `&lt;`. Keep the existing tool-result text style.

- [ ] **Step 1:** (1) test: Stop before the request is sent means no request leaves (`XMLHttpRequest.send` not called). FAIL, implement, PASS. Commit: `fix(remote): Stop before a request goes out means it is never sent`.
- [ ] **Step 2:** (2) test: `Insufficient credits` and `insufficient_quota` are not `insufficient-memory`; `Insufficient memory`, `out of memory`, `OOM` still are. FAIL, implement, PASS. Commit: `fix(remote): insufficient credits is not a memory problem`.
- [ ] **Step 3:** (3) tests: status 429 and 503 give a failure naming the status; status 200 with no results still says none were found; entity cases `&amp;lt;`, `&amp;amp;`, `&lt;b&gt;`, `&#39;`. FAIL, implement, PASS. Commit: `fix(tools): a refused web search is reported as a failure`.

### Task 8: Switching image models stops when the first will not unload

**Files:** Modify `src/services/activeModelService/loaders.ts`. Test: `__tests__/unit/services/activeModelService.loaders.branches.test.ts`.

- [ ] **Step 1:** Port the 2b1a7080c test: `unloadModel` resolves false, so the second model is not loaded, the first stays loaded and selected, and the error is raised. FAIL, implement, PASS. Commit: `fix(image): a model that will not unload is not covered by a second one`.

### Task 9: Faster tab switches

**Files:** Modify `src/hooks/useFocusTrigger.ts`, `src/navigation/AppNavigator.tsx`. Test: `__tests__/rntl/hooks/useFocusTrigger.test.tsx` (or the existing file for it).

**Decisions:** port 23da1615f for the hook only and ecfb4b853. The stagger plays on the first visit and not on later ones (upstream's reason: a tab looked half-empty for a second on each return). Under reduced motion the tab animation behaviour stays as it is today.

- [ ] **Step 1:** Test: a probe component using the hook renders once after mount when the tab is left and re-entered (no re-render on blur or on the second focus), and the trigger is 1 from the first focus on. Run: FAIL. Implement: PASS. Existing screens' tests that rely on the replay are updated only if they assert the replay itself. Commit: `perf(tabs): switching tabs no longer redraws whole screens`.
- [ ] **Step 2:** Add `TAB_FADE` (`duration: 80`, `Easing.out(Easing.quad)`) as `transitionSpec`. Run the tab bar suites. Commit: `perf(tabs): a shorter fade between tabs`.

---

## Lane C: Android, voice, model files, lists, scroll (worktree `upstream-fixes-c`, branch `fix/upstream-0125-c`)

### Task 10: Android downloads and LiteRT fallback (Kotlin)

**Files:** Modify `android/app/src/main/java/com/bth0mp/fieldkit/download/WorkerDownload.kt`, `DownloadUiState.kt`, `DownloadManagerModule.kt` (same folder), `android/app/src/main/java/com/bth0mp/fieldkit/litert/LiteRTModule.kt`. Test: `android/app/src/test/java/com/bth0mp/fieldkit/download/DownloadReasonTest.kt`, `DownloadManagerModuleTest.kt`, `android/app/src/test/java/com/bth0mp/fieldkit/litert/LiteRTBackendFallbackTest.kt`.

**Decisions:** three commits. (1) 433285033, 1c0ba2ae9, 5ac53787c, 9b45bab31: a cut transfer resumes in place, at most 20 cuts in one run, then WorkManager's bounded retry; a full disk while writing is `disk_full`; a resume that gets 200 instead of 206 restarts the file from zero; Cancel still deletes the partial file and is never retried; checksum and size checks still run on the finished file. (2) 122a35ae9: no file access on the main dispatcher in start and move. (3) c6052f5c0: one GPU attempt, then CPU.

- [ ] **Step 1:** Map a free drive letter with `subst` to the worktree and confirm `./gradlew :app:testDebugUnitTest --tests '*DownloadManagerModuleTest*' -x :react-native-audio-api:downloadPrebuiltBinaries` runs on the unchanged code. If the native build blocks it, copy the react-native-audio-api prebuilt folders from the main checkout's `node_modules` and retry; report if it still cannot run.
- [ ] **Step 2:** Port `DownloadReasonTest` and add a test for the 200-after-cut rule against the smallest testable function (extract one if needed). FAIL, implement (1), PASS. Commit: `fix(downloads): a cut download resumes instead of failing`.
- [ ] **Step 3:** Port the 122a35ae9 test. FAIL, implement, PASS. Commit: `fix(downloads): starting or moving a download no longer blocks the app`.
- [ ] **Step 4:** Port `LiteRTBackendFallbackTest`. FAIL, implement, PASS. Commit: `fix(litert): a failing GPU falls back to the CPU after one try`.
- [ ] **Step 5:** Remove the `subst` mapping and delete `android/build/generated/autolinking/` in the worktree.

### Task 11: Transcription downloads and dictation

**Files:** Modify `src/services/whisperService.ts`, `src/components/ChatInput/Voice.ts`. Test: `__tests__/unit/services/transcriptionDownloads.test.ts`, `__tests__/unit/services/whisperService.test.ts`, `__tests__/rntl/components/ChatInput.test.tsx`.

**Decisions:** three commits. (1) 058c01bec, redone in `whisperService.downloadModel`: a failure keeps the row as failed with Retry; a user cancel still removes it; a stale download never deletes the file of a newer one. (2) 1457ebd1b and 56ea44caa: a transcript reaches only the chat it was spoken in, checked again after transcription; a dictation for another chat is dropped. (3) 75ce5945a: a finishing dictation never clears the state of the next.

- [ ] **Step 1:** (1) tests: failure leaves a failed row the Download Manager shows with Retry; cancel removes it; Retry works (no "already exists" refusal). FAIL, implement, PASS. Commit: `fix(voice): a failed voice model download stays listed with Retry`.
- [ ] **Step 2:** (2) tests: record in chat 1, switch to chat 2 before the transcript arrives: chat 2's box stays empty and nothing is sent, for both direct and realtime recording; staying in chat 1 still works. FAIL, implement, PASS. Commit: `fix(voice): dictation stays in the chat it was spoken in`.
- [ ] **Step 3:** (3) test ported. FAIL, implement, PASS. Commit: `fix(voice): a finishing dictation no longer stops the next one`.

### Task 12: Model files

**Files:** Create `src/utils/modelFileKind.ts`. Modify `src/services/modelDownloadService/providers/imageProvider.ts`, `src/screens/DownloadManagerScreen/useDownloadManager.ts`, `src/services/modelManager/scan.ts`, `src/services/modelManager/storage.ts`, `src/services/modelManager/download.ts`, `src/services/modelManager/importLocalModel.ts`, `src/services/mmproj.ts`, `src/services/huggingface.ts`. Test: `__tests__/unit/utils/modelFileKind.test.ts` and the upstream test files named below.

**Interfaces:** Produces `isHelperModelFile(fileName: string): boolean`.

**Decisions:** five commits. (1) 9fe578d23 (tests: `DownloadManagerScreen.test.tsx`): a model the disk will not delete stays listed and says so, with Retry. (2) d2befaafa (`reconcilePartialUnzipG7.test.ts`), using the existing `ensureImageExtractionComplete`. (3) 293d1c6ff (`storageTransientFsG1.test.ts`): a rejected existence check keeps the model; a clean "does not exist" still drops it. (4) 85510b42d, 087d9cd8e, e4380b30e (`visionMmprojFromHF.test.ts`, `parallelMmproj.test.ts`): an already downloaded vision file under the old name must still be found. (5) helper files: `isHelperModelFile` is true for a basename that starts with `mtp-` or `mtp_`, or has `imatrix` or `draft` as a whole token between `-`, `_`, `.`; false for `Qwen3-MTP-Q4_K_M.gguf`, `mmproj-F16.gguf`, `Overdraft-7B-Q4.gguf`. Listing, the sorts' "has a file" rule, the recovery scan and import skip or refuse them; the import message is `This file only helps another model run. It cannot be loaded on its own.`

- [ ] **Step 1 to 5:** one commit per numbered decision, each test first (FAIL, implement, PASS). Subjects: `fix(models): a model that cannot be deleted stays listed`, `fix(image): a half-unpacked image model is not offered`, `fix(models): a storage hiccup no longer drops a model`, `fix(vision): more vision files find their model`, `fix(models): helper files are not offered as models`.

### Task 13: Lists and pop-ups

**Files:** Create `src/constants/listClipping.ts`, `src/hooks/useAlertQueue.ts`, `src/utils/alertState.ts`. Modify `.eslintrc.js`, `src/components/CustomAlert.tsx` (re-export only), `src/screens/ModelsScreen/useModelsScreen.ts`, every file with a `FlatList`, `SectionList` or `VirtualizedList` (`git grep -lE "<(Animated\.)?(FlatList|SectionList|VirtualizedList)\b" -- src`), and `src/screens/ModelsScreen/TextModelsTab.tsx` (two list spreads and the duplicate `CustomAlert` only). Test: `__tests__/integration/app/listClipping.rendered.test.tsx`, `__tests__/unit/utils/alertQueue.test.ts`, `__tests__/integration/downloads/finishedAndRefusedPopupsBothShown.rendered.test.tsx`.

**Decisions:** three commits: 51b3175ef with its ESLint rule; 8ed3d2131; 01139dc2a. After each, run `git merge-tree --write-tree HEAD feat/model-marketplace`; if it reports a conflict in a file you touched, undo that file's edit, exempt it in ESLint with a comment naming the marketplace branch, and report it.

- [ ] **Step 1:** Port the list test. FAIL, implement, PASS. Commit: `fix(lists): scrolling a list on Android can no longer crash`.
- [ ] **Step 2:** Test that a model detail alert appears once. FAIL, implement, PASS. Commit: `fix(models): an alert from a model's page opens once`.
- [ ] **Step 3:** Port the queue tests. FAIL, implement, PASS. Commit: `fix(models): two pop-ups at once are both shown`.

### Task 14: Chats open at the newest message

**Files:** Modify `src/screens/ChatScreen/ChatMessageArea.tsx`, `src/screens/ChatScreen/index.tsx` (scroll effect only). Test: `__tests__/integration/chat/openingChatLandsAtNewest.rendered.test.tsx`.

**Decisions:** hand-port the final v0.0.125 behaviour of the list in `ChatMessageArea.tsx` (opening phase pinned to the end until the content stops growing or the user touches the list; `maintainVisibleContentPosition` only once settled; the user's own new message always scrolls into view; switching chats starts a new opening phase). Port the small scroll helper it uses if it has no private import. Do not port composer, styles or voice changes. Reading earlier messages while a reply streams must not be pulled down.

- [ ] **Step 1:** Port and adapt the upstream test and add: `it('brings your own message into view when you had scrolled up')`, `it('does not pull you down while you read earlier messages and a reply streams')`, `it('opens the second chat at its newest message too')`. FAIL (at least the first and third), implement, PASS. Run the other suites under `__tests__/integration/chat`. Commit: `fix(chat): chats open at the newest message`.
