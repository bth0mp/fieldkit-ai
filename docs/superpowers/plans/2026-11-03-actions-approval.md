# Actions With Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The assistant can draft an email, read the device calendar and prepare a calendar event. Every write or send waits for the user's tap on an approval card, and private calendar data never reaches a remote model.

**Architecture:**
- **Tool flags.** Tools declare `requiresApproval`, `handlesPrivateData`, `requiredModule` and `requiredPermission` on `ToolDefinition`.
- **Offering.** `src/services/tools/toolOffering.ts` decides once per turn which tools are offered: engine capability, remote model, module availability and the conversation's private-data state. `executeToolCallSafely` refuses any built-in tool that was not offered.
- **Approval.** Gated calls wait on `actionApprovalService`, keyed by conversation and checked against a per-turn token. A store projects pending requests to a card in the chat.
- **Calendar.** Access goes through a first-party Kotlin module `FieldkitCalendar`. Reads use `CalendarContract.Instances`; writes use the Calendar app's own `ACTION_INSERT` form.

**Tech Stack:** React Native 0.83.1, TypeScript, zustand 5, Kotlin 2.2 legacy bridge module, Jest + RNTL rendered tests (`__tests__/harness/chatHarness.ts`, `remoteHarness.ts`), Robolectric 4.13.

**Spec:** `docs/superpowers/specs/2026-11-03-pro-features-design.md` (section 3, "Private data and remote models", Owner decision 3, build-order slices 3-4).

## Global Constraints

- **Which tools are gated.** Approval-required: `draft_email`, `create_calendar_event`, and `web_search`/`read_url` once a conversation `containsPrivateData`. Private-data tools: exactly `read_calendar_events`. `search_knowledge_base` is not private data.
- **How writes and email happen.** Calendar writes only through `Intent.ACTION_INSERT` (no `WRITE_CALENDAR`); results say "Opened in Calendar", never "Saved". Email only through a `mailto:` URL (RFC 6068: line breaks as `%0D%0A`, spaces as `%20`), with the whole URL under 4000 characters.
- **Dependencies.** No new npm dependencies. Remove `react-native-calendar-events`, its knip `ignoreDependencies` entry and `WRITE_CALENDAR`, then regenerate notices with `node scripts/gen-notices.js` from PowerShell.
- **Defaults.** New tools are off by default and are not added to existing installs.
- **Where policy lives.** Only in services (`src/services/tools/`, `src/services/actions/`, `src/services/privateDataGuard.ts`), never in screens or hooks. Callers never branch on engine type; they read `EngineCapabilities.supportsToolApproval`. `actionApprovalService` imports `src/stores/actionApprovalStore.ts` by file, never the stores barrel, and never imports `generationService` or `generationToolLoop`.
- **UI and lint rules.** Theme tokens only, font weight <= 400, Feather icons, no emoji. ESLint max-params 3, max-lines 500 (`generationServiceHelpers.ts` is already at 500), complexity 20.
- **Tests.** They go in `__tests__/integration/actions/`. Read device fakes through `h.boundary.*` after `setupChatScreen`; it calls `jest.resetModules()`, so earlier imports and seeds are stale. Write text-scripted tool calls as `toolCallText(name, args)`, which uses `JSON.stringify`. A tool-result bubble shows its label until it is pressed; press `tool-result-label-<tool>` before asserting its content.
- **Before every commit:** `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run depcruise`, `npm run knip`, the task's tests, and `npx jest --findRelatedTests <changed src files>` (what the pre-push hook runs). Only the debug build `com.bth0mp.fieldkit.dev` goes on the owner's phone.

## Review Focus

1. The user taps Stop while an approval card shows, including while viewing another chat: the card disappears, the action never runs, the turn ends, and the next send works (Task 2 `stop declines`, `stop from another chat`).
2. The model emits the same approval tool twice: only one card at a time, and the second appears only after the first resolves (Task 2 `one card at a time`).
3. An email body with newlines, `&`, `+`, `#`, `=` and non-ASCII text reaches the mail app intact (Task 1 `encodes the draft`); an over-long body is shortened, with the full text copied (Task 3 `long draft`).
4. Calendar permission denied: the tool stays off, with an explanation. A read without permission returns an error result, not a crash (Task 5 `permission denied`).
5. Private calendar data stays off remote models on every path: send, regenerate, image-prompt enhancement, and a remote model calling the tool by name (Task 7 `refuses every remote path`, Task 6 `remote call by name is refused`).

---

### Task 1: Approval framework and `draft_email`

**Files:**
- Modify: `src/services/tools/types.ts`. `ToolDefinition` gains `requiresApproval?: boolean`, and `ToolErrorCategory` gains `'declined'`.
- Modify: `src/services/tools/toolResult.ts`.
  - Add `toolDeclinedResult(call: ToolCall, startMs: number): ToolResult`, returning `{ status: 'error', errorCategory: 'declined', error: 'declined by user', content: '' }`.
  - Add a `'declined'` branch to `toolResultModelContent`, before the generic error branch: "The user declined this action. It was not done. Do not try it again unless the user asks."
- Modify: `src/services/tools/registry.ts` (append `draft_email` at the END of `AVAILABLE_TOOLS`) and `src/services/tools/handlers.ts` (a one-line `draft_email` case calling `emailTool`)
- Create: `src/services/tools/emailTool.ts`, `src/utils/mailto.ts`, `src/services/tools/approvalSummary.ts`, `src/services/tools/toolOffering.ts`
- Create: `src/services/actions/actionApprovalService.ts`, `src/stores/actionApprovalStore.ts`, `src/components/ActionApprovalCard.tsx`
- Modify: `src/services/generationService.ts`. Add a `turnSeq = 0` field, and increment it in `stopGeneration`.
- Modify: `src/services/generationServiceHelpers.ts`.
  - In `prepareGenerationImpl`, increment `svc.turnSeq` after the `isGenerating` guard, next to `svc.abortRequested = false`.
  - In `buildToolLoopHandlersImpl`, capture `const turn = svc.turnSeq` and return `isTurnLive: () => svc.turnSeq === turn && !svc.abortRequested`.
  - Move `checkProviderReadiness` to `src/services/providerReadiness.ts` so the file stays at or under 500 lines.
- Modify: `src/services/generationToolLoop.ts`.
  - `ToolLoopContext` gains `isTurnLive?: () => boolean`.
  - The signature becomes `executeToolCallSafely(tc: ToolCall, ctx: ToolLoopContext)`; pass `ctx` at both call sites (~l.305 and ~l.493).
- Modify: `src/screens/ChatScreen/ChatMessageArea.tsx`. Mount `<ActionApprovalCard />` above the input wrapper View (~l.285).
- Modify: `src/components/ChatMessage/index.tsx`. In `getToolIcon`/`getToolLabel`, map `draft_email` to `mail` and "Email draft".
- Modify: `__tests__/harness/nativeBoundary.ts`.
  - After `const RN = require('react-native')`, seed `RN.NativeModules.ShareModule = { share: jest.fn(async () => ({ action: 'sharedAction' })) }`.
  - Expose `linking: RN.Linking`, `clipboard: RN.Clipboard` and `share: <that module>` on `NativeBoundary`.
- Modify: `__tests__/utils/testHelpers.ts` (reset `useActionApprovalStore`), `__tests__/unit/services/tools/registry.test.ts` (7 ids, ending in `draft_email`; assert `requiresApproval: true`), `__tests__/unit/services/generationToolLoop.branches.test.ts` (add `getMultimodalSupport: jest.fn(() => null)` and `supportsThinking: jest.fn(() => false)` to its llm mock if the gate's reads need them)
- Test: `__tests__/integration/actions/draftEmailApproval.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `buildMailtoUrl(draft: { to?: string; subject: string; body: string }): { url: string; truncated: boolean }`.
    - `to` is split on `,`; each address is `encodeURIComponent`'d with `%40` turned back into `@`, and the addresses are re-joined with `,`.
    - `subject` and `body` normalize `\r?\n` to `\r\n`, then `encodeURIComponent`.
    - The body is cut so the URL stays under 4000 characters.
    - With no `to`, the URL starts `mailto:?subject=`.
  - `approvalRequired(input: { toolName: string; conversationId: string | null }): boolean`. In this task it is true when the tool's definition has `requiresApproval`.
  - `approvalSummaryFor(call: ToolCall): ApprovalSummary`, where `ApprovalSummary { title: string; lines: string[] }`.
    - `draft_email`: title "Email draft", lines `To: ...`, `Subject: ...` and the first 3 body lines.
    - Fallback for any other tool: the tool's `displayName`, plus one `key: value` line per argument, each value clipped to 200 characters. Never raw JSON.
  - `actionApprovalService`:
    - `request(input: { call: ToolCall; conversationId: string; summary: ApprovalSummary }): Promise<'approved' | 'declined'>`, `resolve(input: { id: string; decision: 'approved' | 'declined' }): void` and `declineConversation(conversationId: string): void`.
    - Requests queue in call order per conversation. Log prefix `[APPROVAL-SM]`.
  - `useActionApprovalStore` (not persisted): `pending: { id: string; conversationId: string; toolName: string; summary: ApprovalSummary }[]`. Only the service writes it.
  - `ActionApprovalCard: React.FC` shows the head request whose `conversationId === useChatStore.activeConversationId`. testIDs `approval-card`, `approval-approve` and `approval-decline`. It calls `actionApprovalService.resolve`.
  - `emailTool.run(call: ToolCall): Promise<ToolResult>` opens the URL with `Linking.openURL`. Result: "Opened a draft in the mail app. The user sends it from there."
  - Gate in `executeToolCallSafely`:
    1. If `approvalRequired({ toolName: tc.name, conversationId: ctx.conversationId })`, await `actionApprovalService.request({ call, conversationId, summary: approvalSummaryFor(tc) })`.
    2. If declined, return `toolDeclinedResult`.
    3. After approval, if `!(ctx.isTurnLive?.() ?? !ctx.isAborted())`, return `toolDeclinedResult`.

- [ ] **Step 1: Write the failing rendered test** (llama engine, the JS tool loop)

```ts
const toolCallText = (name: string, args: Record<string, unknown>) => `<tool_call>${JSON.stringify({ name, arguments: args })}</tool_call>`;

it('approve opens the mail app with the draft', async () => {
  const h = await setupChatScreen({ engine: 'llama' });
  h.enableToolViaUI('draft_email'); h.render();
  await h.send('email bob', { text: 'Drafting. ' + toolCallText('draft_email', { to: 'bob@example.com', subject: 'Hi & bye', body: 'Line one\nLine two' }) });
  await h.rtl.waitFor(() => h.view!.getByTestId('approval-card'));
  expect(h.view!.getByText(/Subject: Hi & bye/)).toBeTruthy();
  h.boundary.llama!.scriptCompletion({ text: 'I opened a draft in your mail app.' }); // re-script before approving: scripts are sticky
  h.rtl.fireEvent.press(h.view!.getByTestId('approval-approve'));
  await h.rtl.waitFor(() => expect(h.boundary.linking.openURL).toHaveBeenCalledWith(
    'mailto:bob@example.com?subject=Hi%20%26%20bye&body=Line%20one%0D%0ALine%20two'));
});
it('decline does nothing and tells the model', async () => { /* press approval-decline -> h.boundary.linking.openURL not called; press tool-result-label-draft_email -> /The user declined this action/ visible; no approval-card */ });
it('encodes the draft', async () => { /* body 'A\nB & C + D # E = F Café' -> openURL arg ends with 'body=A%0D%0AB%20%26%20C%20%2B%20D%20%23%20E%20%3D%20F%20Caf%C3%A9' */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/draftEmailApproval.rendered.test.tsx`
Expected: FAIL, no `tool-picker-row-draft_email`.

- [ ] **Step 3: Implement** the types, result helper, `buildMailtoUrl`, `emailTool`, `approvalSummary`, `approvalRequired`, the approval service, store and card, the turn token, the gate, the mount, the icons and the harness device objects, per the Interfaces above.

- [ ] **Step 4: Run the tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/unit/services/tools/registry.test.ts __tests__/unit/services/generationToolLoop.branches.test.ts __tests__/integration/happy/tools.happy.test.tsx __tests__/rntl/screens/ToolsScreen.test.tsx`, then the Global Constraints gates.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/tools src/utils/mailto.ts src/services/actions src/stores/actionApprovalStore.ts src/components/ActionApprovalCard.tsx src/services/generationService.ts src/services/generationServiceHelpers.ts src/services/providerReadiness.ts src/services/generationToolLoop.ts src/screens/ChatScreen/ChatMessageArea.tsx src/components/ChatMessage/index.tsx __tests__/harness/nativeBoundary.ts __tests__/utils/testHelpers.ts __tests__/unit/services __tests__/integration/actions
git commit -m "feat(actions): approval card before tools that send, starting with email drafts"
```

---

### Task 2: Approval lifecycle, offering and LiteRT

**Files:**
- Modify: `src/services/engines.ts`. `EngineCapabilities.supportsToolApproval: boolean`, set in `deriveEngineCapabilities`:
  - `false` for `litert`, loaded or not;
  - `true` for llama and remote;
  - `false` for a new explicit no-engine branch, so it fails closed.
- Modify: `src/services/tools/toolOffering.ts`. Add `offeredToolIds(input: { enabledToolIds: string[]; conversationId: string | null; supportsToolApproval: boolean }): string[]`, which drops approval-required tools when `supportsToolApproval` is false.
- Modify: `src/services/generationToolLoop.ts`:
  - At the top of `runToolLoop`, replace `ctx.enabledToolIds` with `offeredToolIds(...)`, and store `ctx.offeredToolNames` (the names of the final effective schemas) and `ctx.supportsToolApproval` (from `activeTextCapabilities`).
  - In the gate:
    - a built-in tool whose name is not in `ctx.offeredToolNames` returns an error result "This tool is not available right now." without running;
    - an approval-required tool with `!ctx.supportsToolApproval` returns `toolDeclinedResult` at once, with no card.
  - Right after `await executeToolCalls(...)`, before `setIsThinking(true)` and the pause, add `if (ctx.isAborted() || !(ctx.isTurnLive?.() ?? true)) return { interrupted: true };`. Keep the declined tool-result messages: they pair with the stored tool-call message.
- Modify: `src/screens/ChatScreen/useChatGenerationActions.ts`. `resolveToolsAndPrompt` uses `offeredToolIds` for the text hint, so the hint never names a tool that is not offered.
- Modify: `src/services/generationService.ts`.
  - In `stopGeneration`'s `isGenerating` branch, before `resetState()` and before the remote early return, run `const convId = this.state.conversationId; if (convId) actionApprovalService.declineConversation(convId);`.
  - `generateWithTools` finalizes only when `!outcome.interrupted && isTurnLive()`.
  - `generateRemoteWithToolsImpl` reads the `ToolLoopOutcome` instead of discarding it.
- Modify: `src/stores/chatStore.ts`. `deleteConversation` calls `declineConversation` through a lazy require (the `projectStore.deleteProject` to `ragService` precedent).
- Modify: `__tests__/harness/chatHarness.ts`. Add `openChat(conversationId: string | null)`.
  - For `null`: set `routeHolder.params = {}` and rerender ChatScreen.
  - For an id: mount HomeScreen, press that conversation's `conversation-item-N` row, set `routeHolder.params = { conversationId }`, then rerender ChatScreen.
- Modify: `__tests__/unit/services/engineCapabilities.test.ts`. Add `supportsToolApproval` to all expected objects, and add a red-first case: litert is false whether loaded or not.
- Test: `__tests__/integration/actions/approvalLifecycle.rendered.test.tsx`

**Interfaces:**
- Consumes: Task 1 `actionApprovalService`, `approvalRequired` and the turn token.
- Produces: `EngineCapabilities.supportsToolApproval`, `offeredToolIds` and `ToolLoopContext.offeredToolNames`/`supportsToolApproval`. Tasks 5 to 7 extend `offeredToolIds`.

- [ ] **Step 1: Write the failing tests**

```ts
it('stop declines', async () => {
  // card showing -> press stop-button -> waitFor no stop-button; no approval-card; h.boundary.linking.openURL never called
  // immediately send the next message with a fresh script -> exactly one new assistant bubble; the llama completion mock ran once more; no approval-card after settle(700)
});
it('stop from another chat', async () => { /* card in A; capture A = h.conversationId; openChat(null); press stop-button; openChat(A) -> no approval-card; the tool-result label shows declined */ });
it('one card at a time', async () => { /* sticky script with draft_email twice -> exactly one approval-card; approve -> a second card appears only after */ });
it('stays with its conversation', async () => { /* card in A -> openChat(null): no approval-card -> openChat(A): card visible again */ });
it('delete declines', async () => { /* card in A; delete A from the chat's own delete menu; script one follow-up completion; openChat(null) and send -> it gets its reply; openURL never called */ });
it('litert never shows a card', async () => { /* engine 'litert'; scripted toolCalls [{ name: 'draft_email', arguments: {...} }] -> no approval-card; the tool-result label content shows declined or not available; openURL not called */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/approvalLifecycle.rendered.test.tsx`
Expected: FAIL on `stop declines`, `stop from another chat`, `delete declines` and `litert never shows a card`.

- [ ] **Step 3: Implement** the capability, `offeredToolIds`, the offered-names refusal, the post-execution check, the stop and delete declines, the finalize gating, the text-hint change and `openChat`.

- [ ] **Step 4: Run the tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/unit/services/engineCapabilities.test.ts __tests__/integration/happy/tools.happy.test.tsx __tests__/integration/chat/toolEmptyFinal.redflow.test.tsx __tests__/integration/chat/toolStringifiedArgs.rendered.redflow.test.tsx __tests__/integration/generation/stopMidTurnThenSend.rendered.redflow.test.tsx`, then the Global Constraints gates.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engines.ts src/services/tools/toolOffering.ts src/services/generationToolLoop.ts src/services/generationService.ts src/services/generationServiceHelpers.ts src/screens/ChatScreen/useChatGenerationActions.ts src/stores/chatStore.ts __tests__/harness/chatHarness.ts __tests__/unit/services/engineCapabilities.test.ts __tests__/integration/actions/approvalLifecycle.rendered.test.tsx
git commit -m "feat(actions): approvals follow their chat, end on stop or delete, and are withheld on LiteRT"
```

---

### Task 3: Email fallback when no mail app opens

**Files:**
- Modify: `src/services/tools/emailTool.ts`
- Test: `__tests__/integration/actions/mailtoFallback.rendered.test.tsx`

**Interfaces:**
- Consumes: `buildMailtoUrl` (`truncated`).
- Produces: `emailTool.run` result content:
  - When `truncated`, the opened message plus " The body was shortened to fit; the full text was copied to the clipboard." In that case it also calls `Clipboard.setString(body)`.
  - When `Linking.openURL` throws, it calls `Clipboard.setString(body)` and `Share.share({ title: subject, message: body })`, and the content is "No mail app opened. The draft was copied and the share sheet was opened."

- [ ] **Step 1: Write the failing test**

```ts
it('falls back to copy and share', async () => { /* after setup: h.boundary.linking.openURL.mockRejectedValueOnce(new Error('no activity')); approve -> h.boundary.clipboard.setString called with the body; h.boundary.share.share called with ({ title: subject, message: body }, undefined); the expanded tool result shows 'No mail app opened' */ });
it('long draft', async () => { /* 6000-character body -> openURL arg length < 4000; clipboard.setString called with the full body; the expanded result mentions it was shortened */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/mailtoFallback.rendered.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the fallback and the truncation messages.**

- [ ] **Step 4: Run the tests and the gates, then push slice 3**

Run: `npx jest __tests__/integration/actions`, then the Global Constraints gates.
Expected: PASS. Then:

```bash
git add src/services/tools/emailTool.ts __tests__/integration/actions/mailtoFallback.rendered.test.tsx
git commit -m "feat(actions): copy and share the email draft when no mail app opens"
git push origin main
```

---

### Task 4: `FieldkitCalendar` native module

Requires the local toolchain (voice plan, Task 1).

**Files:**
- Create: `android/app/src/main/java/ai/offgridmobile/calendar/FieldkitCalendarModule.kt` and `FieldkitCalendarPackage.kt`
- Modify: `MainApplication.kt` (`add(FieldkitCalendarPackage())`)
- Modify: `AndroidManifest.xml`. Remove `WRITE_CALENDAR`, keep `READ_CALENDAR`, add `<uses-permission android:name="android.permission.WRITE_CALENDAR" tools:node="remove"/>` and declare the `tools` namespace.
- Modify: `package.json` and `package-lock.json` (uninstall `react-native-calendar-events` from PowerShell), `knip.json` (drop its ignore entry), `src/generated/thirdPartyNotices.json` (regenerate)
- Delete: `__tests__/integration/tools/proToolsSplit.test.ts` and `__tests__/unit/services/tools/EmailCalendarExtension.test.ts`. They are pro-era suites that always skip, and their non-virtual `jest.mock('react-native-calendar-events')` fails to load once the package is gone.
- Test: `android/app/src/test/java/ai/offgridmobile/calendar/FieldkitCalendarModuleTest.kt`

**Interfaces:**
- Produces (JS-visible, `getName() = "FieldkitCalendar"`, trailing `Promise`):
  - `queryInstances(beginMs: Double, endMs: Double, limit: Double)` resolves `[{ id, title, begin: Double, end: Double, allDay: Boolean, location: String?, calendarName: String? }]` from `CalendarContract.Instances`, sorted by begin. It rejects `PERMISSION` without `READ_CALENDAR`.
  - `openInsertForm(event: ReadableMap)` takes `{ title, beginMs, endMs, location?, notes?, allDay? }`. It launches the insert intent, resolves `true`, and rejects `NO_CALENDAR_APP` on `ActivityNotFoundException`.
  - Top-level in the same file: `internal data class InsertInput(val title: String, val beginMs: Long, val endMs: Long, val location: String?, val notes: String?, val allDay: Boolean)`.
  - Companion: `internal fun buildInsertIntent(input: InsertInput): Intent` and `internal fun clampLimit(n: Int): Int` (range 1..50).
  - The insert intent is `Intent(Intent.ACTION_INSERT).setData(Events.CONTENT_URI)`, with `EXTRA_EVENT_BEGIN_TIME`/`EXTRA_EVENT_END_TIME` as `Long`, plus `TITLE`, `EVENT_LOCATION`, `DESCRIPTION` and `EXTRA_EVENT_ALL_DAY`.

- [ ] **Step 1: Write the failing Robolectric test**

```kotlin
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class FieldkitCalendarModuleTest {
  @Test fun `insert intent carries Long times and fields`() {
    val i = FieldkitCalendarModule.buildInsertIntent(InsertInput("Dentist", 1_700_000_000_000L, 1_700_001_800_000L, "Clinic", null, false))
    assertEquals(Intent.ACTION_INSERT, i.action)
    assertEquals(CalendarContract.Events.CONTENT_URI, i.data)
    assertEquals(1_700_000_000_000L, i.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, -1))
    assertEquals("Dentist", i.getStringExtra(CalendarContract.Events.TITLE))
  }
  @Test fun `limit is clamped`() { assertEquals(50, FieldkitCalendarModule.clampLimit(500)); assertEquals(1, FieldkitCalendarModule.clampLimit(0)) }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run (Git Bash): `cd android && ./gradlew :app:testDebugUnitTest --tests "ai.offgridmobile.calendar.*"`
Expected: FAIL, unresolved reference.

- [ ] **Step 3: Implement** the module, the registration and the manifest change, run the dependency removal and `git rm` the two suites, then regenerate notices. `ios/Podfile.lock` still lists `RNCalendarEvents`; it cannot be regenerated on Windows, so leave it as a known stale entry.

- [ ] **Step 4: Run the gates**

Run (Git Bash): `cd android && ./gradlew :app:testDebugUnitTest --tests "ai.offgridmobile.calendar.*" && ./gradlew compileDebugKotlin --quiet && ./gradlew :app:lintDebug --quiet && cd .. && npx jest __tests__/unit/services/tools && npm run knip`
Expected: PASS. `git grep -l react-native-calendar-events -- __tests__ src` prints nothing, and `grep -c WRITE_CALENDAR android/app/src/main/AndroidManifest.xml` prints `1` (the remove marker).

- [ ] **Step 5: Commit**

```bash
git add android package.json package-lock.json knip.json src/generated/thirdPartyNotices.json
git commit -m "feat(android): FieldkitCalendar module; drop react-native-calendar-events and WRITE_CALENDAR"
```

---

### Task 5: Read the calendar

**Files:**
- Modify: `src/services/tools/types.ts`. `ToolDefinition` gains `handlesPrivateData?: boolean`, `requiredModule?: 'calendar'`, `requiredPermission?: 'calendar_read'` and `userNote?: string`.
- Create: `src/services/calendar/calendarService.ts`, `src/services/tools/calendarTools.ts` and `src/services/tools/toolPermissions.ts`
- Modify: `src/services/tools/registry.ts`. Append `read_calendar_events(start, end)` (ISO 8601) with:
  - `handlesPrivateData: true`, `requiredModule: 'calendar'`, `requiredPermission: 'calendar_read'`
  - `userNote: 'Events are read on this phone and never sent anywhere. Hidden while a remote model is active.'`
- Modify: `src/services/tools/handlers.ts` (one-line case), `src/services/tools/toolOffering.ts` (`toolAvailability`; `offeredToolIds` drops unavailable tools)
- Modify: `src/screens/ToolsScreen/index.tsx`.
  - Toggling calls only `toolPermissions.setToolEnabled({ toolId, enabled: !enabledTools.includes(toolId) })`. This keeps today's flip semantics: the switch value is ignored, and `h.enableToolViaUI` and existing suites such as `staleFailureCardClearedOnNewSend` rely on it. The screen keeps the last `'denied'` as local UI state.
  - Rows with `available: false` render disabled with "Not available on this device".
  - Rows show `tool.userNote` when set.
  - Denial copy: "Calendar access was not allowed".
- Modify: `src/screens/ChatScreen/useChatScreen.ts` (~l.329-331). Route its tool toggle through `toolPermissions.setToolEnabled`.
- Modify: `src/components/ChatMessage/index.tsx` (icon `calendar`, label "Calendar")
- Modify: `__tests__/harness/nativeBoundary.ts` and `chatHarness.ts`. Add `calendar?: { events?: object[]; noApp?: boolean; permission?: 'granted' | 'denied' }`: a fake `FieldkitCalendar` that records `queryInstances`/`openInsertForm`, plus `PermissionsAndroid.request`/`check` stubbed after the reset.
- Modify: `__tests__/unit/services/tools/registry.test.ts` (8 ids, ending in `read_calendar_events`; assert `handlesPrivateData`)
- Test: `__tests__/integration/actions/calendarRead.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `calendarService.isPresent(): boolean`, `ensureReadPermission(): Promise<boolean>`, `readEvents(range: { startIso: string; endIso: string }): Promise<CalendarEvent[]>` and `openNewEventForm(event: NewCalendarEvent): Promise<void>`
  - `toolAvailability(toolId: string): { available: boolean; reason?: 'module-missing' }`. It owns the mapping from `requiredModule` to `calendarService.isPresent()`.
  - `toolPermissions.setToolEnabled(input: { toolId: string; enabled: boolean }): Promise<'enabled' | 'disabled' | 'denied' | 'unavailable'>`.
    - Disabling never prompts.
    - Enabling an unavailable tool returns `'unavailable'` and writes nothing.
    - It requests `requiredPermission` only when enabling, and calls `useAppStore.getState().updateSettings` itself.
  - `read_calendar_events` result: up to 50 events, one line each: `title, start-end (local time), location`.

- [ ] **Step 1: Write the failing test**

```ts
it('reads events after permission', async () => { /* calendar: { permission: 'granted', events: [{ title: 'Dentist', ... }] }; enable via UI -> PermissionsAndroid.request called with READ_CALENDAR; scripted read call -> fake.queryInstances called with ms numbers; press tool-result-label-read_calendar_events -> 'Dentist' visible */ });
it('permission denied', async () => { /* permission 'denied' -> the toggle stays off and 'Calendar access was not allowed' is visible; a scripted read call gives an error result; no crash */ });
it('unavailable without the module', async () => { /* setup without calendar -> the row is disabled with 'Not available on this device'; not offered */ });
it('note is not sent to the model', async () => { /* the built tool hint and schema do not contain the userNote text */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/calendarRead.rendered.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `calendarService`, `calendarTools` (read), `toolPermissions`, `toolAvailability`, the ToolsScreen states and the harness fake.

- [ ] **Step 4: Run the tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/unit/services/tools/registry.test.ts __tests__/rntl/screens/ToolsScreen.test.tsx`, then the Global Constraints gates.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/calendar src/services/tools src/screens/ToolsScreen src/screens/ChatScreen/useChatScreen.ts src/components/ChatMessage/index.tsx __tests__/harness __tests__/unit/services/tools/registry.test.ts __tests__/integration/actions/calendarRead.rendered.test.tsx
git commit -m "feat(actions): read the device calendar on the phone"
```

---

### Task 6: Prepare calendar events, and private data inside the tool loop

**Files:**
- Modify: `src/services/tools/registry.ts`. Append `create_calendar_event(title, start, end, location?, notes?, all_day?)` with `requiresApproval: true` and `requiredModule: 'calendar'`.
- Modify: `src/services/tools/calendarTools.ts`, `handlers.ts` and `approvalSummary.ts`. Summaries:
  - `create_calendar_event`: title "New event", lines `<title>`, `<weekday d MMM HH:mm-HH:mm>` and `<location>`.
  - `web_search`: title "Web search", lines `Query: <query>`.
  - `read_url`: title "Open web page", lines `URL: <url>`.
  - The query and URL are shown in full, word-wrapped; if longer than 500 characters, they are cut with "(shortened)".
- Modify: `src/types/index.ts` (`Conversation.containsPrivateData?: boolean`) and `src/stores/chatStore.ts` (`markConversationPrivate(conversationId: string): void`, written like `setConversationProject`)
- Modify: `src/services/generationToolLoop.ts`. In `executeToolCallSafely`, after an `ok` result from a `handlesPrivateData` tool, call `markConversationPrivate(ctx.conversationId)`. This covers both the JS loop and the LiteRT handler. When the turn is remote, a `handlesPrivateData` tool returns the error "Not available while a remote model is active." without running.
- Modify: `src/services/tools/toolOffering.ts`.
  - `offeredToolIds` gains `remoteActive: boolean` and drops `handlesPrivateData` tools when it is true.
  - `approvalRequired` is also true for `web_search` and `read_url` when the conversation `containsPrivateData`. Read it defensively: `conversations?.find(...)?.containsPrivateData === true`.
- Modify: `src/components/ChatMessage/index.tsx` (`create_calendar_event` -> icon `calendar`, label "New event")
- Modify: `__tests__/unit/services/tools/registry.test.ts` (9 ids)
- Test: `__tests__/integration/actions/calendarCreatePrivate.rendered.test.tsx`

**Interfaces:**
- Consumes: Task 5 `calendarService`; Task 2 `offeredToolIds` and the gate.
- Produces: `create_calendar_event` result "Opened in Calendar. The user saves or cancels it there.", `markConversationPrivate` and the extended offering rules.

- [ ] **Step 1: Write the failing test**

```ts
it('create opens the calendar form after approval', async () => { /* scripted create call -> approval-card shows 'New event' and the title; approve -> fake.openInsertForm called with beginMs/endMs numbers; expanded result shows 'Opened in Calendar' */ });
it('network tools need approval after a private read', async () => { /* llama; ONE completion with toolCallText('read_calendar_events', ...) then toolCallText('web_search', { query: 'Dentist Thursday' }) -> the chat is marked private; an approval-card with 'Web search' and 'Query: Dentist Thursday' appears */ });
it('remote call by name is refused', async () => { /* remote model active, read_calendar_events enabled, permission granted, a seeded event; installRemoteStream([TOOL_SSE calling read_calendar_events, REPLY_SSE]) -> fake.queryInstances not called; the second request body does not contain the event title; expanded result shows 'Not available while a remote model is active.' */ });
it('litert private read withholds network tools', async () => { /* litert; turn 1 calls read_calendar_events -> chat marked private; turn 2 (a separate send) -> the latest litert resetConversation tools JSON lacks web_search and read_url; a scripted web_search call shows no approval-card and gives a declined or not-available result */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/calendarCreatePrivate.rendered.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the create tool, the summaries, the private flag, the in-gate private-data refusal and the offering rules.

- [ ] **Step 4: Run the tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/unit/services/tools/registry.test.ts __tests__/unit/services/generationToolLoop.branches.test.ts __tests__/integration/generation/remoteParallelTools.rendered.happy.test.tsx`, then the Global Constraints gates.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/tools src/types/index.ts src/stores/chatStore.ts src/services/generationToolLoop.ts src/components/ChatMessage/index.tsx __tests__/unit/services/tools/registry.test.ts __tests__/integration/actions/calendarCreatePrivate.rendered.test.tsx
git commit -m "feat(actions): prepare calendar events; keep calendar data out of remote tool calls"
```

---

### Task 7: A private chat is never sent to a remote model

**Files:**
- Create: `src/services/privateDataGuard.ts`
- Modify: `src/services/generationService.ts`. Call `assertRemoteAllowed(conversationId)` in the `isUsingRemoteProvider()` branches (~l.158 and ~l.177), before any request.
- Modify: `src/services/engines.ts`.
  - Export `standaloneUsesRemote(): boolean` (`isRemoteTextModelActive() && getActiveEngineService() !== liteRTService`) and have `generateStandalone` use it.
  - The signature becomes `generateStandalone(messages, onToken?, opts?: { conversationId?: string })`, with `assertRemoteAllowed(opts?.conversationId ?? null)` as the first statement of the remote branch.
- Modify: `src/services/imageGenerationService.ts`.
  - In `_enhancePrompt`, pass `{ conversationId: params.conversationId }` to `generateStandalone`.
  - In its catch, keep the cleanup and the original prompt. When `isPrivateDataRemoteError(error)`, also call `this._noticeEnhancementSkipped('this chat contains calendar data, which stays on your phone')`.
- Modify: `src/screens/ChatScreen/useChatGenerationActions.ts`.
  - Add `showPrivateDataNotice(deps: GenerationDeps, conversation: Conversation | undefined): void`.
  - The first statement of the catch in `startGenerationFn` and in `regenerateResponseFn` is `if (isPrivateDataRemoteError(error)) { showPrivateDataNotice(deps, conversation); generationSession.end('error'); return; }`.
- Modify: `GenerationDeps` and `src/screens/ChatScreen/useChatScreen.ts`. Pass `setShowModelSelector`, and move `modelSelectorTab` into `useChatScreen` so the notice can set it to `'text'`.
- Test: `__tests__/integration/actions/privateRemote.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `isConversationPrivate(conversationId: string | null): boolean`
  - `class PrivateDataRemoteError extends Error` (with `name = 'PrivateDataRemoteError'`)
  - `isPrivateDataRemoteError(e: unknown): boolean`, which checks `e?.name`, because module resets break `instanceof`
  - `assertRemoteAllowed(conversationId: string | null): void`
  - The notice is an alert, title "This chat contains calendar data", body "Calendar details read in this chat stay on your phone, so it can't be sent to a remote model." Buttons:
    - "Start a new chat": `createConversation`, then `setActiveConversation`, as the context-full alert does
    - "Use the on-device model": opens ModelSelectorModal on its Text tab

- [ ] **Step 1: Write the failing test** (order for every remote test: `setupChatScreen`, then `installRemoteModel({ caps: { supportsToolCalling: true } })`, then `installRemoteStream(REPLY_SSE)`, then `const sendSpy = jest.spyOn((global as any).XMLHttpRequest.prototype, 'send')`, then `h.render()`. Seed the private conversation (one user and one assistant message, `containsPrivateData: true`) in the persisted chat store before render, with `routeHolder.params = { conversationId }`.)

```ts
it('refuses every remote path', async () => {
  await h.tapSend('next question');
  await h.rtl.waitFor(() => h.view!.getByText(/This chat contains calendar data/));
  expect(sendSpy).not.toHaveBeenCalled();
  // regenerate: h.regenerateLast(...) -> the same notice, still no send
  // enhancement: settings.enhanceImagePrompts true, h.placeImageModel(), h.cycleImageMode(), h.tapSend('draw it') -> no send; the image generator receives the original prompt; 'Prompt enhancement skipped' visible; no 'Enhancing your prompt' left
  // press 'Use the on-device model' -> the model selector shows its Text tab
});
it('private tool hidden on remote', async () => { /* clean chat; enable read_calendar_events and calculator; send -> JSON.parse(sendSpy.mock.calls[0][0]).tools names include 'calculator' and exclude 'read_calendar_events' */ });
it('local enhancement still runs in a private chat', async () => { /* no remote model; private chat; image turn -> enhancement runs (the llama completion is called for the rewrite) */ });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/integration/actions/privateRemote.rendered.test.tsx`
Expected: FAIL, no notice text.

- [ ] **Step 3: Implement** the guard, the three call sites, the notice and the deps change.

- [ ] **Step 4: Run the tests and the gates**

Run: `npx jest __tests__/integration/actions __tests__/integration/generation/remoteParallelTools.rendered.happy.test.tsx`, then the Global Constraints gates.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/privateDataGuard.ts src/services/generationService.ts src/services/engines.ts src/services/imageGenerationService.ts src/screens/ChatScreen __tests__/integration/actions/privateRemote.rendered.test.tsx
git commit -m "feat(actions): never send a chat with calendar data to a remote model"
```

---

### Task 8: On-device verification and slice 4 push

- [ ] **Step 1: Build and install the debug build** (voice plan, Task 1 Step 7).

- [ ] **Step 2: Run the device checklist with the owner, and record the results in `docs/superpowers/verification/2026-11-03-actions.md`**

- The Samsung Calendar and Google Calendar insert forms show the title, times, location and notes.
- Gmail and Samsung Email receive the recipient, subject and multi-line body.
- With no mail app as the default, the chooser appears, or the fallback copies the draft and opens the share sheet.
- The READ_CALENDAR prompt appears once, and a denial is explained.
- Stop during a pending card cancels it.

Expected: all pass. Failures become fix tasks with their own tests before the push.

- [ ] **Step 3: Commit the notes and push slice 4**

```bash
git add docs/superpowers/verification/2026-11-03-actions.md
git commit -m "docs: on-device verification of actions"
git push origin main
```
