# Fieldkit "Pro" features: design

Date: 2026-11-03. Status: draft for owner approval.

## Intent

Off Grid AI sells a Pro tier (voice, personas, actions on email/calendar/MCP). Fieldkit AI
is the owner's free, non-commercial, MIT fork of the open core. The owner wants the same
kind of capabilities in Fieldkit, built "our own way", for free, and "as legal as possible".

What makes Fieldkit worth using is that it is private by mechanism: the model runs in the
phone's RAM and nothing leaves the device. Every feature here has to keep that promise, or
say plainly and visibly when the user chooses to break it (for example a LAN MCP server).

## Goals

1. **Voice replies.** Speak any assistant reply on demand, and optionally speak replies
   automatically as they stream, using the phone's built-in offline voices.
2. **Hands-free voice mode.** Talk, the reply is spoken, talk again, without touching the
   screen. Builds on the existing Whisper speech-to-text.
3. **Personas.** Named assistants, each with its own system prompt, knowledge base, icon
   and voice, built on the existing Projects.
4. **Actions with approval.** The assistant can read the device calendar, prepare a new
   calendar event, and draft an email. Nothing is written or sent until the user approves,
   and the final save/send happens in the system Calendar or mail app.
5. **MCP servers (last).** Connect to MCP tool servers on the user's own network.
6. **Optional neural voice (later).** A higher-quality on-device voice behind the same
   interface as the system voice, only if it can ship without GPL code or unclear data.

## Non-goals

- Accounts, cloud services, payments, license keys or feature gating. Every feature is
  free and on by default where it is safe.
- Off Grid's other Pro ideas (cross-device sync, ambient/proactive "skills").
- iOS builds. Fieldkit ships Android only, but native modules keep the cross-platform
  contract (see Constraints).
- A new code review or refactor of existing features; this design only adds features.

## Anti-goals (would count as failure even if it "works")

- Any data leaving the device without a visible, explicit user action. This includes
  network TTS voices, which Google and Samsung engines can use silently.
- Any GPL, AGPL or LGPL component at runtime, including espeak-ng and anything that links it.
- Copying, porting or paraphrasing code, text or assets from Off Grid's proprietary Pro
  module, its store apps, or the core-repo history where Pro code briefly lived
  (commit 609ddd5ad and its successors). The MIT core design docs at tag v0.0.103
  (`docs/TTS_ENGINE_INTERFACE.md`, `docs/PERSONAS_IMPLEMENTATION_PLAN.md`) may be read to
  understand the seam contracts; no code or prose is copied from them.
- A tool that writes, sends or deletes anything without the user approving that exact action.

## Constraints (verified in the code, 2026-11-03)

**Registration.** `loadProFeatures` only activates `@offgrid/pro`, which resolves to a null
stub, and it is behind Off Grid's license check, so anything routed through it never turns
on. Fieldkit features register from their own module, `src/features/index.ts`, through
`activateFieldkitFeatures()`. It is called once, synchronously, from `App.tsx` before
`setIsInitializing(false)`. It must not await native work and must be wrapped in try/catch:
the boot test renders the real App and fails if init stalls or throws. `App()` is at
329/350 lines, so the call is one line. It uses the same registries Pro used:
`registerSlot`, `registerHook`, `registerToolExtension`, `registerScreen` and
`registerSettingsSection`. `src/features/` is not under a dependency-cruiser layering
rule, so it may import screens, components and services. Services and stores must not
import UI.

**Voice seams already in core** (exact props and caller behavior are in the recon notes):
- Slots: `messageSpeakButton` (`{text, messageId}`, a small inline button in the
  message meta row, chat mode only), `quickSettingsAudioRow` (a row in the chat
  quick-settings popover), `generationSettingsTts` (an accordion section in both
  generation settings hosts, inside an existing ScrollView), `modelsScreenVoiceTab`
  (body of the always-rendered Voice tab, and of a fixed-height sheet), plus the audio-mode
  slots `chatInputAudioMode` (replaces the WHOLE chat input), `messageAudioMode`,
  `chatEmptyAudio` and `chatInputModeToggle` (header subtitle row).
- Hooks: `audioCanSpeak` (called synchronously in every message render, so it must read
  cached state), `audioSpeak(text, messageId)` (the text has not been through
  `prepareMessageForSpeech`), `audioStop` (fires often, must be idempotent),
  `audioOnStreamingToken(cumulativeText)` (synchronous, inside a store action),
  `audioOnStreamingEnd(conversationId)` (can fire several times per turn, spuriously, and
  after a user stop: dedupe by message id and skip stopped turns),
  `audioOnAppBackground/Foreground` (ChatScreen-only), and `audioAugmentPrompt`
  (send path only, not retry or edit).
- Most slot consumers use non-reactive `getSlot` and `MessageRenderer` is memoized, so
  everything registers before the UI first renders.

**Tools.** Built-in tools live in `AVAILABLE_TOOLS` + `dispatchTool`, which gives them a
ToolsScreen toggle, an OpenAI schema and a text hint. Extensions (`registerToolExtension`)
are not listed on ToolsScreen. No approval step exists: tool calls run as soon as they are
parsed, on both the JS loop and LiteRT's native loop. The calendar tool ids
`read_calendar_events` and `create_calendar_event` are already recognized as
time-sensitive (`generationToolLoop.ts:568`), which adds the exact local time to the turn.
A screen named `McpServers` doubles as the "Pro is active" signal, so we do not use that name.

**Projects.** `Project` has `name, description, systemPrompt, icon?` and a per-project
knowledge base. The project prompt replaces the settings prompt. `projectStore` persists
with no `version`/`migrate`/`merge`: new fields must be optional, and a version bump without
`migrate` would wipe every user's projects. Seeded defaults never reach existing installs.
Prompt assembly is duplicated between send and retry/edit, so anything persona-specific goes
in one shared builder. Changing the system prompt resets LiteRT's conversation, so
per-turn context goes on the latest user message, not the system prompt.

**Native code.** New Android modules follow the existing pattern
(`ReactContextBaseJavaModule` + `ReactPackage` in `MainApplication.kt`, interop layer under
`newArchEnabled=true`, e.g. `devicememory/DeviceMemoryModule.kt`). CLAUDE.md requires the
same methods and events on iOS: each module gets an iOS counterpart that reports the
capability as unavailable (declared data, not a silent difference) until it is implemented.
Pushing any `.kt` file makes the pre-push hook run Gradle (compile, lint, unit tests). This
machine has an Android SDK but no `ANDROID_HOME`, no `local.properties` and no NDK, so that
push fails today (see Open decisions).

**Tests.** One rendered integration test per change, faking only at the device boundary
(`__tests__/harness/nativeBoundary.ts`). New voice tests must NOT go in
`__tests__/unit/audio/`, `__tests__/integration/audio/` or `__tests__/unit/engine/`, and must
not reuse base names like `ttsService.test`/`ttsStore.test`/`tts.test`: those paths are
silently skipped, typecheck-excluded and knip-ignored while `pro/` is absent. Do not use
`chatHarness.enterVoiceMode` or `installPro`. Use `__tests__/integration/voice/`,
`__tests__/integration/actions/` and `__tests__/integration/personas/`. Registries are
required inside each test after `installNativeBoundary` (it resets modules).

**Licensing.** No new npm dependency is needed for slices 1 to 6. `react-native-calendar-events`
is removed (deprecated upstream, unused) and `WRITE_CALENDAR` is removed from the manifest.
Any later dependency goes through `node scripts/gen-notices.js`; native components and
models go in its `NATIVE` list by hand.

## Design

### 1. Voice replies

**Engine: Android's built-in TextToSpeech through our own small Kotlin module**
(`FieldkitSpeech`). There are no new dependencies; `react-native-tts` breaks on Gradle 9,
and `@mhpdev/react-native-speech` and `expo-speech` cannot enforce offline voices.

Native contract (Android implements it; iOS reports `available: false` for now):
- `getStatus()`: engine bound, engine package, offline voice count.
- `getEngines()`: installed TTS engines (label, package).
- `init(enginePackage?)`: binds to the requested engine if installed, else the default.
  Returns which engine actually bound. (Samsung TTS may refuse third-party apps on
  One UI 7+, so Google's engine is the expected one on the S24 Ultra.)
- `getVoices()`: ONLY voices with `isNetworkConnectionRequired() == false` and no
  `KEY_FEATURE_NOT_INSTALLED` (selecting a not-installed voice starts a download).
- `setVoice(id)`: never followed by `setLanguage()` (which resets the voice).
- `speak(text, utteranceId, rate, pitch)`: `QUEUE_ADD`, re-checks the current voice is still
  offline before speaking and refuses otherwise.
- `stop()`, `openVoiceInstaller()` (`ACTION_INSTALL_TTS_DATA`).
- Events `start`, `done`, `stopped`, `error` with the utterance id.
- Requests audio focus (`GAIN_TRANSIENT_MAY_DUCK`) with assistant/speech audio attributes,
  and releases it when the queue empties. Adds the `TTS_SERVICE` `<queries>` entry.
- Shuts the engine down in `invalidate()`.

TypeScript side (`src/services/speech/`, names chosen to avoid the skipped test patterns):
- `SpeechEngine` interface with `available`, `voices`, `speak`, `stop` and events. The
  system engine is the first implementation, and the optional neural engine (section 6) is
  a second. Callers never branch on which engine is active.
- `speechService` owns the state machine (`unavailable`, `initializing`, `ready`,
  `speaking`, `error`), the utterance queue, and dedupe by message id. It also holds the
  stopped-turn flag that keeps `audioOnStreamingEnd` from speaking after a stop.
  - Text goes through `prepareMessageForSpeech`, so no reasoning, tool calls or markdown
    is spoken.
  - Sentences are split for streaming and cut to the engine's max input length.
- A thin `speechStore` (zustand) projects state for the UI: ready, speaking message id,
  voices, selected voice, rate, auto-speak. Settings persist under a new key.
- Init is lazy: on first use or when the voice settings open, never at boot.

Registered UI and hooks:
- `messageSpeakButton`: speaker icon in the reply's meta row; tap to speak, tap again to stop.
- `audioCanSpeak` / `audioSpeak` / `audioStop`: action-menu Speak, stop on new send, abort,
  retry, mic start and leaving chat.
- `audioOnAppBackground`: stop speaking.
- `generationSettingsTts` and `modelsScreenVoiceTab`: one shared `VoicePanel`. It shows
  engine status, the offline voice list with a preview, and rate and pitch. When no
  offline voice is installed it offers "Install voices" and says why online voices are
  hidden.
- `quickSettingsAudioRow`: "Read replies aloud" toggle (auto-speak).
- Auto-speak: `audioOnStreamingToken` queues each completed sentence while the reply
  streams; `audioOnStreamingEnd` speaks the remainder once per message id.

### 2. Hands-free voice mode

Uses the audio-mode slots. `chatInputModeToggle` switches `interfaceMode`.
`chatInputAudioMode` renders a large mic control plus the quick-settings and attachment
popovers it replaces. `messageAudioMode` renders compact bubbles with replay.
`chatEmptyAudio` shows a hero mic. The loop is: record, transcribe with Whisper, send,
speak the reply, then listen again.

New pieces this needs:
- End-of-speech detection: an energy threshold plus silence timeout on the recorder's
  levels. No new dependency.
- Barge-in: tapping the mic stops speech. Core already calls `audioStop` on mic start.
- A residency rule so Whisper and the text model don't evict each other on every turn.
- `audioAugmentPrompt` asks for short spoken sentences without markdown, and is also wired
  into the shared prompt builder for retry/edit.

This slice is planned after slices 1, 3 and 4 because it carries the most device-specific
risk.

### 3. Actions with approval

**Approval framework** (`src/services/actions/`):
- Tools declare `requiresApproval: true`. `executeToolCallSafely` awaits
  `actionApprovalService.request(call)` before executing those. The service owns the pending
  request; a store projects it to an approval card rendered in the chat (a new component
  above the input, read through the store, never called from services).
- Approve runs the tool. Deny returns a "user declined" result so the model can answer
  gracefully. A user stop resolves any pending request as declined.
- LiteRT's native tool loop shows the card with the call's own name and arguments, since
  no "Using X" message exists yet. If LiteRT cannot tolerate a long await before
  `respondToToolCall`, approval-required tools are not offered on LiteRT; this is verified
  on device first.
- Cards show readable summaries ("New event: Dentist, Thu 5 Nov 10:00-10:30"), not raw JSON.

**Tools (built-in `AVAILABLE_TOOLS` entries, so they get toggles, schemas and hints):**
- `read_calendar_events(start, end)`: requests `READ_CALENDAR` the first time the tool
  is enabled. Reads `CalendarContract.Instances`, which expands recurring events, through
  our `FieldkitCalendar` module. Results are capped and trimmed. It is read-only, so it
  needs no approval card. The toggle explains that events are read on the phone and
  never sent anywhere.
- `create_calendar_event(title, start, end, location?, notes?, allDay?)`: approval card,
  then `Intent.ACTION_INSERT` opens the Calendar app's own pre-filled "new event" form, where
  the user saves or cancels. No `WRITE_CALENDAR`. The result says "Opened in Calendar",
  never "Saved", because Android does not report the outcome.
- `draft_email(to?, subject, body)`: the approval card shows the draft; approve opens a
  `mailto:` URL encoded per RFC 6068 (`\r\n` line breaks, `%20` spaces), kept to a few
  KB. If no mail app opens, it copies the draft and offers the share sheet.
- Tool result bubbles get proper Feather icons and labels for the new tools.
- Remove `react-native-calendar-events`, the `WRITE_CALENDAR` permission and its knip entry.

### 4. Personas

Personas are Projects with more personality. No parallel entity is created.
- New optional `Project` fields: `voiceId?`, `speechRate?`, and `icon` normalized to a
  Feather icon name; old hex/emoji values map to a default.
- `projectStore` gains a `merge` that backfills new fields, the house pattern from
  `appStore`, with no version bump.
- `ProjectEditScreen` gains an icon picker and a voice picker (the shared VoicePanel list).
  Spotlight anchors 7/8 and the onboarding "create a project" step stay as they are.
- Lists show the persona's icon instead of the first letter.
- `speechService` uses the active conversation's project voice when one is set, else the
  default voice.
- Memory (later, separate small design): a user-visible list of facts per persona, added only
  through an approved `remember` action, stored with the project and deleted with it, and
  injected as stable text in the system prompt (it changes rarely, so LiteRT resets stay
  rare).

### 5. MCP servers (last; gets its own short design pass when reached)

The SDK v1 (MIT) is already installed; v2 (Apache-2.0) supports newer servers. Both need:
- An XHR-based streaming fetch adapter.
- Polyfills: `web-streams-polyfill` (MIT) and a small `TextDecoder`/`TextDecoderStream`.
- `CfWorkerJsonSchemaValidator`.

Rules:
- Off by default. Private-network endpoints only. Redirects to other hosts refused.
- Each server shows host:port and an unencrypted-connection warning, and the chat shows
  which server tools are active.
- Every MCP tool call goes through the approval card.
- The About screen's privacy line gains "unless you connect a server on your network".
- Extension id `mcp` (the core router keys on it). The screen gets a new name, and the
  "Pro Tools" crown rows become "MCP servers" with a Feather icon.

### 6. Optional neural voice (later; needs an owner decision before shipping)

- **Runtime:** sherpa-onnx 2.0.1 (Apache-2.0) dropped espeak-ng on 2026-10-20, so
  Kokoro-82M (Apache-2.0 weights) can run GPL-free through its lexicon.
- **Gaps:**
  - It silently drops numbers and unknown words, so we would need our own text normalizer
    and an unknown-word fallback.
  - Part of the English lexicon ("silver") was generated by running espeak-ng (GPL) over
    a word list. Whether that output carries GPL terms is unresolved upstream (misaki
    issue #107).
  - The download is about 170 MB.
- **If pursued:** a downloadable engine behind `SpeechEngine`, registered as a `tts:`
  download provider. It never bundles the archive's `espeak-ng-data/` folder, and its
  licenses go in `NATIVE`.

## Build order (each slice is usable on its own)

1. Feature bootstrap plus voice replies: the Speak button, voice settings with the offline
   voice list, and stop.
2. Auto-speak while replies stream.
3. Approval framework plus `draft_email` (no native code).
4. Calendar read and create (native module).
5. Personas: icon and voice per project.
6. Hands-free voice mode.
7. MCP servers.
8. Optional neural voice.

Slices 1 and 4 add Kotlin, so they depend on how native code is landed (Open decisions).
Slice 3 is pure TypeScript and can go first if native landing is not ready.

## Verification

- Jest: one rendered test per slice in the new folders, using native fakes added to
  `nativeBoundary.ts` (`FieldkitSpeech`, `FieldkitCalendar`), plus `Linking` and
  `PermissionsAndroid` seeding.
- Every commit runs `tsc`, eslint on changed files, depcruise and knip. Push only through
  the pre-push hook.
- On the S24 Ultra, for each native slice:
  - Which engine binds (Google vs Samsung).
  - That only offline voices are listed, and that speech works in airplane mode.
  - Audio focus behavior with music playing.
  - That the Samsung and Google Calendar insert forms receive every field.
  - That Gmail and Samsung Email receive subject and body.

## My calls (owner can override)

- Android system TTS first; neural voice deferred.
- Our own Kotlin modules instead of the libraries above; no new npm dependencies until MCP.
- Personas extend Projects. The tab keeps the name "Projects" for now.
- Calendar writes go through the Calendar app's form, never a direct write; email through
  the mail app.
- Approval for every action that writes or sends; reads need only the permission prompt
  and the tool toggle.
- Build order above, with MCP and the neural voice last.

## Open decisions (owner)

1. How to land native Kotlin code (needed for slices 1, 4 and 6). This blocks only those
   slices; work starts on slice 3 either way.
2. Whether "Projects" should be renamed to "Assistants" or "Personas" in the UI.
3. (Later, before slice 8) whether the misaki lexicon provenance question is acceptable.

## Left to the builder

File and component names within the folders above, layout within the theme tokens,
sentence-splitting rules, exact card copy, the end-of-speech thresholds (tuned on device),
and test structure within the testing rules.
