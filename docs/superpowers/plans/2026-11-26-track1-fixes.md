# Track 1 Fixes (0.6.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine bugs the 2026-11-26 audit found that can hurt people now, for release 0.6.1.

**Architecture:** Each fix is the smallest change in the service that owns the behaviour, plus one rendered integration test that reaches the state through real gestures. One new dependency (`@noble/hashes`, MIT) for the passphrase hash; one new small service for when the app may skip its lock; one new service call for deleting a chat.

**Tech Stack:** React Native 0.83 (Hermes), zustand stores, react-native-keychain, react-native-audio-api, Jest + @testing-library/react-native with the device-boundary harness in `__tests__/harness/`.

**Spec:** the owner approved the Track 1 list on 2026-11-26. The findings, with file and line evidence, are in `.superpowers/sdd/2026-11-26-week-plan/audit-reliability.json` (entries R-01, R-02, R-03, R-05, R-06, R-08 under `new`; Whisper sizes and the missing fetch timeout under `recorded`). This plan is the design: where it decides something, that is the ruling.

## Global Constraints

- One rendered integration test per fix: mount the real screen, reach the state through real gestures, assert what the user sees. Fake only at the device boundary (`__tests__/harness/`, `jest.setup.ts`), never our own modules. Extend a harness fake when a boundary is missing.
- While iterating, run only the task's test file. A heavy rendered suite that times out under load: rerun it alone with `npx jest --runInBand <file>`.
- Before each commit: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run depcruise`, `npm run knip`. All must pass.
- Screens and hooks hold no business logic or authoritative state. Services own state machines, resources and side effects; stores are read-only projections for the UI.
- UI uses theme tokens only (`TYPOGRAPHY`, `COLORS` via `useTheme`, `SPACING`); font weights at or below 400; Feather icons; no emoji in UI text.
- No GPL, AGPL or LGPL dependencies. After adding a dependency run `node scripts/gen-notices.js` and commit the regenerated `src/generated/thirdPartyNotices.json`.
- No earlier project names in any new code, comment, commit message or doc (the pre-push own-name guard enforces this). Internal ids (keychain services, storage keys) stay as they are.
- Search `src/components/`, hooks and services for an existing piece before writing a new one.
- Commit each green step separately, with a per-concern message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Copy is plain and short, in sentence case.

## Review Focus

1. A dialog or sheet (an RN `Modal`) already open when the app locks must end up under the lock, not over it. Task 3 renders the lock in its own `Modal`, presented after the open one. RNTL cannot see stacking, so this gets checked by hand on the emulator in the final verification.
2. A lock saved by an earlier version under the earlier Keychain service (`EARLIER_AUTH_SERVICE`) must still unlock with its passphrase and move to the new format under the current service. Task 2 test (b) seeds it there.
3. The launch sweep of recordings must not delete anything while the chats could not be read, or before they are loaded. A voice note saved in a chat must survive. Task 5 test covers both.
4. Deleting a chat whose image file is already gone must still delete the chat. Task 4 test seeds one image with no file.
5. A turn of the lock off and on in Security settings must not lock the user out: the passphrase they just set unlocks. Task 2 test (a) goes through the real setup screen.

---

### Task 1: The lock fails closed when its saved setting can't be read

The boot reads the Keychain (`authService.hasPassphrase()`) but only locks if the persisted `isEnabled` also says so. When AsyncStorage can't be read, `isEnabled` stays at its default `false` and the app opens with no lock. Ruling: a passphrase in the Keychain means the lock is on. Disabling the lock removes the passphrase first (`SecuritySettingsScreen`), so the two agree except after a failure, and then locking is the safe side.

**Files:**
- Modify: `App.tsx` (`initializeApp`, about lines 255-260 and its dependency list)
- Test: `__tests__/integration/app/lockWhenSettingUnreadable.rendered.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore.getState().setEnabled(true)` (sets `isEnabled` and `isLocked` true), `authService.hasPassphrase()`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test** `opens on the lock screen when the lock setting can't be read`. Use `__tests__/harness/flakyStorage.ts` to make the key `local-llm-auth-storage` fail for good; put a passphrase in the Keychain through the real `authService.setPassphrase('correct horse')`; boot the real app (follow `__tests__/integration/app/settingsSurviveFailedRead.test.ts` and `__tests__/harness/modelsApp.ts` for booting). Assert: the field with placeholder `Enter passphrase` shows, the Home screen does not; typing `correct horse` and pressing unlock shows Home.
- [ ] **Step 2: Run it and see it fail** with Home shown and no passphrase field. `npx jest __tests__/integration/app/lockWhenSettingUnreadable.rendered.test.tsx`
- [ ] **Step 3: Fix `initializeApp`.** Replace `if (hasPassphrase && authEnabled) setLocked(true)` with `if (hasPassphrase) useAuthStore.getState().setEnabled(true)`. Remove `authEnabled` from `initializeApp` and its `useCallback` dependencies, so turning the lock on or off no longer re-runs the whole boot (audit R-04).
- [ ] **Step 4: Run the test and `__tests__/AppLockFailsClosed.test.tsx`; both pass.**
- [ ] **Step 5: Commit** `fix(lock): a saved passphrase locks the app even when the lock setting can't be read`

### Task 2: A real passphrase hash, with saved passphrases moved over at the next unlock

`authService.hashPassphrase` is a Java-style 31-bit string hash, so `"AaAa"` and `"BBBB"` (and about 2 billion other groups) unlock the same lock. Replace it with salted PBKDF2-SHA256 from `@noble/hashes` (MIT, pure JS, no native code).

**Files:**
- Modify: `package.json`, `package-lock.json` (add `"@noble/hashes": "^1.8.0"`; 1.x ships CommonJS, so Jest needs no transform change; 2.x is ESM only, do not use it)
- Modify: `src/services/authService.ts`
- Modify: `src/generated/thirdPartyNotices.json` (regenerated)
- Test: `__tests__/integration/settings/passphraseHash.rendered.test.tsx`

**Interfaces:**
- Consumes: `pbkdf2` from `@noble/hashes/pbkdf2`, `sha256` from `@noble/hashes/sha2`, `bytesToHex`/`hexToBytes` from `@noble/hashes/utils`.
- Produces: the public `authService` methods keep their signatures and error classes. The stored Keychain password becomes `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>`.

Values (rulings):
- `PBKDF2_ITERATIONS = 32768`, salt 16 bytes, key length 32 bytes. This aims at about half a second on the S24 Ultra's Hermes; the final verification times an unlock on the emulator, and the count can go down to 16384 if it is slow there. Saved records carry their own count, so a later change rehashes at the next unlock.
- The salt comes from `Math.random()` bytes, with a `ponytail:` comment: a salt must be unique, not secret, and Hermes has no `crypto.getRandomValues`.
- A record without the `pbkdf2-sha256$` prefix is the old hash: keep the old algorithm as a private `legacyHash` used only for that comparison. On a match, and when a new-format record's count is below `PBKDF2_ITERATIONS`, call `setPassphrase(passphrase)` to rewrite it; if that rewrite fails, log it and still unlock.
- A record that starts with the prefix but doesn't parse fails verification (returns false), it never unlocks.

- [ ] **Step 1: Write the failing tests.**
  - (a) `a different passphrase with the same old hash no longer unlocks`: turn the lock on through the real Security settings screen and `PassphraseSetupScreen` with `AaAa`; when the lock shows, type `BBBB` → the wrong-passphrase message shows and the lock stays; type `AaAa` → unlocked.
  - (b) `a passphrase saved by an earlier version unlocks once and is moved to the new hash`: seed the Keychain fake under `EARLIER_AUTH_SERVICE` with the old hash of `AaAa` (the test keeps a copy of the old algorithm as a fixture), lock on; unlock with `AaAa` → unlocked, and the Keychain entry under `com.bth0mp.fieldkit.auth` now starts with `pbkdf2-sha256$`; lock again (background the app at the AppState boundary); `BBBB` is rejected.
- [ ] **Step 2: Run them and see (a) fail** (`BBBB` unlocks). `npx jest __tests__/integration/settings/passphraseHash.rendered.test.tsx`
- [ ] **Step 3: Install the dependency** from PowerShell: `npm install @noble/hashes@^1.8.0`.
- [ ] **Step 4: Implement** `private hashPassphrase(passphrase: string, salt: Uint8Array, iterations: number): string` (returns the full record string) and `private legacyHash(passphrase: string): string` in `authService.ts`; `setPassphrase` stores a fresh-salt record; `verifyPassphrase` parses the record, compares, and rewrites as ruled above.
- [ ] **Step 5: Run the tests, plus `__tests__/AppLockFailsClosed.test.tsx`, `__tests__/rntl/screens/LockScreen.test.tsx`, `__tests__/rntl/screens/PassphraseSetupScreen.test.tsx`, `__tests__/rntl/screens/SecuritySettingsScreen.test.tsx`. All pass.**
- [ ] **Step 6: Run `node scripts/gen-notices.js`; check that `@noble/hashes` (MIT) is listed.**
- [ ] **Step 7: Commit** `fix(lock): store the passphrase as salted PBKDF2 and move old ones over at the next unlock`

### Task 3: Locking keeps your place, and the app's own pickers don't lock it

Every background event locks at once, and the locked branch of `App.tsx` replaces the whole navigator. So a file picker, the camera, a permission prompt, the share sheet or a document viewer locks the app, and on return the open chat, the typed draft and the picked file are gone.

Rulings:
- After the app has been shown once in a session, the navigator stays mounted, and the lock is drawn over it in its own full-screen `Modal` (`animationType="none"`, `statusBarTranslucent`, `navigationBarTranslucent`, `onRequestClose` does nothing, so Back cannot close it). A `Modal` is presented above any dialog already open. Before the first unlock of a session, keep today's behaviour: the lock screen alone, so nothing mounts behind it at launch.
- The app skips locking when it opened a system screen itself: a call made right before opening one marks it, and a background event within 3 seconds of that mark doesn't lock. If the user then stays away for more than 5 minutes, the app locks on return. Every other background event locks at once, as today.

**Files:**
- Create: `src/services/appLockService.ts`
- Modify: `App.tsx` (the `useAppState` callbacks and the locked render branch)
- Modify, one `appLockService.openingSystemScreen()` line right before each system screen opens:
  - `src/components/ChatInput/Attachments.tsx` (`launchImageLibrary`, `launchCamera`, `pick`)
  - `src/components/ChatMessage/components/MessageAttachments.tsx` (`viewDocument`)
  - `src/features/guideLibrary/guideLibraryService.ts` (`viewDocument`)
  - `src/screens/KnowledgeBaseScreen.tsx`, `src/screens/ProjectDetailKnowledgeBaseSection.tsx`, `src/screens/ModelsScreen/useModelsScreen.ts`, `src/services/kiwix/kiwixService.ts` (`pick`, `pickDirectory`)
  - `src/services/audioRecorderService.ts`, `src/services/voiceService.ts`, `src/services/whisperService.ts`, `src/services/calendar/calendarService.ts`, `src/screens/ChatScreen/useSaveImage.ts`, `src/screens/GalleryScreen/useGalleryActions.ts` (`PermissionsAndroid.request`)
  - `src/services/conversationShare.ts`, `src/features/checklists/checklistService.ts`, `src/services/tools/emailTool.ts`, `src/components/DebugLogsScreen/index.tsx` (`Share.share`)
  - Re-run `grep -rn "launchImageLibrary\|launchCamera\|pick(\|pickDirectory(\|PermissionsAndroid.request\|Share.share\|viewDocument(" src` and cover any site this list missed. `Linking.openURL` is not a system screen (the user leaves for another app) and is not marked.
- Test: `__tests__/integration/app/lockKeepsPlace.rendered.test.tsx`

**Interfaces:**
- Produces, in `appLockService` (export it the way sibling services are exported):
  - `openingSystemScreen(): void`: marks that the app is about to open a system screen.
  - `leftForeground(now?: number): boolean`: true when the app must lock now. False only within `SYSTEM_SCREEN_START_MS = 3000` of the last mark; it then remembers when it left.
  - `returnedToForeground(now?: number): boolean`: true when the app left for a marked system screen more than `SYSTEM_SCREEN_MAX_AWAY_MS = 5 * 60 * 1000` ago. Clears the mark and the remembered time either way.
- `App.tsx` calls `leftForeground()` in `onBackground` and `returnedToForeground()` in `onForeground`, and calls `setLocked(true)` (and `setLastBackgroundTime`) only when the lock is on and the call returned true.

- [ ] **Step 1: Write the failing tests** (lock on with a passphrase in the Keychain fake; boot the real app and unlock it first):
  - `locking keeps the open chat and its draft`: open a chat, type `half-written` in the composer, fire AppState `background` then `active` at the boundary (`emitAppStateChange` in `__tests__/harness/nativeBoundary.ts`); the passphrase field shows; unlock; the composer still holds `half-written`.
  - `picking a photo doesn't lock the app`: in a chat, tap the attach button and choose a photo; the image-picker fake (device boundary) fires `background`, then `active`, then resolves with one photo. No passphrase field shows, and the photo shows in the composer's attachment preview.
  - `a system screen left open over 5 minutes locks on return`: same as the photo case, with the clock moved on 6 minutes between `background` and `active` (Jest modern fake timers or `jest.spyOn(Date, 'now')`); the passphrase field shows, and after unlocking the chat is still open.
- [ ] **Step 2: Run them and see all three fail.** `npx jest __tests__/integration/app/lockKeepsPlace.rendered.test.tsx`
- [ ] **Step 3: Implement `appLockService` and wire `App.tsx`** as ruled above.
- [ ] **Step 4: Add the `openingSystemScreen()` lines** at every site in the list.
- [ ] **Step 5: Run the new test, `__tests__/AppLockFailsClosed.test.tsx`, `__tests__/App.test.tsx` and the Task 1 and Task 2 tests. All pass.**
- [ ] **Step 6: Commit** in two steps: `fix(lock): the lock covers the app instead of replacing it, so the open chat and draft stay`, then `fix(lock): pickers, permission prompts and the share sheet the app opens don't lock it`

### Task 4: Deleting a chat deletes its images from every screen

Only the Chats list and the chat screen's own delete remove a chat's generated images. Home, a project's chat list and the project page call `useChatStore.deleteConversation` alone, so the images stay on disk and in the Gallery.

**Files:**
- Create: `src/services/chatDeletion.ts`
- Modify: `src/screens/ChatsListScreen.tsx` (`handleDeleteChat`), `src/screens/HomeScreen/hooks/useHomeScreen.ts` (`deleteConversationWithAlert`), `src/screens/ProjectChatsScreen.tsx` (about line 209), `src/screens/ProjectDetailScreen.tsx` (about line 92), `src/screens/ChatScreen/useChatGenerationActions.ts` (the delete at about lines 616-624: keep its stop-streaming and navigation, replace the image, summary and delete lines)
- Test: `__tests__/integration/chats/deleteChatDeletesImages.rendered.test.tsx`

**Interfaces:**
- Produces: `deleteChat(conversationId: string): Promise<void>` in `src/services/chatDeletion.ts`. It removes the chat's images from the gallery store (`useAppStore.getState().removeImagesByConversationId`), deletes each file (`onnxImageGeneratorService.deleteGeneratedImage`; a failure is logged and the rest go on), clears the chat's summary (`contextCompactionService.clearSummary`), then calls `useChatStore.getState().deleteConversation`.
- Every delete dialog says what the Chats list says today: `Delete "<title>"? This will also delete all images generated in this chat.`

- [ ] **Step 1: Write the failing tests.** Seed one chat that has two generated images in the gallery, one with its file at the fs boundary and one whose file is already gone. (a) `deleting from Home removes the chat's images`: on Home, delete the chat through its real menu and confirm; the image file is gone at the fs boundary and the Gallery shows no images. (b) the same from a project's chat list.
- [ ] **Step 2: Run them and see both fail** (the file and the Gallery entry stay). `npx jest __tests__/integration/chats/deleteChatDeletesImages.rendered.test.tsx`
- [ ] **Step 3: Implement `deleteChat` and switch the five call sites to it.**
- [ ] **Step 4: Run the new test and every existing test that names one of the five changed files (`npx jest --findRelatedTests <files>`). All pass.**
- [ ] **Step 5: Commit** `fix(chats): deleting a chat from Home or a project also deletes its images`

### Task 5: Voice recordings are deleted once they're used

Every dictation records a WAV in `audio-input/` (the realtime path records a fallback file too), and nothing deletes them. Only Audio Mode keeps its recording on purpose, as the voice note attached to the message.

Rulings:
- A recording that doesn't become a message attachment is deleted as soon as its transcript is out (or it fails): the chat-mode dictation in `Voice.ts`, an Audio Mode recording whose transcript is not sent, the realtime fallback file in `whisperService`, and every `cancelRecording`.
- At launch, delete each file in the recordings folder that no saved message refers to. Run it only after the chats have loaded from storage successfully; skip it for the session when they couldn't be read. Take the folder from the path the recorder actually writes (check `FileDirectory.Document` in `node_modules/react-native-audio-api` for Android), not from a guess.

**Files:**
- Modify: `src/services/audioRecorderService.ts` (`cancelRecording` deletes its file; add `discardRecording(path: string): Promise<void>` and `deleteUnusedRecordings(keep: Set<string>): Promise<number>`)
- Modify: `src/services/whisperService.ts` (delete the fallback file after `transcribeFile`)
- Modify: `src/components/ChatInput/Voice.ts` (call `discardRecording` where the ruling says)
- Modify: the boot path that runs once chats have loaded (`App.tsx` next to `clearEarlierLeftovers`, or the chat store's hydration hook, whichever lets you know the read succeeded; the chat store's `createHydrationGatedStorage` gate knows)
- Test: `__tests__/integration/voice/recordingsDeleted.rendered.test.tsx`

**Interfaces:**
- Produces: `audioRecorderService.discardRecording(path)` (never throws), `audioRecorderService.deleteUnusedRecordings(keep)` (returns how many it deleted, never throws). `keep` holds every recording path that a saved message refers to (its attachment `uri` and the audio-mode fields on the message; check `src/types/index.ts` around lines 164-240).

- [ ] **Step 1: Write the failing tests.**
  - (a) `a dictation leaves no recording behind`: in chat mode, record and stop through the mic button (the whisper fake returns `hello there`); the composer shows `hello there`, and the recordings folder at the fs boundary is empty.
  - (b) `launch deletes old recordings but keeps voice notes`: seed the recordings folder with one file no message names and one that a saved Audio Mode message names; boot; the first is gone, the second stays.
  - (c) `launch deletes nothing when the chats couldn't be read`: same seed, with the chat storage key failing for good (flakyStorage); boot; both files stay.
- [ ] **Step 2: Run them and see (a) and (b) fail.** `npx jest __tests__/integration/voice/recordingsDeleted.rendered.test.tsx`
- [ ] **Step 3: Implement the deletes and the launch sweep.**
- [ ] **Step 4: Run the new test and `npx jest --findRelatedTests` on the changed files. All pass.**
- [ ] **Step 5: Commit** in two steps: `fix(voice): delete a dictation's recording once it's transcribed`, then `fix(voice): delete leftover recordings at launch, keeping voice notes`

### Task 6: "Free memory & Retry" keeps the remote model

The memory retry on an image failure calls `activeModelService.ejectAll()`, which also disconnects the remote model the user chose. A remote model holds no phone memory, so dropping it frees nothing.

**Files:**
- Modify: `src/services/activeModelService/index.ts` (`ejectAll`)
- Modify: `src/services/imageGenerationService.ts` (the `onRetry` in `_fail`, about line 114)
- Test: `__tests__/integration/image/memoryRetryKeepsRemote.rendered.test.tsx`

**Interfaces:**
- Produces: `ejectAll(opts?: { keepRemote?: boolean }): Promise<{ count: number }>`; with `keepRemote: true` it skips `remoteServerManager.clearActiveRemoteModel()`. Every existing caller keeps today's behaviour (no argument).

- [ ] **Step 1: Write the failing test** `Free memory & Retry keeps the remote model`: chat through a remote text model (`__tests__/harness/remoteHarness.ts`), ask for an image with a local image model whose load fails for memory at the boundary, tap `Free memory & Retry`; the chat still names the remote model, and the next text message reaches the remote server.
- [ ] **Step 2: Run it and see it fail.** `npx jest __tests__/integration/image/memoryRetryKeepsRemote.rendered.test.tsx`
- [ ] **Step 3: Add the option and pass `{ keepRemote: true }` from the retry.**
- [ ] **Step 4: Run it and `npx jest --findRelatedTests` on the two files. All pass.**
- [ ] **Step 5: Commit** `fix(image): Free memory & Retry no longer drops the remote model`

### Task 7: Whisper Large v3 and Turbo show their real sizes

`WHISPER_MODELS` sizes are MiB (`whisperService` multiplies by 1024 * 1024). Hugging Face lists `ggml-large-v3-turbo.bin` at 1,624,555,275 bytes (1549 MiB) and `ggml-large-v3.bin` at 3,095,033,483 bytes (2952 MiB); the catalog says 809 and 1550. whisper.cpp's README gives about 3.9 GB of memory for large.

**Files:**
- Modify: `src/services/whisperModels.ts` (lines 23-24)
- Test: `__tests__/integration/models/whisperSizes.rendered.test.tsx`

Values: `large-v3-turbo` size `1549`; `large-v3` size `2952`, `ramGB: 4`, description `Best quality, 99 languages, ~4 GB RAM`.

- [ ] **Step 1: Write the failing test** `Large v3 and Turbo show their real download sizes`: open Models through the real tab bar, go to the Transcription tab; the Large v3 card shows the size the card's formatter makes of 2952 MiB, the Turbo card that of 1549 MiB (read the formatter to get the exact text).
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Change the values.**
- [ ] **Step 4: Run it and `npx jest --findRelatedTests src/services/whisperModels.ts`. All pass.**
- [ ] **Step 5: Commit** `fix(models): Whisper Large v3 and Turbo show their real sizes`

### Task 8: Hugging Face requests time out

`src/services/huggingface.ts` (`fetchJson` and the tree fetch at about line 117) and `src/services/huggingFaceModelBrowser.ts` (`fetchRepoFiles`) call `fetch` with no time limit, so one hung request keeps a list (New releases, for one) on its spinner for good.

**Files:**
- Modify: `src/services/huggingface.ts`, `src/services/huggingFaceModelBrowser.ts`
- Test: `__tests__/integration/models/hfRequestTimesOut.rendered.test.tsx`

Ruling: every Hugging Face API request in these two files gives up after `HF_REQUEST_TIMEOUT_MS = 20000`. Use `fetchWithTimeout` from `src/services/httpClient.ts` if its errors suit the callers (it reports any abort as `Request cancelled`, and a bad status as `HTTP <code>: <body>`, where `fetchJson` now says `API error: <code>`); check what each caller does with the error, and keep what the user sees for a failed request the same. Otherwise add an `AbortController` timeout in the one shared fetch helper of each file.

- [ ] **Step 1: Write the failing test** `New releases stops waiting after 20 seconds`: the Hugging Face fake (`__tests__/harness/hfApiFake.ts`, extend it with a request that never answers) hangs the search; open Models, choose the `New releases` sort, advance the clock 20 seconds; the screen shows what it shows today for a failed request, and no spinner.
- [ ] **Step 2: Run it and see it fail** (the spinner stays).
- [ ] **Step 3: Add the timeout.**
- [ ] **Step 4: Run it and `npx jest --findRelatedTests` on the two files. All pass.**
- [ ] **Step 5: Commit** `fix(models): Hugging Face requests give up after 20 seconds`

### Task 9: The Privacy card tells the truth

Settings says "All your data stays on this device. No conversations, prompts, or personal information is ever sent to any server." Remote servers get the chat, and web search and the read-a-page tool send the query or address out.

**Files:**
- Modify: `src/screens/SettingsScreen.tsx` (about lines 241-252)
- Test: `__tests__/integration/settings/privacyCard.rendered.test.tsx`

Copy (exact): title `Privacy`; body `Your chats, files and recordings stay on this phone. Text leaves it only when you chat through a remote server, or when the assistant searches the web or opens a web page for you.`

Also run `grep -rni "never sent\|stays on this device\|stays on your device\|never leaves\|no data leaves" src` and list any other screen that makes the same claim in the task report (do not change them in this task).

- [ ] **Step 1: Write the failing test** `the Privacy card names what leaves the phone`: open Settings through the real tab bar; the new title and body show, and the old sentence does not.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Change the copy.**
- [ ] **Step 4: Run it and the existing Settings tests (`npx jest --findRelatedTests src/screens/SettingsScreen.tsx`). All pass.**
- [ ] **Step 5: Commit** `fix(settings): the Privacy card says what leaves the phone`
