# Actions With Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The assistant can draft an email, read the device calendar and prepare a calendar event. Every write or send waits for the user's tap on an approval card, and private calendar data never reaches a remote model.

**Architecture:**
- Tools declare `requiresApproval` and `handlesPrivateData` on `ToolDefinition`.
- A service-level tool-offering module decides which tools a turn may use: engine capability, remote model, module availability and the conversation's private-data state.
- `executeToolCallSafely` asks `actionApprovalService` before running gated calls. A store projects pending requests to a card in the chat.
- Calendar access is a first-party Kotlin module `FieldkitCalendar`. Reads go through `CalendarContract.Instances`, and writes through the Calendar app's own `ACTION_INSERT` form.

**Tech Stack:** React Native 0.83.1, TypeScript, zustand 5, Kotlin 2.2 legacy bridge module, Jest + RNTL rendered tests (`__tests__/harness/chatHarness.ts`, `remoteHarness.ts`), Robolectric 4.13.

**Spec:** `docs/superpowers/specs/2026-11-03-pro-features-design.md` (section 3, "Private data and remote models", "Owner decisions" 3, build-order slices 3-4).

## Global Constraints

- Approval-required tools: `draft_email`, `create_calendar_event`, and `web_search`/`read_url` once the conversation `containsPrivateData`. Private-data tools: exactly `read_calendar_events`. `search_knowledge_base` is not private data.
- Calendar writes only through `Intent.ACTION_INSERT` (no `WRITE_CALENDAR`). Results say "Opened in Calendar", never "Saved". Email only through a `mailto:` URL (RFC 6068: `\r\n` encoded as `%0D%0A`, spaces as `%20`), kept under 4000 characters.
- No new npm dependencies. Remove `react-native-calendar-events`, its knip `ignoreDependencies` entry and `WRITE_CALENDAR`, then rerun `node scripts/gen-notices.js` (from PowerShell) and commit `src/generated/thirdPartyNotices.json`.
- New tools are off by default and are not added to existing installs' `enabledTools`.
- Policy lives in services (`src/services/tools/toolOffering.ts`, `src/services/actions/`), never in screens or hooks. Callers never branch on engine type; they read `EngineCapabilities.supportsToolApproval`.
- UI: theme tokens only, font weight <= 400, Feather icons, no emoji. ESLint max-params 3, max-lines 500, complexity 20. Tests go in `__tests__/integration/actions/`. Every commit passes tsc, eslint on changed files, depcruise and knip; push only through the hook.

## Review Focus

1. The user taps Stop while an approval card is showing: the card disappears, the action never runs, and a later turn is unaffected (Task 2 test `stop declines`).
2. The model emits the same approval tool twice (sticky scripts, or 3 loop iterations): one card at a time, and a second card only after the first resolves (Task 2 test `one card at a time`).
3. An email body with newlines, `&`, `+`, `#`, `=` and non-ASCII text: the mail app receives it intact (Task 1 test `encodes the draft`). An over-long body is truncated with a note (Task 3 test `long draft`).
4. Calendar permission denied: the tool stays off with an explanation, and a read call without permission returns an error result instead of crashing (Task 5 test `permission denied`).
5. A private-data conversation through regenerate/edit, or through image-prompt enhancement, on a remote model: refused there too, not only on send (Task 6 test `refuses every remote path`).

---

### Task 1: Approval framework and `draft_email`

**Files:**
- Modify: `src/services/tools/types.ts` (`ToolDefinition` gains `requiresApproval?: boolean`, `handlesPrivateData?: boolean`, `requiredModule?: 'calendar'`; `ToolErrorCategory` gains `'declined'`)
- Modify: `src/services/tools/toolResult.ts` (`toolDeclinedResult(call: ToolCall, startMs: number): ToolResult`; a `toolResultModelContent` branch for `'declined'`: "The user declined this action. It was not done. Do not try it again unless the user asks.")
- Modify: `src/services/tools/registry.ts` (add `draft_email`), `src/services/tools/handlers.ts` (add the `draft_email` case)
- Create: `src/utils/mailto.ts`
- Create: `src/services/tools/toolOffering.ts`
- Create: `src/services/actions/actionApprovalService.ts`, `src/stores/actionApprovalStore.ts`, `src/components/ActionApprovalCard.tsx`
- Modify: `src/services/generationToolLoop.ts` (`executeToolCallSafely` ~line 279 and the offering step ~line 857)
- Modify: `src/screens/ChatScreen/ChatMessageArea.tsx` (mount `<ActionApprovalCard />` above the input wrapper View, ~line 285)
- Modify: `src/components/ChatMessage/index.tsx` (`getToolIcon`/`getToolLabel`: `draft_email` -> `mail`, "Email draft")
- Modify: `__tests__/utils/testHelpers.ts` (reset `useActionApprovalStore`)
- Test: `__tests__/integration/actions/draftEmailApproval.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `buildMailtoUrl(draft: { to?: string; subject: string; body: string }): { url: string; truncated: boolean }`: RFC 6068, body capped so the whole URL stays under 4000 characters
  - `approvalRequired(input: { toolName: string; conversationId: string | null }): boolean`. In this task: true for any tool whose definition has `requiresApproval`. Task 6 extends it.
  - `offeredToolIds(input: { enabledToolIds: string[]; conversationId: string | null; supportsToolApproval: boolean }): string[]` drops approval-required tools when `supportsToolApproval` is false. Task 5 adds module availability, and Task 6 adds the remote rule.
  - `ApprovalSummary { title: string; lines: string[] }`. For `draft_email`: title "Email draft", lines `To: ...`, `Subject: ...` and the first 3 body lines.
  - `actionApprovalService.request(input: { call: ToolCall; conversationId: string; summary: ApprovalSummary }): Promise<'approved' | 'declined'>`, `resolve(input: { id: string; decision: 'approved' | 'declined' }): void`, `declineConversation(conversationId: string): void`. Requests queue in call order per conversation, and only the head is shown. Log prefix `[APPROVAL-SM]`.
  - `useActionApprovalStore`, not persisted: `pending: { id: string; conversationId: string; toolName: string; summary: ApprovalSummary }[]`. Written only by the service.
  - `ActionApprovalCard: React.FC`, which reads the store for the active conversation's head request. testIDs `approval-card`, `approval-approve`, `approval-decline`.

Gate in `executeToolCallSafely`:
- If `approvalRequired(call)`, then:
  - with `!supportsToolApproval`, return `toolDeclinedResult` immediately with no card (prevents LiteRT's 30 s ghost call);
  - otherwise `await actionApprovalService.request(...)`.
- If declined, return `toolDeclinedResult`.
- After an approved request resolves, re-check that the turn is still live. Compare the conversation and a turn token captured before awaiting; do not use the shared `abortRequested` flag, which resets on the next turn. If the turn is gone, decline.

- [ ] **Step 1: Write the failing rendered test**

```ts
// llama engine (the JS tool loop); Linking.openURL seeded: require('react-native').Linking.openURL = jest.fn().mockResolvedValue(true)
it('approve opens the mail app with the draft', async () => {
  const h = await setupChatScreen({ engine: 'llama' });
  h.enableToolViaUI('draft_email'); h.render();
  await h.send('email bob', { text: 'Drafting. <tool_call>{"name": "draft_email", "arguments": {"to": "bob@example.com", "subject": "Hi & bye", "body": "Line one\nLine two = 2+2 #1"}}</tool_call>' });
  await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
  expect(h.view!.getByText(/Subject: Hi & bye/)).toBeTruthy();
  h.boundary.llama!.scriptCompletion({ text: 'I opened a draft in your mail app.' });
  h.rtl.fireEvent.press(h.view!.getByTestId('approval-approve'));
  await h.rtl.waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(
    'mailto:bob@example.com?subject=Hi%20%26%20bye&body=Line%20one%0D%0ALine%20two%20%3D%202%2B2%20%231'));
});
it('decline does nothing and tells the model', async () => { /* same as above, press approval-decline -> Linking.openURL not called; the tool result bubble shows the declined text; no approval-card left */ });
it('encodes the draft', async () => { /* body 'Café ünïcode' -> URL contains 'Caf%C3%A9%20%C3%BCn%C3%AFcode' */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/draftEmailApproval.rendered.test.tsx`
Expected: FAIL, no `tool-picker-row-draft_email`.

- [ ] **Step 3: Implement the types, `toolDeclinedResult`, `buildMailtoUrl`, `draft_email`, `toolOffering`, the approval service, store and card, the gate, and the mount** per the Interfaces above.

- [ ] **Step 4: Run the test, the existing tool tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/integration/happy/tools.happy.test.tsx __tests__/rntl/screens/ToolsScreen.test.tsx && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/tools src/utils/mailto.ts src/services/actions src/stores/actionApprovalStore.ts src/components/ActionApprovalCard.tsx src/services/generationToolLoop.ts src/screens/ChatScreen/ChatMessageArea.tsx src/components/ChatMessage/index.tsx __tests__/utils/testHelpers.ts __tests__/integration/actions
git commit -m "feat(actions): approval card before tools that send, starting with email drafts"
```

---

### Task 2: Approval lifecycle and LiteRT

**Files:**
- Modify: `src/services/engines.ts` (`EngineCapabilities.supportsToolApproval: boolean`, set in `deriveEngineCapabilities`: `false` for `litert`, `true` for llama and remote)
- Modify: the stop path (`handleStopFn` in `src/screens/ChatScreen/useChatGenerationActions.ts` ~line 562 delegates to the service; `generationService.stopGeneration`): call `actionApprovalService.declineConversation(conversationId)`
- Modify: `src/stores/chatStore.ts` `deleteConversation`: call `declineConversation` through a lazy require, the chatStore.ts:46 pattern
- Modify: `src/services/generationToolLoop.ts` (pass `supportsToolApproval` from the active engine capabilities into the gate and `offeredToolIds`)
- Test: `__tests__/integration/actions/approvalLifecycle.rendered.test.tsx`

**Interfaces:**
- Consumes: Task 1 `actionApprovalService`, `offeredToolIds` and `approvalRequired`.
- Produces: `EngineCapabilities.supportsToolApproval`.

- [ ] **Step 1: Write the failing test**

```ts
it('stop declines', async () => { /* card showing -> press the input stop button -> no approval-card; Linking.openURL never called; the next send works normally */ });
it('one card at a time', async () => { /* sticky llama script with two draft_email calls -> exactly one approval-card at a time; approve the first -> a second card appears only afterwards */ });
it('stays with its conversation', async () => { /* card showing in chat A -> create and open chat B: no approval-card -> return to A: the card shows again */ });
it('litert never shows a card', async () => { /* engine 'litert'; scripted toolCalls [{ name: 'draft_email', arguments: {...} }] -> no approval-card; the tool result bubble shows the declined text; openURL not called */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/approvalLifecycle.rendered.test.tsx`
Expected: FAIL on `stop declines` (the card remains) and `litert never shows a card`.

- [ ] **Step 3: Implement the capability flag, stop and delete declines, and the LiteRT wiring.**

- [ ] **Step 4: Run all action tests, the LiteRT tool tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/integration/chat/toolStringifiedArgs.rendered.redflow.test.tsx && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engines.ts src/screens/ChatScreen/useChatGenerationActions.ts src/services/generationService.ts src/stores/chatStore.ts src/services/generationToolLoop.ts __tests__/integration/actions/approvalLifecycle.rendered.test.tsx
git commit -m "feat(actions): approvals follow their chat, decline on stop, and are withheld on LiteRT"
```

---

### Task 3: Email fallback when no mail app opens

**Files:**
- Modify: `src/services/tools/handlers.ts` (`draft_email` case)
- Test: `__tests__/integration/actions/mailtoFallback.rendered.test.tsx`

**Interfaces:**
- Consumes: `buildMailtoUrl` (`truncated` flag).
- Produces: `draft_email` result content.
  - Opened: "Opened a draft in the mail app. The user sends it from there."
  - Truncated: the opened message plus " The body was shortened to fit; the full text was copied to the clipboard."
  - When `Linking.openURL` throws: the draft is copied with the app's existing `Clipboard.setString` import, `Share.share({ title: subject, message: body })` opens, and the content is "No mail app opened. The draft was copied and the share sheet was opened."

- [ ] **Step 1: Write the failing test**

```ts
it('falls back to copy and share', async () => { /* Linking.openURL = jest.fn().mockRejectedValue(new Error('no activity')); approve -> Clipboard.setString called with the body; Share.share called; the tool result bubble shows 'No mail app opened' */ });
it('long draft', async () => { /* 6000-character body -> openURL URL length < 4000; Clipboard holds the full body; the result mentions it was shortened */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/mailtoFallback.rendered.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the fallback and truncation messages.**

- [ ] **Step 4: Run the action tests and the gates, then push slice 3**

Run: `npx jest __tests__/integration/actions && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: PASS. Then:

```bash
git add src/services/tools/handlers.ts __tests__/integration/actions/mailtoFallback.rendered.test.tsx
git commit -m "feat(actions): copy and share the email draft when no mail app opens"
git push origin main
```

---

### Task 4: `FieldkitCalendar` native module

Requires Plan A Task 1 (local toolchain).

**Files:**
- Create: `android/app/src/main/java/ai/offgridmobile/calendar/FieldkitCalendarModule.kt`, `FieldkitCalendarPackage.kt`
- Modify: `MainApplication.kt` (`add(FieldkitCalendarPackage())`)
- Modify: `AndroidManifest.xml` (remove `WRITE_CALENDAR`; keep `READ_CALENDAR`; add `<uses-permission android:name="android.permission.WRITE_CALENDAR" tools:node="remove"/>` with the `tools` namespace so no library re-merges it)
- Modify: `package.json`, `package-lock.json` (uninstall `react-native-calendar-events` from PowerShell), `knip.json` (drop its `ignoreDependencies` entry), `src/generated/thirdPartyNotices.json` (regenerate)
- Test: `android/app/src/test/java/ai/offgridmobile/calendar/FieldkitCalendarModuleTest.kt`

**Interfaces:**
- Produces (JS-visible, `getName() = "FieldkitCalendar"`, trailing `Promise`):
  - `queryInstances(beginMs: Double, endMs: Double, limit: Double)` resolves `[{ id, title, begin: Double, end: Double, allDay: Boolean, location: String?, calendarName: String? }]` from `CalendarContract.Instances`, sorted by begin. It rejects `PERMISSION` without `READ_CALENDAR`.
  - `openInsertForm(event: ReadableMap)` takes `{ title, beginMs, endMs, location?, notes?, allDay? }`. It launches `Intent(Intent.ACTION_INSERT).setData(Events.CONTENT_URI)` with `EXTRA_EVENT_BEGIN_TIME`/`EXTRA_EVENT_END_TIME` as `Long`, plus `TITLE`, `EVENT_LOCATION`, `DESCRIPTION` and `EXTRA_EVENT_ALL_DAY`. It resolves `true`, or rejects `NO_CALENDAR_APP` on `ActivityNotFoundException`.
  - Companion: `internal data class InsertInput(val title: String, val beginMs: Long, val endMs: Long, val location: String?, val notes: String?, val allDay: Boolean)`, `internal fun buildInsertIntent(input: InsertInput): Intent` and `internal fun clampLimit(n: Int): Int` (1..50).

- [ ] **Step 1: Write the failing Robolectric test**

```kotlin
@Test fun `insert intent carries Long times and fields`() {
  val i = FieldkitCalendarModule.buildInsertIntent(InsertInput("Dentist", 1_700_000_000_000L, 1_700_001_800_000L, "Clinic", null, false))
  assertEquals(Intent.ACTION_INSERT, i.action)
  assertEquals(CalendarContract.Events.CONTENT_URI, i.data)
  assertEquals(1_700_000_000_000L, i.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, -1))
  assertEquals("Dentist", i.getStringExtra(CalendarContract.Events.TITLE))
}
@Test fun `limit is clamped`() { assertEquals(50, FieldkitCalendarModule.clampLimit(500)); assertEquals(1, FieldkitCalendarModule.clampLimit(0)) }
```

- [ ] **Step 2: Run it to verify it fails**

Run (Git Bash): `cd android && ./gradlew :app:testDebugUnitTest --tests "ai.offgridmobile.calendar.*"`
Expected: FAIL, unresolved reference.

- [ ] **Step 3: Implement the module, the registration, the manifest change, the dependency removal and the notices regeneration.**

- [ ] **Step 4: Run the gates**

Run (Git Bash): `cd android && ./gradlew :app:testDebugUnitTest --tests "ai.offgridmobile.calendar.*" && ./gradlew compileDebugKotlin --quiet && ./gradlew :app:lintDebug --quiet && cd .. && npm run knip`
Expected: PASS. `grep -c WRITE_CALENDAR android/app/src/main/AndroidManifest.xml` prints `1` (the remove marker only).

- [ ] **Step 5: Commit**

```bash
git add android package.json package-lock.json knip.json src/generated/thirdPartyNotices.json
git commit -m "feat(android): FieldkitCalendar module; drop react-native-calendar-events and WRITE_CALENDAR"
```

---

### Task 5: Calendar tools

**Files:**
- Create: `src/services/calendar/calendarService.ts`
- Create: `src/services/tools/toolPermissions.ts`
- Modify: `src/services/tools/types.ts` (`ToolDefinition` gains `requiredPermission?: 'calendar_read'`)
- Modify: `src/services/tools/registry.ts`
  - `read_calendar_events(start, end)`: ISO 8601 strings; `handlesPrivateData: true`, `requiredModule: 'calendar'`, `requiredPermission: 'calendar_read'`
  - `create_calendar_event(title, start, end, location?, notes?, all_day?)`: `requiresApproval: true`, `requiredModule: 'calendar'`
  - Both ids already match `TIME_SENSITIVE_TOOL_IDS`.
- Modify: `src/services/tools/handlers.ts`, `src/services/tools/toolOffering.ts` (drop tools whose `requiredModule` is not present)
- Modify: `src/screens/ToolsScreen/index.tsx`
  - Unavailable rows render disabled with "Not available on this device".
  - Enabling a tool with `requiredPermission` dispatches `toolPermissions.ensureForTool(id)` before `updateSettings`.
  - When permission is denied, the row stays off and shows "Calendar access was not allowed".
- Modify: `src/components/ChatMessage/index.tsx` (icons `calendar`; labels "Calendar", "New event")
- Modify: `__tests__/harness/nativeBoundary.ts`, `chatHarness.ts` (`calendar?: { events?: object[]; noApp?: boolean }`; a fake `FieldkitCalendar` that records `queryInstances` and `openInsertForm` calls)
- Test: `__tests__/integration/actions/calendarTools.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `calendarService.isPresent(): boolean`, `ensureReadPermission(): Promise<boolean>` (`PermissionsAndroid.request(READ_CALENDAR)`), `readEvents(range: { startIso: string; endIso: string }): Promise<CalendarEvent[]>` and `openNewEventForm(event: NewCalendarEvent): Promise<void>`
  - `toolPermissions.ensureForTool(toolId: string): Promise<boolean>`
  - The `read_calendar_events` result lists up to 50 events, one line each: `title, start-end (local time), location`. `create_calendar_event` returns "Opened in Calendar. The user saves or cancels it there."
  - The approval summary for `create_calendar_event` has the title "New event" and lines `<title>`, `<weekday d MMM HH:mm-HH:mm>` and `<location>`.

- [ ] **Step 1: Write the failing test**

```ts
it('reads events after permission', async () => { /* seed PermissionsAndroid.request -> granted; enable read_calendar_events via UI -> request called with READ_CALENDAR; scripted read call -> fake.queryInstances called with the ISO range as ms; the tool result lists the seeded event title */ });
it('permission denied', async () => { /* request -> denied -> the toggle stays off and the denial copy is visible; a scripted read call returns an error result bubble; no crash */ });
it('create opens the calendar form after approval', async () => { /* scripted create call -> approval-card shows 'New event' and the title; approve -> fake.openInsertForm called with beginMs/endMs numbers; the result says 'Opened in Calendar' */ });
it('unavailable without the module', async () => { /* setup without calendar -> the ToolsScreen row is disabled with 'Not available on this device'; the tools are not offered */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/calendarTools.rendered.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `calendarService`, `toolPermissions`, the tools, the offering rule, the ToolsScreen states and the harness fake.**

- [ ] **Step 4: Run all action tests, the ToolsScreen tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/rntl/screens/ToolsScreen.test.tsx && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/calendar src/services/tools src/screens/ToolsScreen src/components/ChatMessage/index.tsx __tests__/harness __tests__/integration/actions/calendarTools.rendered.test.tsx
git commit -m "feat(actions): read the device calendar and prepare events through the Calendar app"
```

---

### Task 6: Private data never reaches a remote model

**Files:**
- Modify: `src/types/index.ts` (`Conversation.containsPrivateData?: boolean`)
- Modify: `src/stores/chatStore.ts` (`markConversationPrivate(conversationId: string): void`, written like `setConversationProject`)
- Modify: `src/services/generationToolLoop.ts` (after an `ok` result from a `handlesPrivateData` tool, call `markConversationPrivate`)
- Modify: `src/services/tools/toolOffering.ts`
  - `offeredToolIds` gains `remoteActive: boolean` and drops `handlesPrivateData` tools when it is true.
  - `approvalRequired` returns true for `web_search` and `read_url` when the conversation `containsPrivateData`.
- Create: `src/services/privateDataGuard.ts`
- Modify: `src/services/generationService.ts` (the `isUsingRemoteProvider()` branches ~lines 158 and 177: call `assertRemoteAllowed` before any request), `src/services/imageGenerationService.ts` (the prompt-enhancement call before `generateStandalone`, ~lines 236/259)
- Modify: `src/screens/ChatScreen/useChatGenerationActions.ts` (`startGenerationFn` and `regenerateResponseFn` catch `PrivateDataRemoteError` and show the notice through `deps.setAlertState`)
- Modify: `src/screens/ToolsScreen/index.tsx` (copy for `read_calendar_events`: "Events are read on this phone and never sent anywhere. Hidden while a remote model is active.")
- Test: `__tests__/integration/actions/privateData.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `class PrivateDataRemoteError extends Error`
  - `isPrivateDataRemoteError(e: unknown): boolean`
  - `assertRemoteAllowed(conversationId: string | null): void`, which throws `PrivateDataRemoteError` when the conversation `containsPrivateData`
  - The notice is the alert "This chat contains calendar data" / "Calendar details read in this chat stay on your phone, so it can't be sent to a remote model." Its buttons are "Start a new chat" (`deps.createConversation(modelId, undefined, conversation?.projectId)`, as the context-full alert does) and "Choose a model" (opens the same model picker as the chat header).

- [ ] **Step 1: Write the failing test**

```ts
// Seed: a conversation with containsPrivateData: true (written to the persisted chat store before render), installRemoteModel(...) BEFORE h.render(), routeHolder.params = { conversationId }
it('refuses every remote path', async () => {
  const sendSpy = jest.spyOn((global as any).XMLHttpRequest.prototype, 'send');
  await h.tapSend('next question');
  await h.rtl.waitFor(() => h.view!.getByText(/This chat contains calendar data/));
  expect(sendSpy).not.toHaveBeenCalled();
  // regenerate path: h.regenerateLast(...) -> the same notice, still no send
  // enhancement path: call imageGenerationService's prompt enhancement for this conversation -> it throws PrivateDataRemoteError, no send
});
it('network tools need approval after a private read', async () => { /* llama; read_calendar_events then a scripted web_search call -> approval-card for 'web_search' appears */ });
it('private tool hidden on remote', async () => { /* remote model active -> read_calendar_events not in the offered tools (assert the outgoing request body tools list after a normal remote send in a clean chat) */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/privateData.rendered.test.tsx`
Expected: FAIL, no notice text.

- [ ] **Step 3: Implement the flag, the guard, the offering rules and the notice.** LiteRT note: once a LiteRT chat reads private data, `web_search`/`read_url` become approval-required and are therefore withheld. The resulting tool-set change triggers LiteRT's supported conversation reset with history replay (`litert.ts:234-240`).

- [ ] **Step 4: Run the whole action suite, the remote tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/integration/generation/remoteParallelTools.rendered.happy.test.tsx && npx tsc --noEmit && npm run depcruise && npm run knip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/stores/chatStore.ts src/services src/screens __tests__/integration/actions/privateData.rendered.test.tsx
git commit -m "feat(actions): keep calendar data off remote models"
```

---

### Task 7: On-device verification and push

- [ ] **Step 1: Build and install the release APK** (Plan A Task 7, Step 1).

- [ ] **Step 2: Run the device checklist with the owner, and record the results in `docs/superpowers/verification/2026-11-03-actions.md`**

- The Samsung Calendar and Google Calendar insert forms show the title, times, location and notes.
- Gmail and Samsung Email receive the recipient, subject and multi-line body.
- With no mail app set as default, the chooser appears, or the fallback copies the draft and opens the share sheet.
- The READ_CALENDAR prompt appears once, and a denial is explained.
- Stop during a pending card cancels it.

Expected: all pass. Failures become fix tasks with their own rendered tests.

- [ ] **Step 3: Commit the notes and push slice 4**

```bash
git add docs/superpowers/verification/2026-11-03-actions.md
git commit -m "docs: on-device verification of actions"
git push origin main
```
