# Voice Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fieldkit speaks assistant replies aloud with the phone's offline system voices: on demand from the action menu or a Speak button, and optionally sentence by sentence while a reply streams.

**Architecture:** A first-party Kotlin module `FieldkitSpeech` wraps Android `TextToSpeech`. A `SpeechEngine` interface in `src/services/speech/` hides it, and `speechService` owns readiness, the state machine, the queue and the offline-voice filter. `speechStore` is a thin projection written only by the service. A feature bootstrap in `src/features/` registers the existing core voice hooks and slots at app start, independent of Off Grid's license-gated `loadProFeatures`.

**Tech Stack:** React Native 0.83.1, TypeScript, zustand 5, Kotlin 2.2 (legacy bridge module under `newArchEnabled=true`), Jest + RNTL rendered tests with `__tests__/harness/`, Robolectric 4.13.

**Spec:** `docs/superpowers/specs/2026-11-03-pro-features-design.md` (section 1, build-order slices 1-2, Owner decisions 1-2).

## Global Constraints

- No new npm dependencies; no GPL/AGPL/LGPL code at runtime. Nothing is copied from Off Grid's Pro module or its history.
- Only voices with `networkRequired == false` and `notInstalled == false` are ever selected or spoken.
- NativeModules key `FieldkitSpeech`. Events `FieldkitSpeech_start`, `FieldkitSpeech_done`, `FieldkitSpeech_stopped`, `FieldkitSpeech_error`. iOS parity: module absent means unavailable (no Swift).
- UI: theme tokens only (`TYPOGRAPHY`, `SPACING` from `src/constants`, colors from `useTheme`), font weight <= 400, Feather icons, no emoji, no Off Grid/Wednesday text. ESLint: max-params 3 (use an options object), max-lines 500, complexity 20.
- Tests go in `__tests__/integration/voice/` (never paths containing `tts`, `/audio/`, `/engine/`, `/android/`). Device fakes and registries are read after `setupChatScreen` / `installNativeBoundary`, because both call `jest.resetModules()`.
- Device rule: only the debug build `com.bth0mp.fieldkit.dev` is installed on the owner's phone. Never install a release APK, and never uninstall, clear or overwrite `com.bth0mp.fieldkit`. If an install fails with `INSTALL_FAILED_*`, STOP and ask the owner.
- Before every commit: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run depcruise`, `npm run knip`, the task's tests, and `npx jest --findRelatedTests <changed src files>` (what the pre-push hook runs). Pushes go through the hook, never `--no-verify`.

## Review Focus

1. Reasoning, tool-call markup, markdown or a code block in a reply is never spoken, on demand or while streaming (Task 3 `speaks only the answer`, Task 6 `no code or reasoning mid-stream`).
2. The user presses Stop or sends a new message while a reply is being spoken: speech stops at once and that reply never resumes (Task 4 `stop during init`, Task 6 `stop mid-stream` and `new send mid-stream`).
3. The phone has only network voices, or voices without their data: Fieldkit never speaks with them (Task 3 `no offline voice`), and offers "Install voices" (Task 5 `offers install when no offline voice`).
4. A reply longer than the engine's max input length is split into chunks under the limit and every chunk is spoken in order (Task 3 `long reply chunks`).
5. Repeated sentences in one reply are all spoken, and utterance ids never collide (Task 3 `repeated sentence`).

---

### Task 1: Local Android toolchain

No repo code changes except the gitignored `android/local.properties`.

- [ ] **Step 1: Get the owner's approval for JDK 17**

React Native's Gradle plugin pins `jvmToolchain(17)` (`@react-native/gradle-plugin` `JdkConfiguratorUtils.kt` and `react-native-gradle-plugin/build.gradle.kts`), and `android/settings.gradle` has no toolchain resolver, so the build needs an installed JDK 17. Only JDK 21 is installed. Ask the owner in chat to approve installing Eclipse Temurin JDK 17 with winget, next to JDK 21. Approving means accepting Temurin's license (GPLv2 with Classpath Exception) and the winget source agreement. It is a build tool and never ships in the APK. Record the approval in the spec under Owner decision 1.
Expected: an explicit yes. If the owner declines, STOP: the Kotlin slices and the pre-push Gradle gates stay blocked, and no other JDK download (for example Gradle auto-provisioning) is substituted.

- [ ] **Step 2: Install JDK 17**

Either the owner runs `winget install --id EclipseAdoptium.Temurin.17.JDK -e` in their own terminal, or (only because the owner approved the agreements in chat) the builder runs it with `--accept-package-agreements --accept-source-agreements --silent`.
Expected: `C:\Program Files\Eclipse Adoptium\jdk-17*` exists. `JAVA_HOME` stays on 21; Gradle finds 17 through the registry. Fallback if it is not detected later: `org.gradle.java.installations.paths=C:/Program Files/Eclipse Adoptium/jdk-17...` in `%USERPROFILE%\.gradle\gradle.properties`.

- [ ] **Step 3: Bootstrap the SDK command-line tools**

Download `https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip` into a new empty scratchpad folder. Check that its SHA-1 is `57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d`, then unpack it so `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat` exists.
Expected: `sdkmanager.bat --version` prints `23.0` or later.

- [ ] **Step 4: Install SDK packages**

Run (PowerShell): `& "$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" --install "platforms;android-36" "ndk;27.1.12297006" "cmake;3.22.1"`
Expected: all three install under the already accepted `android-sdk-license`. If sdkmanager asks to accept any license, STOP and ask the owner; never pipe `yes`.

- [ ] **Step 5: Point Gradle and adb at the SDK**

Set the User env var `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`, append `%LOCALAPPDATA%\Android\Sdk\platform-tools` to the User `Path`, and write `android/local.properties` containing `sdk.dir=C:/Users/bth0m/AppData/Local/Android/Sdk`.
Expected: `git status` does not list `local.properties` (it is gitignored).

- [ ] **Step 6: Prove the pre-push Gradle gates on unchanged code**

Run from Git Bash in the real path `D:/Claude Code/Off Grid AI`, using the hook's own commands: `cd android && ./gradlew compileDebugKotlin --quiet && ./gradlew :app:lintDebug --quiet && cd .. && npm run test:android`
Expected: all three succeed, including the 5 existing Kotlin unit tests. Settings-time autolinking spawns `cmd /c npx`, which the tool sandbox has blocked before, so run with the sandbox disabled if it fails with `cmd.exe ENOENT`. If a gate fails on code this plan did not write, STOP and report to the owner; do not fix it inside a feature task.

- [ ] **Step 7: Prove a debug build and USB install**

Run (PowerShell):
1. `subst F: "D:\Claude Code\Off Grid AI"`
2. `cd F:\android; .\gradlew.bat assembleDebug -PreactNativeArchitectures=arm64-v8a`
3. With the S24 Ultra connected and USB debugging on: `adb devices`, then `adb install -r F:\android\app\build\outputs\apk\debug\app-debug.apk`, then `adb reverse tcp:8081 tcp:8081`.
4. Run `npm start` from `F:\` in a separate PowerShell window and leave it running.
5. `adb shell monkey -p com.bth0mp.fieldkit.dev -c android.intent.category.LAUNCHER 1`

Expected: "Fieldkit AI (Debug)" launches next to the owner's "Fieldkit AI" and loads JS from Metro. The space-free `F:` drive avoids CMake/Ninja path-length and space failures. Debug builds sign with `android/app/debug.keystore`. Re-run `adb reverse` after any USB reconnect.

---

### Task 2: `FieldkitSpeech` native module

**Files:**
- Create: `android/app/src/main/java/ai/offgridmobile/speech/FieldkitSpeechModule.kt`, `FieldkitSpeechPackage.kt`
- Modify: `android/app/src/main/java/ai/offgridmobile/MainApplication.kt` (`add(FieldkitSpeechPackage())` inside `PackageList(this).packages.apply { }`)
- Modify: `android/app/src/main/AndroidManifest.xml` (add `<queries><intent><action android:name="android.intent.action.TTS_SERVICE"/></intent></queries>` after the last `<uses-permission>`, before `<application>`)
- Test: `android/app/src/test/java/ai/offgridmobile/speech/FieldkitSpeechModuleTest.kt`

**Interfaces:**
- Produces (JS-visible, `getName() = "FieldkitSpeech"`; every method takes a trailing `Promise`):
  - `init(enginePackage: String?)` resolves `{ bound: Boolean, enginePackage: String?, maxInputLength: Double }`
  - `getVoices()` resolves `[{ id, name, language, networkRequired: Boolean, notInstalled: Boolean, quality: Double }]`, unfiltered
  - `setVoice(id: String)` resolves `Boolean`
  - `speak(text: String, utteranceId: String, rate: Double, pitch: Double)` resolves when queued (`QUEUE_ADD`), and rejects `NOT_OFFLINE` when the current voice is not usable offline
  - `stop()` and `openVoiceInstaller()` (launches `TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA`)
  - `addListener(eventName: String)` and `removeListeners(count: Int)`
  - Events, using the guarded `DownloadEventBridge.emit` pattern: `FieldkitSpeech_start {utteranceId}`, `FieldkitSpeech_done {utteranceId}`, `FieldkitSpeech_stopped {utteranceId, interrupted}`, `FieldkitSpeech_error {utteranceId, code}`
  - Companion: `internal fun isUsableOffline(networkRequired: Boolean, features: Set<String>?): Boolean`, `internal fun isNotInstalled(features: Set<String>?): Boolean` (used by the `getVoices` mapping) and `internal fun pickEngine(requested: String?, installed: List<String>, defaultEngine: String?): String?`
- Spec deviation: `getStatus()` is replaced by `init()`'s result plus the filtered voice count, and `getEngines()` is deferred until an engine picker exists.

Behavior:
- `init` binds the requested engine if installed, else the default. If binding Samsung `com.samsung.SMT` fails, retry once with `com.google.android.tts` when it is installed. After binding finishes (inside `OnInitListener`, after any retry), log `Log.i("FieldkitSpeech", "bound=$bound engine=$pkg maxInput=$max fallback=$usedFallback")`; log `Log.w` on failure.
- `setVoice` never calls `setLanguage` afterwards.
- Audio focus: on API >= 26, use `AudioFocusRequest.Builder(AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)` with `USAGE_ASSISTANT`/`CONTENT_TYPE_SPEECH` attributes (also passed to `setAudioAttributes`) and `abandonAudioFocusRequest`. Below API 26, use the deprecated `requestAudioFocus(listener, STREAM_MUSIC, AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)`. Track queued utterance ids in a set: request focus on the first `onStart`, and abandon it when the set empties or on `stop`.
- `invalidate()` shuts the engine down.

- [ ] **Step 1: Write the failing Robolectric test**

```kotlin
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class FieldkitSpeechModuleTest {
  @Test fun `offline only when no network and installed`() {
    assertTrue(FieldkitSpeechModule.isUsableOffline(false, setOf()))
    assertFalse(FieldkitSpeechModule.isUsableOffline(true, setOf()))
    assertFalse(FieldkitSpeechModule.isUsableOffline(false, setOf(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)))
    assertTrue(FieldkitSpeechModule.isUsableOffline(false, null))
    assertTrue(FieldkitSpeechModule.isNotInstalled(setOf(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)))
    assertFalse(FieldkitSpeechModule.isNotInstalled(null))
  }
  @Test fun `falls back to Google when Samsung requested but not installed`() {
    assertEquals("com.google.android.tts",
      FieldkitSpeechModule.pickEngine("com.samsung.SMT", listOf("com.google.android.tts"), "com.google.android.tts"))
    assertNull(FieldkitSpeechModule.pickEngine(null, emptyList(), null))
  }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run (Git Bash): `cd android && ./gradlew :app:testDebugUnitTest --tests "ai.offgridmobile.speech.*"`
Expected: FAIL, unresolved reference `FieldkitSpeechModule`.

- [ ] **Step 3: Implement the module, the package, the registration and the `<queries>` entry** as specified above.

- [ ] **Step 4: Run the gates**

Run (Git Bash): `cd android && ./gradlew :app:testDebugUnitTest --tests "ai.offgridmobile.speech.*" && ./gradlew compileDebugKotlin --quiet && ./gradlew :app:lintDebug --quiet`
Expected: PASS, with no new lint issues against `lint-baseline.xml` (in particular, no `NewApi`).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/ai/offgridmobile/speech android/app/src/test/java/ai/offgridmobile/speech android/app/src/main/java/ai/offgridmobile/MainApplication.kt android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): FieldkitSpeech module over system TextToSpeech"
```

---

### Task 3: Speech service, feature bootstrap and Speak from the action menu

**Files:**
- Create: `src/services/speech/speechTypes.ts`, `systemSpeechEngine.ts`, `speechService.ts`
- Create: `src/utils/speechText.ts`
- Create: `src/stores/speechStore.ts` (export it from `src/stores/index.ts`)
- Create: `src/features/index.ts`, `src/features/voice/registerVoice.ts`
- Modify: `src/utils/messageContent.ts`. In `stripMarkdownForSpeech`, make fenced-block removal (`/```[\s\S]*?```/g`) the FIRST replace, then strip an unclosed trailing fence (`/```[\s\S]*$/`). Today inline-code removal runs first and leaves code-block bodies in the spoken text.
- Modify: `App.tsx`. Add `activateFieldkitFeatures();` as the first statement inside `initializeApp`'s `try`, before the first `await`.
- Modify: `__tests__/harness/nativeBoundary.ts`:
  - `speech?: SpeechFakeOptions` in `InstallOpts` and `speech?: SpeechFake` in `NativeBoundary`
  - `makeSpeechFake`, installed as `RN.NativeModules.FieldkitSpeech`
  - `emitAppStateChange(state: string)` on `NativeBoundary` (`appState.handle.emit('change', state)`)
- Modify: `__tests__/harness/chatHarness.ts` (`speech?: SpeechFakeOptions` passed through to `installNativeBoundary`)
- Modify: `__tests__/utils/testHelpers.ts` (reset `useSpeechStore` in `resetStores`)
- Test: `__tests__/integration/voice/speakFromActionMenu.rendered.test.tsx`

**Interfaces:**
- Consumes: the Task 2 native contract.
- Produces:
  - `speechTypes.ts`:
    - `SpeechVoice { id: string; name: string; language: string; networkRequired: boolean; notInstalled: boolean; quality: number }`
    - `SpeechPhase = 'idle' | 'initializing' | 'ready' | 'speaking' | 'unavailable' | 'error'`
    - `SpeechEngineEvent { type: 'start' | 'done' | 'stopped' | 'error'; utteranceId: string; code?: number }`
    - `SpeechEngine { readonly id: string; isPresent(): boolean; init(): Promise<{ bound: boolean; enginePackage: string | null; maxInputLength: number }>; getVoices(): Promise<SpeechVoice[]>; setVoice(id: string): Promise<boolean>; speak(req: { text: string; utteranceId: string; rate: number; pitch: number }): Promise<void>; stop(): Promise<void>; openVoiceInstaller(): Promise<void>; onEvent(listener: (e: SpeechEngineEvent) => void): () => void }`
  - `systemSpeechEngine: SpeechEngine`. When the module is absent, `isPresent()` is false and every method resolves as a no-op. It subscribes through `NativeEventEmitter.addListener` only, created after a presence check.
  - `speechText.ts`:
    - `splitIntoSentences(text: string): string[]` splits after `.`, `!` or `?` followed by whitespace, and at newlines. Pieces are trimmed, empty pieces dropped, and a final piece without end punctuation is kept.
    - `chunkForEngine(input: { sentences: string[]; maxLen: number }): string[]` never merges sentences. A sentence longer than `maxLen` is cut at the last whitespace at or before `maxLen` (hard-cut if there is none), and the rest is processed the same way. Chunks are trimmed, non-empty and in order.
  - `speechService` (a class singleton; every hook wraps it in an arrow function): `canSpeak(): boolean`, `speakMessage(input: { text: string; messageId: string }): Promise<void>`, `stop(): void`, `refresh(): Promise<void>`, `selectVoice(id: string): Promise<void>`, `previewVoice(): Promise<void>`, `openVoiceInstaller(): Promise<void>`, `setRate(n: number): void`, `setPitch(n: number): void`, `setAutoSpeak(on: boolean): void`
  - `useSpeechStore` has one setter, `set(partial)`, used only by `speechService`:
    - persisted, key `local-llm-speech-storage`: `selectedVoiceId: string | null` (null), `rate: number` (1), `pitch: number` (1), `autoSpeak: boolean` (false)
    - transient: `available: boolean`, `phase: SpeechPhase` ('idle'), `voices: SpeechVoice[]` (offline and installed only), `speakingMessageId: string | null`, `enginePackage: string | null`, `needsVoiceInstall: boolean`
  - `activateFieldkitFeatures(): void` is idempotent (module-level flag) and catches and logs `[FEATURES]` errors.
  - `registerVoiceFeature(): void` registers arrow wrappers: `HOOKS.audioCanSpeak` -> `() => speechService.canSpeak()`, `HOOKS.audioSpeak` -> `(text, messageId) => speechService.speakMessage({ text, messageId })`, and `HOOKS.audioStop` and `HOOKS.audioOnAppBackground` -> `() => speechService.stop()`.
  - Harness `SpeechFakeOptions { voices?: SpeechVoice[]; maxInputLength?: number; bound?: boolean; enginePackage?: string }`:
    - default voices: `{ id: 'en-us-offline', name: 'English US', language: 'en-US', networkRequired: false, notInstalled: false, quality: 400 }` and `{ id: 'en-us-network', name: 'English US (network)', language: 'en-US', networkRequired: true, notInstalled: false, quality: 500 }`
    - other defaults: `maxInputLength` 4000, `bound` true, `enginePackage` 'com.google.android.tts'
  - Harness `SpeechFake`:
    - `module: Record<string, jest.Mock>`, `calls: { speak: { text: string; utteranceId: string }[]; setVoice: string[] }` and `emit(event: string, payload: object): void` (the shared `handle.emit`)
    - `holdNextInit(): void` and `releaseInit(): void`, the same shape as the existing `holdNextLoad`/`releaseLoad`
    - the fake's `speak` rejects unless `init` has resolved, as an unbound engine would

Rules for `speechService` (log prefix `[SPEECH-SM]`):
1. `canSpeak()` is `engine.isPresent() && phase !== 'unavailable'`, read from cached state and synchronous.
2. `ensureReady()` is a memoized promise: init, then `getVoices`, then the offline filter (`!networkRequired && !notInstalled`), then `setVoice`, and it stores `maxInputLength`.
   - The voice is `selectedVoiceId` if it is still in the filtered list, else the highest `quality`.
   - `bound: false` -> `phase 'unavailable'`, `needsVoiceInstall: false`.
   - No offline voice -> `phase 'unavailable'`, `needsVoiceInstall: true`.
   - Otherwise -> `ready`.
   - The memo is cleared on 'unavailable', on 'error' and on rejection.
3. `refresh()` is never memoized. If the engine is absent, it sets `available: false` and returns. Otherwise it sets `available: true`, re-runs init and the voice filter, and sets `voices`, `enginePackage`, `phase` and `needsVoiceInstall`. While `phase === 'unavailable'`, the service calls `refresh()` again when AppState becomes 'active' (returning from the voice installer).
4. `stop()` is synchronous and always runs. It increments `generation`, clears the pending queue, marks any streaming session stopped, clears `speakingMessageId`, and calls `engine.stop()` immediately. It is idempotent, so tests assert deltas.
5. `speakMessage` runs `const gen = ++generation`, then synchronously sets `speakingMessageId = messageId` and `phase 'initializing'` (or `'speaking'` once ready). It then awaits `ensureReady()` and returns without speaking if `generation !== gen` after any await.
   - Text: `prepareMessageForSpeech(text)`, then `splitIntoSentences`, then `chunkForEngine` with `maxInputLength`.
   - Utterance ids are `${messageId}:${gen}:${index}`.
   - init, setVoice and speak go through one internal serial chain. Each link checks its captured generation, and a rejected link does not break the chain.
6. Finishing: when the done count for the current generation equals its chunk count, or on stop, or on an error event, the service returns to `ready` (or `error`) and clears `speakingMessageId`. Events whose utterance id carries an older generation are ignored.
7. A `NOT_OFFLINE` rejection stops queuing, calls `engine.stop()`, clears `speakingMessageId`, and re-runs `refresh()`.
8. `setAutoSpeak(true)` calls `refresh()`. `setRate` and `setPitch` persist the value and take effect on the next utterance.

- [ ] **Step 1: Write the failing rendered test** (navigation mock as in `__tests__/integration/happy/speakMessage.happy.test.tsx`)

```ts
const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;

it('speaks only the answer', async () => {
  const h = await setupChatScreen({ engine: 'llama', speech: {} });
  for (const id of ['web_search', 'read_url', 'search_knowledge_base']) h.enableToolViaUI(id); // turn the default tools off, so markup arrives as leaked text
  require('../../../src/features').activateFieldkitFeatures();
  h.render();
  await h.send('hi', { text: '<think>secret plan</think>The answer is **42**.\n\n```js\nx()\n```\n' + toolCallText('web_search', {}) });
  await h.rtl.waitFor(() => expect(h.view!.queryByText(/The answer is/)).not.toBeNull());
  await h.openActionMenu('assistant', 'longpress');
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('action-speak')));
  await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.speak.length).toBeGreaterThan(0));
  const spoken = h.boundary.speech!.calls.speak.map(c => c.text).join(' ');
  expect(spoken).toContain('The answer is 42.');
  expect(spoken).not.toMatch(/secret plan|\*\*|`|x\(\)|tool_call|web_search|"name"/);
  expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']);
});
it('no offline voice', async () => { /* voices: [network voice, { id: 'missingD', networkRequired: false, notInstalled: true, ... }] -> after pressing Speak: calls.speak and calls.setVoice are empty; reopening the action menu shows no 'action-speak' */ });
it('long reply chunks', async () => { /* maxInputLength 60; a one-paragraph reply of 5 sentences, one ~150 chars with spaces and no punctuation -> every calls.speak[i].text.length <= 60; calls.speak.length >= 7; calls.speak.map(c => c.text).join(' ') equals the expected prepared text written as a literal */ });
it('repeated sentence', async () => { /* reply 'Yes. Yes. Done.' -> calls.speak has 3 entries with 3 distinct utteranceIds */ });
it('module absent', async () => { /* setupChatScreen without speech -> no 'action-speak' in the action menu */ });
it('no engine', async () => { /* speech: { bound: false } -> no calls.speak after pressing Speak; the action menu then shows no 'action-speak' */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/voice/speakFromActionMenu.rendered.test.tsx`
Expected: FAIL, `Cannot find module '../../../src/features'`.

- [ ] **Step 3: Implement the types, engine wrapper, `speechText`, the `messageContent.ts` fix, `speechService`, `speechStore`, the bootstrap, the `App.tsx` line and the harness changes** per the Interfaces and Rules above.

- [ ] **Step 4: Run the tests and the gates**

Run: `npx jest __tests__/integration/voice/speakFromActionMenu.rendered.test.tsx __tests__/integration/app/bootNotBlockedByDownloadDb.rendered.test.tsx __tests__/integration/happy/speakMessage.happy.test.tsx __tests__/integration/chat/speakMarkdown.redflow.test.tsx __tests__/unit/utils/messageContent.test.ts`, then the Global Constraints gates.
Expected: all PASS. `npx jest --listTests __tests__/integration/voice/speakFromActionMenu` prints exactly one line ending in `speakFromActionMenu.rendered.test.tsx`, which proves the file is collected.

- [ ] **Step 5: Commit**

```bash
git add src/services/speech src/utils/speechText.ts src/utils/messageContent.ts src/stores/speechStore.ts src/stores/index.ts src/features App.tsx __tests__/harness __tests__/utils/testHelpers.ts __tests__/integration/voice
git commit -m "feat(voice): speak replies from the action menu with offline system voices"
```

---

### Task 4: Speak button in the message meta row

**Files:**
- Create: `src/features/voice/SpeakButton.tsx`
- Modify: `src/features/voice/registerVoice.ts` (register `SLOTS.messageSpeakButton`)
- Test: `__tests__/integration/voice/speakButton.rendered.test.tsx`

**Interfaces:**
- Consumes: `speechService.speakMessage`, `speechService.stop`, `useSpeechStore.speakingMessageId` and `speechService.canSpeak`.
- Produces: `SpeakButton: React.FC<{ text: string; messageId: string }>`:
  - testID `speak-button-${messageId}`, `accessibilityRole="button"`
  - `accessibilityLabel` 'Speak' when idle and 'Stop speaking' while this message is speaking
  - Feather `volume-2` / `square` at size 14 in `colors.textMuted`, with touch padding `SPACING.xs`
  - hidden when `canSpeak()` is false

- [ ] **Step 1: Write the failing test**

```ts
it('tap speaks, tap again stops, done returns to idle', async () => {
  // speech: {}, activate, render, send 'One. Two.' -> press getByLabelText('Speak') -> calls.speak has 2 entries and getByLabelText('Stop speaking') exists
  // const before = module.stop.mock.calls.length; press 'Stop speaking' -> module.stop calls === before + 1; label is 'Speak'
  // press 'Speak' again, then emit FieldkitSpeech_start and FieldkitSpeech_done for each utteranceId -> label is 'Speak'
});
it('stop during init', async () => { /* holdNextInit(); press Speak; press Stop speaking; releaseInit() -> no calls.speak for that reply; label is 'Speak' */ });
it('background stops speech', async () => { /* while speaking: before = stop count; h.boundary.emitAppStateChange('background') -> stop count === before + 1 */ });
it('new send stops speech', async () => { /* while speaking: before = stop count; h.send('next', ...) -> stop count > before when the new reply renders */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/voice/speakButton.rendered.test.tsx`
Expected: FAIL, no element labelled 'Speak'.

- [ ] **Step 3: Implement `SpeakButton` and register the slot.**

- [ ] **Step 4: Run the tests and the gates**

Run: `npx jest __tests__/integration/voice/speakButton.rendered.test.tsx __tests__/integration/chat/speakExcludesThinkingAndTools.guard.test.tsx`, then the Global Constraints gates.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/voice __tests__/integration/voice/speakButton.rendered.test.tsx
git commit -m "feat(voice): Speak button on assistant replies"
```

---

### Task 5: Voice settings panel, device check and slice 1 push

**Files:**
- Create: `src/features/voice/VoicePanel.tsx` (exports `VoicePanel` and `VoiceTabPanel`)
- Modify: `src/features/voice/registerVoice.ts` (register `SLOTS.generationSettingsTts` with `VoicePanel` and `SLOTS.modelsScreenVoiceTab` with `VoiceTabPanel`)
- Create: `docs/superpowers/verification/2026-11-03-voice.md`
- Test: `__tests__/integration/voice/voicePanel.rendered.test.tsx`

**Interfaces:**
- Consumes: `useSpeechStore` (`available`, `voices`, `selectedVoiceId`, `rate`, `pitch`, `phase`, `needsVoiceInstall`, `enginePackage`) and `speechService.refresh/selectVoice/previewVoice/openVoiceInstaller/setRate/setPitch`.
- Produces:
  - `VoicePanel: React.FC<{ onNavigateToTTSSettings?: () => void }>` (the prop is ignored) renders a shared body. The generation-settings hosts already scroll, so it adds no ScrollView.
  - `VoiceTabPanel: React.FC` wraps the body in `<ScrollView testID="voice-panel-scroll">` with `flex: 1`. Neither the Voice tab nor `VoiceModelsSheet` scrolls on its own.
  - The body calls `speechService.refresh()` on mount and contains:
    - `voice-engine` (shows `enginePackage`, or "Connecting" while initializing)
    - rows `voice-row-${id}`, with a Feather `check` on the selected one
    - `voice-preview`
    - rate and pitch through the existing `SliderSetting`
  - States:
    - `needsVoiceInstall`: "No offline voice is installed. Fieldkit only uses voices that work without internet." plus `voice-install`
    - unavailable with no install offer: "No speech engine is installed on this device."
    - `!available`: "Voice replies are not available on this device."

- [ ] **Step 1: Write the failing test** (top-level navigation mock as in speakMessage.happy, call `installNativeBoundary({ fs: true, speech: {...} })`, then require `activateFieldkitFeatures` and `ModelsScreen`, then press `voice-models-tab`)

```ts
it('lists only offline voices and persists the choice', async () => {
  // voices: [offlineA, offlineB, networkC, missingD (notInstalled)] -> voice-row-offlineA and voice-row-offlineB inside voice-panel-scroll; no voice-row-networkC, no voice-row-missingD; voice-engine shows 'com.google.android.tts'
  // press voice-row-offlineB -> calls.setVoice ends with 'offlineB'; after re-render, the check is on offlineB
});
it('offers install when no offline voice', async () => { /* voices: [networkC, missingD] -> install copy visible; press voice-install -> module.openVoiceInstaller called; the fake adds offlineA, then emitAppStateChange('active') -> voice-row-offlineA appears */ });
it('module absent', async () => { /* no speech -> 'Voice replies are not available on this device.'; no voice-install, no voice-row-* */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/voice/voicePanel.rendered.test.tsx`
Expected: FAIL, no element `voice-row-offlineA`.

- [ ] **Step 3: Implement `VoicePanel`/`VoiceTabPanel` and register both slots.**

- [ ] **Step 4: Run the tests and the gates**

Run: `npx jest __tests__/integration/voice __tests__/rntl/screens/ModelsScreen.test.tsx`, then the Global Constraints gates.
Expected: PASS. The ModelsScreen test does not activate features, so it is unaffected.

- [ ] **Step 5: Device check for slice 1**

Build and install the debug build (Task 1 Step 7). The `.dev` app has its own empty storage, so download a small offline model into it first. With the owner, check:
- `adb logcat -d -s FieldkitSpeech:I` shows which engine bound, and it matches the `voice-engine` row.
- The voice list matches the offline voices in Android Settings > Text-to-speech.
- Speak works in airplane mode.
- Speech ducks music and the music recovers.
- Pressing Home stops speech.

Record the results in `docs/superpowers/verification/2026-11-03-voice.md`.
Expected: all pass. A failure becomes a fix task with its own test (Robolectric for Kotlin, rendered for TS) before the push.

- [ ] **Step 6: Commit and push slice 1**

```bash
git add src/features/voice __tests__/integration/voice/voicePanel.rendered.test.tsx docs/superpowers/verification/2026-11-03-voice.md
git commit -m "feat(voice): offline voice picker with preview, rate and pitch"
git push origin main
```

---

### Task 6: Read replies aloud while they stream

**Files:**
- Create: `src/features/voice/AutoSpeakRow.tsx`
- Modify: `src/features/voice/registerVoice.ts`:
  - register `SLOTS.quickSettingsAudioRow`
  - `HOOKS.audioOnStreamingToken` -> `(c: string) => speechService.onStreamingToken(c)`
  - `HOOKS.audioOnStreamingEnd` -> `(id: string) => speechService.onStreamingEnd(id)`
- Modify: `src/services/speech/speechService.ts` (add `onStreamingToken(cumulative: string): void` and `onStreamingEnd(conversationId: string): void`)
- Modify: `src/utils/speechText.ts` (add `stableSpeakablePrefix(text: string): string`)
- Test: `__tests__/integration/voice/autoSpeak.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `AutoSpeakRow: React.FC<{ styles: Record<string, object>; onClose: () => void }>`: testID `quick-read-aloud`, label "Read replies aloud", Feather `volume-2`, calls `speechService.setAutoSpeak(!autoSpeak)`. Do not use `popoverStyles.badgeText` (weight 700).
  - `stableSpeakablePrefix` cuts the text before the first unclosed construct: an odd number of ` ``` ` markers, an odd number of `**` or `__`, or an odd number of single backticks outside fences.

Streaming algorithm (nothing happens unless `autoSpeak && canSpeak()`). Without `pauseAfter` the llama fake streams a whole reply without awaiting, and generationService batches tokens on a 50 ms timer, so the tests hold the stream explicitly.

```
session = { spokenCount, runningIndex, stopped, ended, startedAt, conversationId } | null
spokenMessageIds: Set<string>

onStreamingToken(cum):                               // synchronous; called inside a store action
  if session is null or session.ended or (session.stopped and the text got shorter):
    session = new session: generation++, conversationId = useChatStore.getState().streamingForConversationId,
              startedAt = Date.now(), spokenCount = 0
  if session.stopped: return
  answer = parseModelOutput(cum).answer              // empty while a reasoning opener is unclosed
  sentences = splitIntoSentences(prepareMessageForSpeech(stableSpeakablePrefix(answer)))
  new = sentences[session.spokenCount .. sentences.length - 2]   // hold the last one until a later sentence exists
  session.spokenCount = max(session.spokenCount, sentences.length - 1)
  queue new (ids stream:${generation}:${runningIndex++}); start ensureReady(); when it resolves, drop the queue
    if session.stopped or the session changed, else chunk with maxInputLength and speak
  speakingMessageId = 'streaming', phase 'speaking'
stop(): as in Task 3 Rule 4 (also marks the session stopped)
onStreamingEnd(id):
  if session and not session.ended and id !== session.conversationId: return   // another chat's stream is still live
  if session is null or session.ended or session.stopped: mark ended; return
  msg = the conversation's LAST message
  if msg is assistant, has no toolCalls, is not system info, msg.timestamp >= session.startedAt and
     msg.id is not in spokenMessageIds:
    finalSentences = splitIntoSentences(prepareMessageForSpeech(msg.content))
    speak finalSentences[session.spokenCount ..] (if the count no longer aligns, continue after the last
      occurrence of the last spoken sentence, else speak nothing; log [SPEECH-SM] prefix-mismatch)
    add msg.id to spokenMessageIds; speakingMessageId = msg.id
  session.ended = true                               // always, whether or not anything was spoken
```

- [ ] **Step 1: Write the failing test** (enable autoSpeak through `quick-read-aloud` in the quick-settings popover; hold a stream with `h.boundary.llama!.scriptCompletion({ text, pauseAfter })` plus `await h.tapSend('q')`, and release it with `h.boundary.llama!.releaseStream()`)

```ts
it('speaks sentence by sentence and the remainder once', async () => {
  // text 'First one. Second one. Last bit', pauseAfter 'Second one. L' -> waitFor calls.speak texts toEqual ['First one.'] (timeout 4000)
  // releaseStream -> waitFor ['First one.', 'Second one.', 'Last bit'], each exactly once
});
it('no code or reasoning mid-stream', async () => {
  // text '<think>Plan A. Plan B.</think>Intro one. Intro two. ```js\nfoo.bar(). baz()\n``` Done. End', pauseAfter 'foo.bar(). b'
  // while paused: texts toEqual ['Intro one.']; after release: ['Intro one.', 'Intro two.', 'Done.', 'End'] in order; none matches /Plan|foo|baz|`|\*/
});
it('stop mid-stream', async () => {
  // pauseAfter after two sentences; waitFor 1 speak and stop-button present; before = stop count; press stop-button (rtl.act)
  // waitFor no stop-button; settle(100) -> stop count > before; no further calls.speak for that reply; then h.send('again', { text: 'New reply. Done.' }) -> 'New reply.' spoken
});
it('new send mid-stream', async () => {
  // reply 1 'Alpha one. Alpha two. Alpha three.' paused after 'Alpha two. A'; waitFor 'Alpha one.'; n = calls.speak.length
  // scriptCompletion reply 2 'Beta one. Beta two.'; tapSend('next') -> module.stop called before releaseStream
  // releaseStream -> calls.speak.slice(n) has no /Alpha/; 'Beta one.' and 'Beta two.' each spoken once, in order
});
it('tool-call markup split across tokens', async () => { /* 'One. Two. ' + an unclosed '<tool_call>{...' then '</tool_call>' then 'Three.' -> each sentence spoken exactly once */ });
it('second tool round speaks in full', async () => { /* round 1 'Let me check. Okay.' + a calculator call; round 2 'It is sunny. Bye' -> 'It is sunny.' and 'Bye' each spoken once */ });
it('control-token-only turn speaks nothing', async () => { /* a previous reply exists; a turn whose tokens are all control tokens -> no new calls.speak; the next send's reply is spoken */ });
it('stop during init while streaming', async () => { /* holdNextInit(); stream; press stop-button; releaseInit(); stream ends -> calls.speak empty for that reply; the next send is spoken */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/voice/autoSpeak.rendered.test.tsx`
Expected: FAIL, no element `quick-read-aloud`.

- [ ] **Step 3: Implement `AutoSpeakRow`, `stableSpeakablePrefix`, the hooks and the streaming algorithm.**

- [ ] **Step 4: Run all voice tests and the gates**

Run: `npx jest __tests__/integration/voice`, then the Global Constraints gates.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/voice src/services/speech src/utils/speechText.ts __tests__/integration/voice/autoSpeak.rendered.test.tsx
git commit -m "feat(voice): read replies aloud while they stream"
```

---

### Task 7: On-device verification and slice 2 push

- [ ] **Step 1: Build and install the debug build** (Task 1 Step 7, with absolute APK paths; re-run `adb reverse` after reconnecting).

- [ ] **Step 2: Run the auto-speak checks with the owner and append the results to `docs/superpowers/verification/2026-11-03-voice.md`**

- A streamed reply is read aloud with no doubled or missing sentences. Dev-mode JS is slower than release, so judge timing with that in mind.
- Music stays ducked while sentences follow each other (focus is not dropped between queued sentences).
- Home or Stop while a reply streams stops speech for that reply.

Expected: all pass. Failures become fix tasks with their own tests before the push.

- [ ] **Step 3: Commit the verification notes and push slice 2**

```bash
git add docs/superpowers/verification/2026-11-03-voice.md
git commit -m "docs: on-device verification of auto-speak"
git push origin main
```
