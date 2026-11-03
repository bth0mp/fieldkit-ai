# Voice Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fieldkit speaks assistant replies aloud with the phone's offline system voices: on demand from the action menu or a Speak button, and optionally sentence by sentence while a reply streams.

**Architecture:** A first-party Kotlin module `FieldkitSpeech` wraps Android `TextToSpeech`. A `SpeechEngine` interface in `src/services/speech/` hides it, and `speechService` owns the state machine, the queue and the offline-voice filter. `speechStore` is a thin projection. A new feature bootstrap, `src/features/`, registers the existing core voice hooks and slots at app start, independent of Off Grid's license-gated `loadProFeatures`.

**Tech Stack:** React Native 0.83.1, TypeScript, zustand 5, Kotlin 2.2 (legacy bridge module under `newArchEnabled=true`), Jest + RNTL rendered tests with `__tests__/harness/`, Robolectric 4.13.

**Spec:** `docs/superpowers/specs/2026-11-03-pro-features-design.md` (sections 1, "Build order" slices 1-2, "Owner decisions" 1-2).

## Global Constraints

- No new npm dependencies; no GPL/AGPL/LGPL code. Nothing is copied from Off Grid's Pro module or its history.
- Only voices with `networkRequired == false` and `notInstalled == false` are ever selected or spoken.
- NativeModules key `FieldkitSpeech`. Event names `FieldkitSpeech_start`, `FieldkitSpeech_done`, `FieldkitSpeech_stopped`, `FieldkitSpeech_error`. iOS parity: module absent means `available: false` (no Swift).
- UI: theme tokens only (`TYPOGRAPHY`, `SPACING` from `src/constants`, colors from `useTheme`), font weight <= 400, Feather icons, no emoji, no Off Grid/Wednesday text.
- ESLint: max-params 3 (use an options object), max-lines 500, complexity 20, `react-native/no-unused-styles`, no inline styles or color literals.
- New tests go in `__tests__/integration/voice/` with names free of `tts`, `/audio/`, `/engine/`, `/android/` (all silently skipped). Registries are required after `setupChatScreen`.
- Every commit passes `npx tsc --noEmit`, eslint on changed files, `npm run depcruise` and `npm run knip`. Pushes go through the pre-push hook, never `--no-verify`.

## Review Focus

1. A reply with `<think>` reasoning, a tool call, markdown and a code block: only the answer prose is spoken (Task 3 test `speaks only the answer`).
2. The user stops generation, or sends a new message, while a reply is being spoken: speech stops at once and that reply never resumes (Task 6 test `stop mid-stream`).
3. The phone has only network voices or no voice data: Fieldkit never speaks, and offers "Install voices" (Task 3 test `no offline voice`).
4. A reply longer than the engine's max input length: it is split into chunks under the limit and all are spoken in order (Task 3 test `long reply chunks`).
5. Two identical sentences in one reply: both are spoken; utterance ids never collide (Task 3 test `repeated sentence`).

---

### Task 1: Local Android toolchain

No repo code changes except the gitignored `android/local.properties`. Tell the owner that this installs JDK 17 (required by React Native's Gradle plugin, which pins `jvmToolchain(17)`) next to the existing JDK 21.

- [ ] **Step 1: Install JDK 17 (Temurin)**

Run (PowerShell): `winget install --id EclipseAdoptium.Temurin.17.JDK -e --silent --accept-package-agreements --accept-source-agreements`
Expected: `Successfully installed`. `C:\Program Files\Eclipse Adoptium\jdk-17*` exists. Keep `JAVA_HOME` on 21; Gradle discovers 17 from the registry.

- [ ] **Step 2: Bootstrap the SDK command-line tools**

Download `https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip` into a new empty folder in the scratchpad. Check that its SHA-1 equals `57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d`, then unpack it so `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat` exists.
Expected: `sdkmanager.bat --version` prints `23.0` (or later).

- [ ] **Step 3: Install SDK packages**

Run: `& "$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" --install "platforms;android-36" "ndk;27.1.12297006" "cmake;3.22.1"`
Expected: the three packages install under the already accepted `android-sdk-license`. If sdkmanager asks to accept any license, STOP and ask the owner; never pipe `yes`.

- [ ] **Step 4: Point Gradle and adb at the SDK**

Set the User env var `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` and append `%LOCALAPPDATA%\Android\Sdk\platform-tools` to the User `Path`. Write `android/local.properties` with `sdk.dir=C:/Users/bth0m/AppData/Local/Android/Sdk`.
Expected: `git status` does not list `local.properties` (it is gitignored).

- [ ] **Step 5: Prove the pre-push Gradle gates on unchanged code**

Run from Git Bash in the real path `D:/Claude Code/Off Grid AI` (the hook's own commands): `cd android && ./gradlew compileDebugKotlin --quiet && ./gradlew :app:lintDebug --quiet && cd .. && npm run test:android`
Expected: all three succeed, including the 5 existing Kotlin unit tests. Settings-time autolinking spawns `cmd /c npx`, which the tool sandbox has blocked before, so run this with the sandbox disabled if it fails with `cmd.exe ENOENT`. If any gate fails on code this plan did not write, STOP and report to the owner; do not fix it inside a feature task.

- [ ] **Step 6: Prove a release build and USB install**

Run (PowerShell): `subst F: "D:\Claude Code\Off Grid AI"`, then `cd F:\android; .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a`. With the S24 Ultra connected and USB debugging on, run `adb devices`, then `adb install -r F:\android\app\build\outputs\apk\release\app-release.apk`.
Expected: the build succeeds (the release build embeds the JS bundle and signs with `android/app/debug.keystore`, as CI does), `adb devices` lists the phone as `device`, and Fieldkit AI launches on the phone. The space-free `F:` drive avoids CMake/Ninja path-length and space failures.

---

### Task 2: `FieldkitSpeech` native module

**Files:**
- Create: `android/app/src/main/java/ai/offgridmobile/speech/FieldkitSpeechModule.kt`
- Create: `android/app/src/main/java/ai/offgridmobile/speech/FieldkitSpeechPackage.kt`
- Modify: `android/app/src/main/java/ai/offgridmobile/MainApplication.kt` (add `add(FieldkitSpeechPackage())` in `PackageList(this).packages.apply { }`)
- Modify: `android/app/src/main/AndroidManifest.xml` (add `<queries><intent><action android:name="android.intent.action.TTS_SERVICE"/></intent></queries>` after the last `<uses-permission>`, before `<application>`)
- Test: `android/app/src/test/java/ai/offgridmobile/speech/FieldkitSpeechModuleTest.kt`

**Interfaces:**
- Produces (JS-visible, `getName() = "FieldkitSpeech"`; all methods take a trailing `Promise`):
  - `init(enginePackage: String?)` resolves `{ bound: Boolean, enginePackage: String?, maxInputLength: Double }`
  - `getVoices()` resolves `[{ id, name, language, networkRequired: Boolean, notInstalled: Boolean, quality: Double }]` (all voices, unfiltered)
  - `setVoice(id: String)` resolves `Boolean`
  - `speak(text: String, utteranceId: String, rate: Double, pitch: Double)` resolves when queued (`QUEUE_ADD`), and rejects `NOT_OFFLINE` if the current voice is not usable offline
  - `stop()`, `openVoiceInstaller()` (launches `TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA`), `addListener(String)`, `removeListeners(Double)`
  - Events (copy the guarded `DownloadEventBridge.emit` pattern): `FieldkitSpeech_start {utteranceId}`, `FieldkitSpeech_done {utteranceId}`, `FieldkitSpeech_stopped {utteranceId, interrupted}`, `FieldkitSpeech_error {utteranceId, code}`
  - Companion: `internal fun isUsableOffline(networkRequired: Boolean, features: Set<String>?): Boolean` and `internal fun pickEngine(requested: String?, installed: List<String>, defaultEngine: String?): String?`

Behavior:
- `init` binds `requested` if it is installed, else the default engine. If binding the Samsung engine `com.samsung.SMT` fails, retry once with `com.google.android.tts` when it is installed.
- `setVoice` never calls `setLanguage` afterwards.
- Audio focus: request `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` with `USAGE_ASSISTANT`/`CONTENT_TYPE_SPEECH` (also passed to `setAudioAttributes`) on the first `onStart`. Abandon it when the queue drains or on `stop`.
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
Expected: PASS, with no new lint issues against `lint-baseline.xml`.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/ai/offgridmobile/speech android/app/src/test/java/ai/offgridmobile/speech android/app/src/main/java/ai/offgridmobile/MainApplication.kt android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): FieldkitSpeech module over system TextToSpeech"
```

---

### Task 3: Speech service, feature bootstrap and Speak from the action menu

**Files:**
- Create: `src/services/speech/speechTypes.ts`, `src/services/speech/systemSpeechEngine.ts`, `src/services/speech/speechService.ts`
- Create: `src/utils/speechText.ts`
- Create: `src/stores/speechStore.ts` (export from `src/stores/index.ts`)
- Create: `src/features/index.ts`, `src/features/voice/registerVoice.ts`
- Modify: `App.tsx` (one line, `activateFieldkitFeatures();`, next to the `loadProFeatures` call and before `setIsInitializing(false)`)
- Modify: `__tests__/harness/nativeBoundary.ts` (`speech?: SpeechFakeOptions` in `InstallOpts`, `speech?: SpeechFake` in `NativeBoundary`, `makeSpeechFake`, installed as `RN.NativeModules.FieldkitSpeech`), `__tests__/harness/chatHarness.ts` (`speech?: SpeechFakeOptions` passed through), `__tests__/utils/testHelpers.ts` (reset `useSpeechStore` in `resetStores`)
- Test: `__tests__/integration/voice/speakFromActionMenu.rendered.test.tsx`

**Interfaces:**
- Consumes: the Task 2 native contract.
- Produces:
  - `speechTypes.ts`:
    - `SpeechVoice { id: string; name: string; language: string; networkRequired: boolean; notInstalled: boolean; quality: number }`
    - `SpeechPhase = 'idle' | 'initializing' | 'ready' | 'speaking' | 'unavailable' | 'error'`
    - `SpeechEngineEvent { type: 'start' | 'done' | 'stopped' | 'error'; utteranceId: string; code?: number }`
    - `SpeechEngine { readonly id: string; isPresent(): boolean; init(): Promise<{ bound: boolean; enginePackage: string | null; maxInputLength: number }>; getVoices(): Promise<SpeechVoice[]>; setVoice(id: string): Promise<boolean>; speak(req: { text: string; utteranceId: string; rate: number; pitch: number }): Promise<void>; stop(): Promise<void>; openVoiceInstaller(): Promise<void>; onEvent(listener: (e: SpeechEngineEvent) => void): () => void }`
  - `systemSpeechEngine: SpeechEngine` (absent module: `isPresent()` is false and every method resolves as a no-op)
  - `speechText.ts`: `splitIntoSentences(text: string): string[]` and `chunkForEngine(input: { sentences: string[]; maxLen: number }): string[]`
  - `speechService` methods: `canSpeak(): boolean`, `speakMessage(input: { text: string; messageId: string }): Promise<void>`, `stop(): void`, `onStreamingToken(cumulative: string): void`, `onStreamingEnd(conversationId: string): void`, `selectVoice(id: string): Promise<void>`, `previewVoice(): Promise<void>`, `openVoiceInstaller(): Promise<void>`, `refresh(): Promise<void>`
  - `useSpeechStore`:
    - persisted, key `local-llm-speech-storage`: `selectedVoiceId: string | null` (null), `rate: number` (1), `pitch: number` (1), `autoSpeak: boolean` (false)
    - transient: `phase: SpeechPhase` ('idle'), `voices: SpeechVoice[]` (offline and installed only), `speakingMessageId: string | null`, `enginePackage: string | null`, `needsVoiceInstall: boolean`
    - setters: `setPrefs(partial)` (UI), `setRuntime(partial)` (speechService only)
  - `activateFieldkitFeatures(): void`, idempotent (module-level flag; catches and logs `[FEATURES]` errors)
  - `registerVoiceFeature(): void`, which registers `HOOKS.audioCanSpeak` -> `speechService.canSpeak`, `HOOKS.audioSpeak` -> `(text, messageId) => speechService.speakMessage({ text, messageId })`, `HOOKS.audioStop` and `HOOKS.audioOnAppBackground` -> `speechService.stop`
  - Harness `SpeechFakeOptions { voices?: SpeechVoice[]; maxInputLength?: number; bound?: boolean }`. The default voices are one offline voice `{ id: 'en-us-offline', networkRequired: false, notInstalled: false }` and one network voice `{ id: 'en-us-network', networkRequired: true }`, with `maxInputLength` 4000. `SpeechFake { module; calls: { speak: { text: string; utteranceId: string }[]; setVoice: string[] }; emit(event: string, payload: object): void }`

Rules for `speechService`:
- `canSpeak()` is `engine.isPresent() && phase !== 'unavailable'`, read from cached state, synchronous.
- The first `speakMessage` runs init.
- `getVoices` result is filtered to `!networkRequired && !notInstalled`. If none survive: `phase = 'unavailable'`, `needsVoiceInstall = true`, return without speaking.
- The voice is `selectedVoiceId` if it is still in the filtered list, else the highest `quality`.
- Text: `prepareMessageForSpeech(text)`, then `splitIntoSentences`, then `chunkForEngine` with `maxInputLength`.
- Utterance ids are `${messageId}:${generation}:${index}`, where `generation` increments on every `speakMessage` and `stop`.
- `speakMessage` stops anything already speaking first.
- `speakingMessageId` clears on the last `done`, on `stop`, or on `error`.
- Log prefix `[SPEECH-SM]`.

- [ ] **Step 1: Write the failing rendered test**

```ts
// __tests__/integration/voice/speakFromActionMenu.rendered.test.tsx (navigation mock as in __tests__/integration/happy/speakMessage.happy.test.tsx)
it('speaks only the answer', async () => {
  const h = await setupChatScreen({ engine: 'llama', speech: {} });
  require('../../../src/features').activateFieldkitFeatures();
  h.render();
  await h.send('hi', { text: '<think>secret plan</think>The answer is **42**.\n\n```js\nx()\n```' });
  await h.rtl.waitFor(() => expect(h.view!.queryByText(/The answer is/)).not.toBeNull());
  await h.openActionMenu('assistant', 'longpress');
  h.rtl.fireEvent.press(await h.rtl.waitFor(() => h.view!.getByTestId('action-speak')));
  await h.rtl.waitFor(() => expect(h.boundary.speech!.calls.speak.length).toBeGreaterThan(0));
  const spoken = h.boundary.speech!.calls.speak.map(c => c.text).join(' ');
  expect(spoken).toContain('The answer is 42.');
  expect(spoken).not.toMatch(/secret plan|\*\*|```|x\(\)/);
  expect(h.boundary.speech!.calls.setVoice).toEqual(['en-us-offline']);
});
it('no offline voice', async () => { /* speech: { voices: [network-only] } -> after the first Speak press, calls.speak is empty, and the store has needsVoiceInstall === true and phase 'unavailable'; reopening the action menu shows no 'action-speak' */ });
it('long reply chunks', async () => { /* speech: { maxInputLength: 60 }, a 5-sentence reply -> every calls.speak[i].text.length <= 60, and joined in order they equal the prepared reply text */ });
it('repeated sentence', async () => { /* reply 'Yes. Yes. Done.' -> calls.speak has 3 entries with 3 distinct utteranceIds */ });
it('module absent', async () => { /* setupChatScreen without speech -> no 'action-speak' in the action menu */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/voice/speakFromActionMenu.rendered.test.tsx`
Expected: FAIL, `Cannot find module '../../../src/features'`.

- [ ] **Step 3: Implement the types, engine wrapper, `speechText`, `speechService`, `speechStore`, bootstrap, `App.tsx` line and harness fake** per the Interfaces and Rules above.

- [ ] **Step 4: Run the test, the boot test and the gates**

Run: `npx jest __tests__/integration/voice/speakFromActionMenu.rendered.test.tsx __tests__/integration/app/bootNotBlockedByDownloadDb.rendered.test.tsx __tests__/integration/happy/speakMessage.happy.test.tsx && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: all PASS. `npx jest --listTests | grep integration/voice` lists the new file (proving it is not silently skipped).

- [ ] **Step 5: Commit**

```bash
git add src/services/speech src/utils/speechText.ts src/stores/speechStore.ts src/stores/index.ts src/features App.tsx __tests__/harness __tests__/utils/testHelpers.ts __tests__/integration/voice
git commit -m "feat(voice): speak replies from the action menu with offline system voices"
```

---

### Task 4: Speak button in the message meta row

**Files:**
- Create: `src/features/voice/SpeakButton.tsx`
- Modify: `src/features/voice/registerVoice.ts` (register `SLOTS.messageSpeakButton`)
- Test: `__tests__/integration/voice/speakButton.rendered.test.tsx`

**Interfaces:**
- Consumes: `speechService.speakMessage`, `speechService.stop` and `useSpeechStore.speakingMessageId`.
- Produces: `SpeakButton: React.FC<{ text: string; messageId: string }>`. testID `speak-button-${messageId}`. Feather `volume-2` when idle, `square` while this message is speaking. Styled like the meta row's `actionHint` (`padding: 4`, `TYPOGRAPHY.meta`, `colors.textMuted`). Hidden when `canSpeak()` is false.

- [ ] **Step 1: Write the failing test**

```ts
it('tap speaks, tap again stops, done returns to idle', async () => {
  // setup with speech: {}, activate, render, send 'One. Two.'
  // press speak-button-<id> -> calls.speak has 2 entries and the icon is 'square'
  // press again -> module.stop called once
  // press once more, then emit FieldkitSpeech_start and FieldkitSpeech_done for each utteranceId -> the button shows 'volume-2'
});
it('background stops speech', async () => { /* speaking, then require hookRegistry and callHook(HOOKS.audioOnAppBackground) -> module.stop called */ });
it('new send stops speech', async () => { /* speaking, then h.send('next', ...) -> module.stop called before the new reply renders */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/voice/speakButton.rendered.test.tsx`
Expected: FAIL, no element with testID `speak-button-...`.

- [ ] **Step 3: Implement `SpeakButton` and register the slot.**

- [ ] **Step 4: Run the test and the gates**

Run: `npx jest __tests__/integration/voice/speakButton.rendered.test.tsx __tests__/integration/chat/speakExcludesThinkingAndTools.guard.test.tsx && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/voice __tests__/integration/voice/speakButton.rendered.test.tsx
git commit -m "feat(voice): Speak button on assistant replies"
```

---

### Task 5: Voice settings panel

**Files:**
- Create: `src/features/voice/VoicePanel.tsx`
- Modify: `src/features/voice/registerVoice.ts` (register `SLOTS.generationSettingsTts` and `SLOTS.modelsScreenVoiceTab` with the same component)
- Test: `__tests__/integration/voice/voicePanel.rendered.test.tsx`

**Interfaces:**
- Consumes: `useSpeechStore` (`voices`, `selectedVoiceId`, `rate`, `pitch`, `phase`, `needsVoiceInstall`, `enginePackage`) and `speechService.refresh/selectVoice/previewVoice/openVoiceInstaller`.
- Produces: `VoicePanel: React.FC<{ onNavigateToTTSSettings?: () => void }>`, with the prop ignored. It is not its own vertical ScrollView, because both hosts already scroll. It calls `speechService.refresh()` on mount.
  - Rows: `voice-row-${id}` (selected one marked with a Feather `check`), a Preview button `voice-preview`, and rate and pitch through the existing `SliderSetting` component.
  - Unavailable state: copy "No offline voice is installed. Fieldkit only uses voices that work without internet." plus an "Install voices" button `voice-install`.
  - Module absent: "Voice replies are not available on this device."

- [ ] **Step 1: Write the failing test**

```ts
it('lists only offline voices and persists the choice', async () => {
  // render ModelsScreen with speech: { voices: [offlineA, offlineB, networkC] } after activate; press the Voice tab
  // voice-row-offlineA and voice-row-offlineB exist; no voice-row-networkC
  // press voice-row-offlineB -> useSpeechStore.getState().selectedVoiceId === 'offlineB' and calls.setVoice ends with 'offlineB'
});
it('offers install when no offline voice', async () => { /* voices: [networkC] -> install copy visible; press voice-install -> module.openVoiceInstaller called */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/voice/voicePanel.rendered.test.tsx`
Expected: FAIL, no element `voice-row-offlineA`.

- [ ] **Step 3: Implement `VoicePanel` and register both slots.**

- [ ] **Step 4: Run the test and the gates**

Run: `npx jest __tests__/integration/voice/voicePanel.rendered.test.tsx __tests__/rntl/screens/ModelsScreen.test.tsx && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: PASS. Update the ModelsScreen test that asserts "no upsell when no voice engine is registered" only if it now sees the panel (that test does not activate features, so it should be unaffected).

- [ ] **Step 5: Commit, then push slice 1**

```bash
git add src/features/voice __tests__/integration/voice/voicePanel.rendered.test.tsx
git commit -m "feat(voice): offline voice picker with preview, rate and pitch"
git push origin main
```

---

### Task 6: Read replies aloud while they stream

**Files:**
- Create: `src/features/voice/AutoSpeakRow.tsx`
- Modify: `src/features/voice/registerVoice.ts` (register `SLOTS.quickSettingsAudioRow`, `HOOKS.audioOnStreamingToken` -> `speechService.onStreamingToken`, `HOOKS.audioOnStreamingEnd` -> `speechService.onStreamingEnd`)
- Modify: `src/services/speech/speechService.ts`
- Test: `__tests__/integration/voice/autoSpeak.rendered.test.tsx`

**Interfaces:**
- Produces: `AutoSpeakRow: React.FC<{ styles: Record<string, object>; onClose: () => void }>`. testID `quick-read-aloud`, label "Read replies aloud", Feather `volume-2`, toggles `useSpeechStore.autoSpeak`. Do not use `popoverStyles.badgeText` (weight 700).

Streaming algorithm (in `speechService`; nothing happens unless `autoSpeak && canSpeak()`):

```
session = { spokenText: '', lastLength: 0, stopped: false, ended: false } | null
onStreamingToken(cum):
  if session is null or session.ended or cum.length < session.lastLength: session = new session
  session.lastLength = cum.length
  if session.stopped: return
  speakable = prepareMessageForSpeech(cum)
  complete = the completed sentences of speakable after session.spokenText.length (a sentence is
             complete when the next sentence has begun)
  speak complete as chunks; session.spokenText += complete
stop(): engine.stop(); if session and not session.ended: session.stopped = true
onStreamingEnd(conversationId):
  if session is null or session.ended or session.stopped: mark ended, return
  msg = last assistant message of that conversation; if msg.id in spokenMessageIds: return
  final = prepareMessageForSpeech(msg.content)
  remainder = final.startsWith(spokenText) ? final.slice(spokenText.length)
            : text after the last occurrence of the last spoken sentence in final, else '' (log [SPEECH-SM] prefix-mismatch)
  speak remainder; add msg.id to spokenMessageIds; session.ended = true
```

- [ ] **Step 1: Write the failing test**

```ts
it('speaks sentence by sentence and the remainder once', async () => {
  // speech: {}, activate, render; open quick settings, press quick-read-aloud -> autoSpeak true
  // send with a llama reply 'First one. Second one. Last bit' -> calls.speak texts are ['First one.', 'Second one.', 'Last bit'] in order, exactly once each
});
it('final text differs from streamed text', async () => {
  // make the finalized content differ from the stream (e.g. a reply ending with '<think>' noise stripped at finalize) -> no sentence spoken twice and the last sentence spoken once
});
it('stop mid-stream', async () => {
  // a long streamed reply; press the input stop button after the first speak -> module.stop called; no further calls.speak for that reply, even after streaming ends; the next send is spoken again
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/voice/autoSpeak.rendered.test.tsx`
Expected: FAIL, no element `quick-read-aloud`.

- [ ] **Step 3: Implement `AutoSpeakRow`, the hooks and the streaming algorithm.**

- [ ] **Step 4: Run all voice tests and the gates**

Run: `npx jest __tests__/integration/voice && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/voice src/services/speech __tests__/integration/voice/autoSpeak.rendered.test.tsx
git commit -m "feat(voice): read replies aloud while they stream"
```

---

### Task 7: On-device verification and push

- [ ] **Step 1: Build and install**

Run (PowerShell): `subst F: "D:\Claude Code\Off Grid AI"` (if it is not already mapped), `cd F:\android; .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a`, `adb install -r app\build\outputs\apk\release\app-release.apk`
Expected: `Success`.

- [ ] **Step 2: Run the device checklist with the owner, and record the results in `docs/superpowers/verification/2026-11-03-voice.md`**

- `adb logcat -s ReactNativeJS:V | grep SPEECH-SM` shows which engine bound (Google vs Samsung).
- The voice panel lists only offline voices; compare with Android Settings > Text-to-speech.
- With airplane mode on, Speak works.
- With music playing, speech ducks the music and the music recovers afterwards.
- Pressing Home while speaking stops speech.
- Auto-speak reads a streamed reply with no doubled or missing sentences.

Expected: every item passes. Any failure becomes a fix task with its own rendered test before the push.

- [ ] **Step 3: Commit the verification notes and push slice 2**

```bash
git add docs/superpowers/verification/2026-11-03-voice.md
git commit -m "docs: on-device verification of voice replies"
git push origin main
```
