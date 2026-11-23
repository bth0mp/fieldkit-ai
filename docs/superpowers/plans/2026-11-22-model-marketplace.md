# Choosing a Model Opens the Models Screen: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a model anywhere opens the Models screen, where "Your models" has Use and Unload, and Use brings the owner back to where they were.

**Architecture:**
- One service, `modelChoice`, owns every change of the model in use. Screens call it and show the result.
- The Models screen gains a "Your models" section, always-visible sort buttons and an In memory button. Home, the chat, the Chats tab, the + button and the project screens navigate to it.
- The two old pickers and the code only they used are deleted last, once nothing opens them.

**Tech Stack:** React Native 0.83, React Navigation 7 (native stack, bottom tabs), Zustand, Jest + RNTL rendered tests, Maestro flows (not run in CI).

**Spec:** `docs/superpowers/specs/2026-11-22-model-marketplace-design.md`

## Global Constraints

- Theme tokens only (`TYPOGRAPHY`, `COLORS` via `useTheme`, `SPACING`). Font weights 400 or less. Feather icons from `react-native-vector-icons`. No emoji in UI text.
- No business logic or authoritative state in screens or hooks. Services own it. A hook may hold an in-flight flag for a spinner.
- One rendered integration test per behaviour. Mount the real screen, reach the state through real gestures, and fake only at the device boundary (`__tests__/harness/nativeBoundary.ts`, `global.fetch`, `deviceMemory.ts`, `netInfoFake.ts`). Never `jest.mock` our own modules in new tests.
- No new dependency. No change to `llama.rn`.
- No Off Grid or Wednesday names in anything the user sees.
- "In use" for text means what `useActiveTextModel` says (remote before local).
- Test ids kept: `models-summary`, `model-selector`, `model-loaded-indicator`, `model-item`, `remote-model-item`, `models-row-*`, `sort-option-*`, `setup-card`, `browse-models-button`, `home-phone-models`.
- Copy, exactly:
  - "No text models yet. Download one below, or add a remote server."
  - "No image models yet. Download one below."
  - "In memory: 5.1 GB" / "In memory: none"
  - Sheet title "IN USE"; row status "In use"; buttons "Use", "Unload", "Disconnect", "Add remote server", "Open Models".
  - Chat header: the model's name, "Image model", or "No model".
- No user-visible text says "Models tab".
- A behaviour the removed pickers' tests covered (RAM hints, per-row eject, the remote cloud mark, a failed load leaving no model in use, Load Anyway on send, calendar data refusing a remote model) keeps a test where it now lives.
- knip counts tests as entry points, so it will not flag code that only tests use. Before deleting a module, prove with Grep that no file in `src/` imports it; then delete it and its tests.
- Each green step is its own commit with a per-concern message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. One git command per call; the worktree guard refuses compound ones. Never `--no-verify`, never bare `git stash`.
- Checks before each commit: `npx tsc --noEmit`; `npx eslint <changed files>`; `npm run depcruise`; `npm run knip`; the task's tests. Run the whole suite (`npx jest`) at the end of Tasks 6, 7 and 8; rerun a failing heavy suite alone with `npx jest --runInBand <file>` before treating it as real.

## Review Focus

1. **A message queued behind a reply when Use is tapped:** it must wait for the switch, then go to the new model, once. Stopping a reply drains the queue by itself, which would send it to the old model. Task 1's test pins it.
2. **Use, then Back before the switch ends:** the screen is gone when the switch finishes, and `goBack()` from a removed screen pops whatever is on top. Nothing more may close. Task 2's test pins it.
3. **The same model id on two servers:** only the row of the server in use says "In use" (today's picker marks both). Task 2's test pins it.
4. **Use while a chat's model is still loading:** the load would mark its own model when it ends and undo the choice, so Use and Unload are disabled until then. Task 2's test pins it.
5. **Use while a message is still being prepared** (routing or project search, before any words appear): that turn would load its own model afterwards and undo the choice. The switch waits for its reply to start, then stops it. Task 1's test pins it.

## File map

| File | Responsibility |
|---|---|
| `src/services/stopReply.ts` (new) | Stop the text reply being written; shared with the chat's Stop button |
| `src/services/modelChoice.ts` (new) | Every change of the model in use |
| `src/hooks/useModelLoadingState.ts` (new) | `activeModelService` loading flags, live |
| `src/hooks/useModelChoice.ts` (new) | In-flight flag and errors around `modelChoice`, for the screen |
| `src/screens/ModelsScreen/YourModels.tsx` (new) | The "Your models" section, text and image |
| `src/screens/ModelsScreen/InMemory.tsx` (new) | The In memory button, its sheet and the Eject All confirm |
| `src/components/ModelRow/` | Gains a status, an action button and a cloud mark |
| `ModelPickerSheet`, `ModelSelectorModal/`, `VoiceModelsSheet`, `LoadingOverlay`, `loadingTips`, `useModelLoading`, `useRemoteModelHandlers`, `loadModelWithOverride`, `modelSelectorFilters` | Deleted (Tasks 6 to 8) |

---

### Task 1: The model choice service

**Files:**
- Create: `src/services/stopReply.ts`, `src/services/modelChoice.ts`
- Modify: `src/screens/ChatScreen/useChatGenerationActions.ts:616` (`handleStopFn` calls `stopReply`), `src/services/generationService.ts` (`turnsRunning`)
- Test: `__tests__/integration/models/modelChoice.test.ts`

**Interfaces:**
- Produces:
  - `stopReply(): Promise<void>`: `generationSession.end('stopped')`, `callHook(HOOKS.audioStop)`, `generationService.stopGeneration()`, errors logged. All three start synchronously. `handleStopFn` keeps only its image cancel after it.
  - `generationService.turnsRunning(): number` (the size of `turnsInFlight`).
  - `chooseTextModel(modelId: string): Promise<void>`
  - `chooseRemoteTextModel(serverId: string, modelId: string): Promise<void>`
  - `chooseImageModel(modelId: string): Promise<void>`
  - `dropTextModel(): Promise<void>`, `dropImageModel(): Promise<void>`

- [ ] **Step 1: Write the failing tests.** Real services over `installNativeBoundary({ llama: true, fs: true, ram })` (the LiteRT and diffusion fakes are always there). `boot(models)` seeds each model's file and sets `downloadedModels`; `addServer(id, models)` registers a server with discovered models; `state()` is `useAppStore.getState()`; `remote()` is `useRemoteServerStore.getState()`; `settle(ms)` waits. `replying()` starts `generateResponse` on 'a' with `scriptCompletion({ text: 'one two three', pauseAfter: 'one' })`.

```ts
it('LiteRT to LiteRT: the first is unloaded, so the second is not "ready"', async () => {
  await boot([litert('a'), litert('b')]); await activeModelService.loadTextModel('a');
  await chooseTextModel('b');
  expect([state().activeModelId, state().lastTextModelId, state().textModelEvicted]).toEqual(['b', 'b', false]);
  expect(isModelReady(model('b'))).toBe(false);
});
it.each([['llama', 'litert'], ['litert', 'llama'], ['llama', 'llama']])('%s to %s frees the first', async (from, to) => {
  await boot([make(from, 'a'), make(to, 'b')]); await activeModelService.loadTextModel('a');
  await chooseTextModel('b');
  expect(modelResidencyManager.getResidents().filter(r => r.type === 'text')).toEqual([]);
  expect([llmService.isModelLoaded(), liteRTService.isModelLoaded()]).toEqual([false, false]);
});
it('never passes through no model: local to local, local to remote, remote to remote, remote to local', async () => {
  const seen: Array<string | null> = [];
  renderHook(() => { seen.push(useActiveTextModel().modelId); }); // what the chat sees, render by render
  await chooseTextModel('b'); await chooseRemoteTextModel('s1', 'x'); await chooseRemoteTextModel('s2', 'y'); await chooseTextModel('a');
  expect(seen).not.toContain(null); expect(seen.at(-1)).toBe('a');
});
it('choosing the model in use leaves it loaded', async () => {
  await activeModelService.loadTextModel('a'); await chooseTextModel('a');
  expect(llmService.isModelLoaded()).toBe(true);
});
it('remote: unloads the local model and drops its choice', async () => {
  await chooseRemoteTextModel('s1', 'x');
  expect([remote().activeServerId, remote().activeRemoteTextModelId, state().activeModelId]).toEqual(['s1', 'x', null]);
  expect(llmService.isModelLoaded()).toBe(false);
});
it('remote that cannot connect: says so and leaves the earlier choice and its model loaded', async () => {
  await expect(chooseRemoteTextModel('gone', 'x')).rejects.toThrow();
  expect([remote().activeServerId, remote().activeRemoteTextModelId, state().activeModelId]).toEqual([null, null, 'a']);
  expect(llmService.isModelLoaded()).toBe(true);
  expect(providerRegistry.getActiveProviderId()).toBe('local');
});
it('the same, with another remote model in use: that one and its provider come back', async () => {
  await chooseRemoteTextModel('s1', 'x'); await expect(chooseRemoteTextModel('gone', 'x')).rejects.toThrow();
  expect([remote().activeServerId, remote().activeRemoteTextModelId, providerRegistry.getActiveProviderId()]).toEqual(['s1', 'x', 's1']);
});
it('image: marks it and leaves the text model alone', async () => {
  await chooseImageModel('sd');
  expect([state().activeImageModelId, state().activeModelId, llmService.isModelLoaded()]).toEqual(['sd', 'a', true]);
});
it.each(['local', 'remote'])('drop, %s text: nothing in use and nothing loaded', async () => {
  await dropTextModel();
  expect([state().activeModelId, remote().activeServerId, remote().activeRemoteTextModelId, llmService.isModelLoaded()]).toEqual([null, null, null, false]);
});
it('drop, image: no image model in use, the text model untouched', async () => {
  await dropImageModel(); expect([state().activeImageModelId, state().activeModelId]).toEqual([null, 'a']);
});
it('stops the reply being written and keeps what it wrote', async () => {
  await replying(); await chooseTextModel('b');
  expect(generationService.getState().isGenerating).toBe(false);
  expect(lastMessage().content).toContain('one');
});
it('a message queued behind the reply goes out once, after the switch', async () => {
  const sentTo: Array<string | null> = [];
  generationService.setQueueProcessor(async () => { sentTo.push(state().activeModelId); });
  await replying();
  generationService.enqueueMessage({ id: 'q', conversationId, text: 'next', messageText: 'next' });
  await chooseTextModel('b');
  await waitFor(() => expect(sentTo).toEqual(['b']));
  await settle(300); expect(sentTo).toEqual(['b']);
});
it('a message still being prepared: the switch waits for its reply to start, stops it, and the choice stands', async () => {
  const turn = generationService.runTurn(async () => {
    await settle(200); await activeModelService.loadTextModel('a'); await replying();
  });
  await chooseTextModel('b'); await turn;
  expect([state().activeModelId, generationService.getState().isGenerating]).toEqual(['b', false]);
});
it('choosing a text model leaves a picture being made running', async () => {
  // generateImage held in the diffusion fake
  await chooseTextModel('b'); expect(imageGenerationService.getState().isGenerating).toBe(true);
});
it('two choices at once: they run in turn and the last one is in use', async () => {
  await Promise.all([chooseRemoteTextModel('s1', 'x'), chooseTextModel('b')]);
  expect([remote().activeRemoteTextModelId, state().activeModelId]).toEqual([null, 'b']);
});
```

- [ ] **Step 2: Run** `npx jest __tests__/integration/models/modelChoice.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** The order is what makes it safe:

```ts
let tail: Promise<unknown> = Promise.resolve();

/** Choices run one at a time. Each counts as a running turn, so nothing queued is sent until it ends. */
function exclusively(work: () => Promise<void>): Promise<void> {
  const finish = async () => { await work(); await sleep(0); }; // the chat's queue processor reads its last render
  const run = tail.then(() => generationService.runTurn(async () => {
    // A turn still being prepared cannot be stopped, and would load its own model when it got there. Polled
    // because turns are not observable; gives up after 15 s so a hung one cannot block choosing for good.
    const until = Date.now() + 15_000;
    while (generationService.turnsRunning() > 1 && !writing() && Date.now() < until) await sleep(50);
    if (!generationService.getState().isGenerating) return finish();
    const stopped = stopReply();                  // clears every claim, ours too, and schedules a queue drain,
    return generationService.runTurn(async () => { // so claim again in the same tick
      await stopped;
      await stopAllTextEngines();                 // stopGeneration returns before the engine is idle
      await finish();
    });
  }));
  tail = run.catch(() => { });
  return run;
}
```

  - `writing()` is text or image `isGenerating`; a picture being made is left running.
  - `chooseTextModel`: if `modelId !== activeModelId`, `await activeModelService.unloadTextModel(true)` while the old one is still in use; then, with no `await` between them, `selectTextModel(modelId)`, `setTextModelEvicted(false)`, `remoteServerManager.clearActiveRemoteModel()`. Select before clearing the remote, so there is never no model.
  - `chooseRemoteTextModel`: remember `activeServerId`, `activeRemoteTextModelId` and `providerRegistry.getActiveProviderId()`; `await remoteServerManager.setActiveRemoteTextModel(serverId, modelId)`; if it throws, or `!providerRegistry.hasProvider(serverId)`, put all three back and throw (message for the second case: `the server is not available`); then `await activeModelService.unloadTextModel()`.
  - `chooseImageModel`: `setActiveRemoteImageModelId(null)`, `setActiveImageModelId(modelId)`. It does not go through `exclusively` (it stops nothing). `dropImageModel`: `unloadImageModel()`, then clear the remote image id. `dropTextModel`: inside `exclusively`, `clearActiveRemoteModel()`, then `unloadTextModel()`.

- [ ] **Step 4: Run** the same file, plus `npx jest __tests__/unit/hooks/useChatGenerationActions.test.ts __tests__/integration/generation/queuedSendFeedback.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(models): one service for choosing and dropping the model in use`.

---

### Task 2: "Your models" on the Text tab

**Files:**
- Create: `src/hooks/useModelLoadingState.ts`, `src/hooks/useModelChoice.ts`, `src/screens/ModelsScreen/YourModels.tsx`
- Modify: `src/components/ModelRow/index.tsx` and `styles.ts`, `src/screens/ModelsScreen/index.tsx`, `TextModelsTab.tsx` (list header), `src/navigation/types.ts:36`, `src/components/onboarding/spotlightConfig.tsx` (step 11 text), `__tests__/harness/modelsApp.ts`
- Test: `__tests__/integration/models/yourModels.rendered.test.tsx`

**Interfaces:**
- Consumes: Task 1's five functions.
- Produces:
  - `useModelLoadingState(): { text: boolean; image: boolean }` (`activeModelService.subscribe`, starting from `getActiveModels()`).
  - `export type ModelTarget = { kind: 'text' | 'image'; id: string } | { kind: 'remote'; serverId: string; id: string }`
  - `useModelChoice(h: { onChosen: () => void; onError: (message: string) => void }): { busy: { text: boolean; image: boolean }; pending: ModelTarget | null; choose: (t: ModelTarget) => Promise<void>; drop: (kind: 'text' | 'image') => Promise<void> }`. `busy` is the service's loading flag or this hook's own call in flight. `onChosen` fires after `choose` succeeds, never after `drop`. Errors: `Failed to connect to remote model: ${message}` (remote), `Failed to switch models: ${message}` (local), `Failed to unload model` (drop).
  - `YourModels: React.FC<{ kind: 'text' | 'image'; onChosen: () => void; onError: (message: string) => void }>` (calls `useModelChoice` itself, so it can be mounted alone). Ids: `your-models-text`, `your-models-image`, `your-models-empty`, `your-models-add-server`.
  - `ModelRow` gains `remote?: boolean` (cloud icon, id `${testID}-remote`), `status?: string`, `action?: { label: string; onPress: () => void }` (id `${testID}-action`, accessibility label `${label} ${name}`, disabled with the row's `disabled`).
  - Route: `Models` params gain `afterUse?: 'newChat'`.
  - Harness: `bootHome(opts: ModelsAppOptions)` returns `{ rtl, ui, hf, boundary, nav }` on Home (`nav` is the container ref); `openModelsFromHome` uses it. `ModelsAppOptions` gains `models?: Partial<DownloadedModel>[]` (files and records seeded; default today's one) and `imageModels?: Partial<ONNXImageModel>[]`.

- [ ] **Step 1: Write the failing tests** (real `AppNavigator`, the two `jest.mock` lines of `serverSorts.rendered.test.tsx`; `section = within(ui.getByTestId('your-models-text'))`).

```ts
it('in use first, then newest download, records with no date last, each with size, quant, Vision and RAM hint', async () => {
  // models: old (2026-01-01), new (2026-11-01, vision), undated (downloadedAt undefined), used (2025-01-01, in use)
  expect(section.getAllByTestId('model-item').map(nameOf)).toEqual(['Used', 'New', 'Old', 'Undated']);
  expect(section.getByText('~3.0 GB RAM')).toBeTruthy();                 // 2 GB file x 1.5
  expect(section.getByText('~12.0 GB RAM (may not fit)')).toBeTruthy();  // 8 GB file on a 12 GB phone
});
it.each(['Use', 'the row'])('tapping %s marks the model and goes back to Home', async (what) => {
  press(what === 'Use' ? ui.getByLabelText('Use New') : section.getByText('New'));
  await waitFor(() => expect(ui.queryByTestId('models-screen')).toBeNull());
  expect(ui.getByTestId('model-chip-label')).toHaveTextContent('New');
});
it('the row in use says In use and Unload leaves nothing in use and stays', async () => {
  expect(section.getByText('In use')).toBeTruthy(); expect(ui.queryByLabelText('Use Used')).toBeNull();
  press(ui.getByLabelText('Unload Used'));
  await waitFor(() => expect(section.queryByText('In use')).toBeNull());
  expect(ui.getByTestId('models-screen')).toBeTruthy();
});
it('remote models sit under their server with the cloud mark; Use connects; Disconnect drops', async () => {
  // server added through the real Add Server screen, as modelsSheetRemoteCloud does
  expect(section.getByText('Study PC')).toBeTruthy(); expect(section.getByTestId('remote-model-item-remote')).toBeTruthy();
  press(ui.getByLabelText('Use llama3')); await waitFor(() => expect(remote().activeRemoteTextModelId).toBe('llama3'));
  await openModelsAgain(); press(ui.getByLabelText('Disconnect llama3'));
  await waitFor(() => expect(remote().activeServerId).toBeNull());
});
it('the same model id on two servers: one row says In use', async () => { expect(section.getAllByText('In use')).toHaveLength(1); });
it('an offline server is left out, except its model in use', async () => {
  // both servers unhealthy; s1 has 'x' (in use) and 'z', s2 has 'y'
  expect(section.getAllByTestId('remote-model-item').map(nameOf)).toEqual(['x']);
});
it('a server removed while the switch waits: alert, stays, earlier model still in use', async () => {
  generationService.runTurn(() => settle(300)); press(ui.getByLabelText('Use llama3'));
  await act(() => remoteServerManager.removeServer(serverId));
  await waitFor(() => expect(ui.getByText(/Failed to connect to remote model/)).toBeTruthy());
  expect([state().activeModelId, remote().activeServerId]).toEqual(['used', null]);
});
it('none at all: the empty text, and Add remote server opens Remote Servers', async () => {
  expect(ui.getByText('No text models yet. Download one below, or add a remote server.')).toBeTruthy();
  press(ui.getByTestId('your-models-add-server')); await waitFor(() => expect(nav.getCurrentRoute().name).toBe('RemoteServers'));
});
it.each(['a search', 'a size filter', 'Trending'])('%s replaces the section; clearing it brings the section back', async () => {
  await waitFor(() => expect(ui.queryByTestId('your-models-text')).toBeNull());
  // clear the search or filter, or tap Smart
  await waitFor(() => expect(ui.getByTestId('your-models-text')).toBeTruthy());
});
it('offline (netInfoFake, before boot): Use still goes back', async () => {
  press(ui.getByLabelText('Use New')); await waitFor(() => expect(state().activeModelId).toBe('new'));
  expect(ui.queryByTestId('models-screen')).toBeNull();
});
it('follows a delete (of the model in use too), a finished download and a removed server while open', async () => {
  expect(names()).toEqual(['New', 'Old']); // 'Used' deleted; then ['Fresh', 'New', 'Old']; then no 'Study PC'
});
it('Use and Unload are disabled while a chat model loads, and its row spins', async () => {
  boundary.llama!.holdNextInit(); const load = activeModelService.loadTextModel('used');
  await waitFor(() => expect(section.getByTestId('model-row-loading')).toBeTruthy());
  press(ui.getByLabelText('Use New')); expect(state().activeModelId).toBe('used');
  boundary.llama!.releaseInit(); await load;
});
// The next two push a second Models screen (nav.dispatch(StackActions.push('Models'))) and act on the top one.
it('two quick taps on Use go back once', async () => { expect(routes()).toEqual(['Main', 'Models']); });
it('Use, then the back arrow before the switch ends, closes nothing more', async () => {
  generationService.runTurn(() => settle(300));          // the switch waits for this
  press(last(ui.getAllByLabelText('Use New'))); press(last(ui.getAllByTestId('models-back')));
  await waitFor(() => expect(state().activeModelId).toBe('new'));
  expect(routes()).toEqual(['Main', 'Models']);
});
it('a recovered model is listed', async () => { expect(names()).toContain('Recovered'); }); // isSuspiciousRecoveredTextModel is true for it
it.each([[11, null], [9, 9]])('the tour: opening Models with step %s pending leaves %s pending', async (before, after) => {
  expect(peekPendingSpotlight()).toBe(after);
});
```

- [ ] **Step 2: Run** the file. Expected: FAIL, `your-models-text` not found.

- [ ] **Step 3: Implement.**
  - Lists: `downloadedModels` from `useAppStore`; servers, `discoveredModels`, `serverHealth`, `activeServerId` from `useRemoteServerStore`. In use: `useActiveTextModel()`; a remote row also needs `serverId === activeServerId`. Text needs no extra loading of its own: Home and `useTextModels` already fill the stores.
  - Row content as `ModelPickerSheet.tsx:171-186`: `hardwareService.formatModelSize(model)`, quant, `engine === 'llama' && isVisionModel`, hint from (file + mmproj) x `textOverheadMultiplier(settings.inferenceBackend)` (1.5 on the CPU, as Home shows; the number the sheet shows once the model is loaded), `fileExceedsBudget(total, hardwareService.getTotalMemoryGB())`. A remote model in use stays under its server. A remote row's `size` line is today's "Vision · Tools · Thinking" list.
  - The section is the `ListHeaderComponent` of the picks list, above `DeviceBanner`, only when `!hasSearched`.
  - First row wrapped in `AttachStep index={MODEL_PICKER_STEP_INDEX} fill`. On mount, if `peekPendingSpotlight() === MODEL_PICKER_STEP_INDEX`, consume it and, when there is a row, `goTo(11)` after interactions. Step 11's text becomes "Tap Use to choose this model for chatting".
  - `ModelsScreen`:

```ts
const left = useRef(false);
const onChosen = () => {
  // The owner may have left, or opened another screen, while the switch ran.
  if (left.current || !vm.navigation.isFocused()) return;
  left.current = true;
  if (route.params?.afterUse === 'newChat') vm.navigation.replace('Chat', {});
  else vm.navigation.goBack();
};
```

  - `onError` shows `showAlert('Error', message)` through `vm.setAlertState`.

- [ ] **Step 4: Run** the file plus `npx jest __tests__/integration/models/serverSorts.rendered.test.tsx __tests__/integration/models/modelsOffline.rendered.test.tsx __tests__/rntl/screens/ModelsScreen.test.tsx __tests__/unit/onboarding`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(models): Your models on the Text tab, with Use and Unload`.

---

### Task 3: Image tab, and Use on file and transcription cards

**Files:**
- Modify: `src/screens/ModelsScreen/ImageModelsTab.tsx`, `TextModelsTab.tsx` (`ModelDetailView`), `TranscriptionModelsTab.tsx`, `index.tsx`, `src/components/ModelCardContent.tsx:436-455`, `ModelCard.tsx`
- Test: `__tests__/integration/models/useAfterDownload.rendered.test.tsx`

**Interfaces:**
- Consumes: `YourModels`, `useModelChoice`, `onChosen`, `onError` (Task 2).
- Produces: `ModelCard` and `ModelCardActions` gain `selectDisabled?: boolean`; a downloaded, not active card with `onSelect` shows a text button "Use" (id `${testID}-use`) instead of the check icon.

- [ ] **Step 1: Write the failing tests.**

```ts
it('file list: a downloaded file has Use, which marks it and goes back', async () => {
  // open the model whose file is downloaded; press file-card-0-use
  await waitFor(() => expect(ui.getByTestId('model-chip-label')).toHaveTextContent('Test Model'));
});
it('file list: the one in use shows Active and no Use; a file that finishes downloading gains Use', async () => {
  expect(ui.queryByTestId('file-card-0-use')).toBeNull(); expect(within(ui.getByTestId('file-card-0')).getByText('Active')).toBeTruthy();
  await completeDownload(1); await waitFor(() => expect(ui.getByTestId('file-card-1-use')).toBeTruthy());
});
it('file list: Use is disabled while a text model loads', async () => {
  boundary.llama!.holdNextInit(); const load = activeModelService.loadTextModel('m');
  await waitFor(() => expect(ui.getByTestId('file-card-1-use')).toBeDisabled());
  boundary.llama!.releaseInit(); await load;
});
it('Image tab: downloaded image models with Use, quant style or "Image", x1.8 RAM hint; the one in use has Unload', async () => {
  expect(within(ui.getByTestId('your-models-image')).getByText('~1.8 GB RAM')).toBeTruthy(); // 1 GB model
  expect(ui.getByLabelText('Unload SD One')).toBeTruthy(); expect(ui.getByLabelText('Use SD Two')).toBeTruthy();
});
it('Image tab: Use goes back to Home, which says an image model is in use', async () => {
  press(ui.getByLabelText('Use SD Two')); await waitFor(() => expect(ui.queryByTestId('models-screen')).toBeNull());
  expect(ui.getByTestId('model-chip-label')).toHaveTextContent('Image model loaded');
});
it('Image tab: hidden while the search box has text; shown offline; empty text with none', async () => {
  expect(ui.getByText('No image models yet. Download one below.')).toBeTruthy();
});
it('an image model appears in Your models when its download ends', async () => {
  act(() => state().addDownloadedImageModel(image('SD Three'))); expect(ui.getByLabelText('Use SD Three')).toBeTruthy();
});
it.each([['an image', true], ['a text', false]])('Image tab: while %s model loads, Use disabled is %s', async (_kind, disabled) => {
  expect(!!ui.getByLabelText('Use SD Two').props.accessibilityState?.disabled).toBe(disabled);
});
it('Transcription: a downloaded model not in use has Use; tapping it keeps the screen open', async () => {
  press(ui.getByTestId('transcription-model-card-0-use'));
  await waitFor(() => expect(whisper().downloadedModelId).toBe('tiny.en'));
  expect(ui.getByTestId('models-screen')).toBeTruthy();
});
```

- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** `ModelDetailView` calls `useModelChoice` itself (it and the Text section are never mounted together) and passes `onSelect` when `downloadedModel` exists and is not in use, `isActive` when it is, `selectDisabled={busy.text}`. The image section is the first child of the image list's `ScrollView`, outside its loading and error branches. `WhisperCard` passes `onSelect` when `present && !active && !downloading && !queued`; its card tap stays.
- [ ] **Step 4: Run** the file plus `npx jest __tests__/integration/models/modelCardDetails.rendered.test.tsx __tests__/rntl/components/ModelCard.test.tsx __tests__/integration/downloads`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(models): Use on image, file and transcription cards`.

---

### Task 4: In memory button, and a tab named on the way in is set once

**Files:**
- Create: `src/screens/ModelsScreen/InMemory.tsx`
- Modify: `src/screens/ModelsScreen/index.tsx` (import row, focus effect), `styles.ts`, `src/components/models/ModelsManagerSheet.tsx` (title "IN USE")
- Test: `__tests__/integration/models/inMemory.rendered.test.tsx`

**Interfaces:**
- Consumes: `useModelLoadingState` (Task 2), `useResidentRows`, `useEjectAllModels`, `ModelsManagerSheet`.
- Produces: `InMemory: React.FC<{ onOpenTab: (tab: ModelTab) => void; setAlertState: (s: AlertState) => void }>`. Ids `in-memory-button`, `in-memory-label`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('"In memory: none", then the total of every loaded model', async () => {
  // load text (real loadTextModel) and whisper (real selectModel); sum = residents' sizeMB / 1024, one decimal
  await waitFor(() => expect(ui.getByTestId('in-memory-label')).toHaveTextContent('In memory: 2.4 GB')); // the value the residents give
});
it('the sheet is titled IN USE, has four rows, and its chip agrees with the button (CPU and GPU backends)', async () => {
  expect(ui.getByText('IN USE')).toBeTruthy();
  expect(['text', 'image', 'voice', 'speech'].every(t => ui.queryByTestId(`models-row-${t}`))).toBe(true);
  expect(gb(ui.getByTestId('in-memory-label'))).toBe(gb(ui.getByTestId('models-row-text-ram'))); // only text loaded
});
it('ejecting a row frees memory and keeps the choice', async () => {
  press(ui.getByTestId('models-row-text-eject'));
  await waitFor(() => expect(ui.queryByTestId('models-row-text-ram')).toBeNull());
  expect(state().activeModelId).toBe('m');
});
it('Eject All asks after the sheet has closed, frees everything and keeps the choices', async () => {
  press(ui.getByText('Eject All Models')); press(await find(ui, 'Eject All'));
  await waitFor(() => expect(ui.getByTestId('in-memory-label')).toHaveTextContent('In memory: none'));
  expect([state().activeModelId, state().activeImageModelId]).toEqual(['m', 'sd']);
});
it.each([['remote', true], ['local', false]])('a %s text model: the sheet cloud mark is %s', async (_kind, shown) => {
  expect(!!ui.queryByTestId('models-row-text-remote')).toBe(shown);
});
it.each(['text', 'image', 'voice', 'speech'])('tapping the %s row closes the sheet and goes to its tab', async (row) => {
  press(ui.getByTestId(`models-row-${row}`)); await waitFor(() => expect(ui.queryByText('IN USE')).toBeNull());
  expect(!!ui.queryByTestId('your-models-text')).toBe(row === 'text');
  expect(!!ui.queryByTestId('your-models-image')).toBe(row === 'image');
  expect(!!ui.queryByTestId('transcription-model-card-0')).toBe(row === 'speech');
});
it('opened on Image, switched to Text, then a trip to the Download Manager and back: still Text', async () => {
  // nav.navigate('Models', { initialTab: 'image' }); press 'Text Models'; press downloads-icon; go back
  expect(ui.getByTestId('your-models-text')).toBeTruthy();
});
```

  These take over the claims of `pickerRamMatchesResidencyChip` and `modelSelectorShowsLoadedRam` (one number for one loaded model).

- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** `useResidentRows(true)` lives inside the button component, so its polling re-renders only that. Labels: text `useActiveTextModel().modelName` or "—" when there is none, image model name, `useUiModeStore.voiceSummary`, the Whisper model's name. Row to tab: text, image, voice, speech to transcription. Row taps and the Eject All confirm run from the sheet's `onClosed`. Import and In memory share a wrapping row; while an import runs its progress card takes the whole row and the button sits below it. Focus effect: keep the last applied `route.params` object in a ref and apply `initialTab` / `initialSearchQuery` only when it changed; `repairModelId` stays as it is.
- [ ] **Step 4: Run** the file plus `npx jest __tests__/rntl/components/ModelsManagerSheet.test.tsx __tests__/integration/memory`. Expected: PASS (those that mount the sheet directly are unaffected by its title).
- [ ] **Step 5: Commit** `feat(models): In memory button on the Models screen`.

---

### Task 5: Sort buttons always visible

**Files:**
- Modify: `src/screens/ModelsScreen/TextModelsTab.tsx` (remove `sort-pill`, `SortPanel` becomes a row), `constants.ts:65` (order), `types.ts` (`FilterDimension` loses `'sort'`), `styles.ts`
- Test: `__tests__/integration/models/serverSorts.rendered.test.tsx`, `modelsOffline.rendered.test.tsx`

- [ ] **Step 1: Change the tests first.** Remove every `sort-pill` press from both files, and add:

```ts
it('the seven sorts show without opening anything, in order', async () => {
  const { ui } = await openModelsFromHome({ totalGB: 12 });
  expect(ui.getAllByTestId(/^sort-option-/).map(n => n.props.testID.replace('sort-option-', '')))
    .toEqual(['recommended', 'trending', 'downloads', 'likes', 'newest', 'bestfit', 'size']);
  expect(ui.queryByTestId('sort-pill')).toBeNull();
  expect(ui.getByTestId('sort-option-recommended')).toBeSelected();
});
it('opening the filters leaves the sorts in place', async () => {
  press(ui.getByTestId('text-filter-toggle')); expect(ui.getAllByTestId(/^sort-option-/)).toHaveLength(7);
});
```

- [ ] **Step 2: Run** both files. Expected: FAIL (sorts hidden until expanded).
- [ ] **Step 3: Implement** as one horizontal `ScrollView` (`keyboardShouldPersistTaps="handled"`) under the search row and the offline notice. Labels, icons, behaviour and accessibility state stay. The `currentSort` lookup stays for the results heading.
- [ ] **Step 4: Run** both files plus `npx jest __tests__/rntl/screens/ModelsScreen.test.tsx __tests__/unit/screens/ModelsScreen`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(models): sort buttons always visible`.

---

### Task 6: Home goes to the Models screen

**Files:**
- Modify: `src/screens/HomeScreen/index.tsx`, `hooks/useHomeScreen.ts`, `hooks/types.ts`, `styles.ts` (styles only the picker used), `cards/AssistantCard.tsx`, `src/components/onboarding/spotlightConfig.tsx` (steps 1 and 13 text), `__tests__/harness/chatHarness.ts:133-141`
- Delete: `src/screens/HomeScreen/components/ModelPickerSheet.tsx`, `LoadingOverlay.tsx`, `loadingTips.ts`, `hooks/useModelLoading.ts`, `hooks/useRemoteModelHandlers.ts`, and their tests (`ModelPickerSheet.test.tsx`, `useModelLoading.test.ts`, any for the others)
- Test: `__tests__/integration/home/chooseFromHome.rendered.test.tsx`

**Interfaces:**
- Consumes: `YourModels` (the chat harness mounts it alone), `useModelLoadingState`.
- Produces: `AssistantCard`'s `chip.loading` is `useModelLoadingState()` text or image. `HomeScreen` starts no load, unload or eject.

- [ ] **Step 1: Write the failing tests.**

```ts
it('the chip opens Models on Text, and Use comes back with the new name: two taps', async () => {
  press(ui.getByTestId('models-summary')); await waitFor(() => ui.getByTestId('your-models-text'));
  press(ui.getByLabelText('Use Second'));
  await waitFor(() => expect(ui.getByTestId('model-chip-label')).toHaveTextContent('Second'));
});
it('with only an image model in use the chip opens Image', async () => {
  press(ui.getByTestId('models-summary')); await waitFor(() => expect(ui.getByTestId('your-models-image')).toBeTruthy());
});
it.each([['Select Model', 1], ['Browse Models', 0]])('setup card "%s" (%d models) opens Models on Text', async () => {
  press(ui.getByTestId('browse-models-button')); await waitFor(() => expect(ui.getByTestId('your-models-text')).toBeTruthy());
});
it('the chip spins while a model loads, and Home still takes taps', async () => {
  boundary.llama!.holdNextInit(); const load = activeModelService.loadTextModel('first');
  await waitFor(() => expect(within(ui.getByTestId('models-summary')).UNSAFE_getByType(ActivityIndicator)).toBeTruthy());
  press(ui.getByTestId('models-summary')); await waitFor(() => expect(ui.getByTestId('models-screen')).toBeTruthy());
  boundary.llama!.releaseInit(); await load;
});
it('"Load your image model" names Image Models', () => { expect(stepText(13)).toMatch(/Image Models/); });
```

- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** Chip icon `chevron-right`. Tab: `!activeTextModel && activeImageModelId ? 'image' : 'text'`. Step 1: "Tap here to open the Models screen and choose a text model." Step 13: "Tap here, then open Image Models and tap Use." The chat harness keeps mounting Home (its hydration loads the record), then mounts `YourModels kind="text"` with no-op handlers and taps the first `model-item`.
- [ ] **Step 4: Move and re-point the old tests** (line numbers from today's files; check each before deleting it, and move a claim no new test makes):
  - `__tests__/rntl/screens/HomeScreen.test.tsx`: delete 819, 834, 921, 935, 945, 1365, 1381 and the moved claims 597-691, 782, 797, 858-907, 956-1152, 1240, 1252 (covered by Tasks 1 to 4); re-point 355, 370, 382, 432, 475, 844, 851, 1045, 1201, 1499.
  - `modelsSheetRemoteCloud`, `homeRemoteModelTextCount`, `tabBar.rendered` (step 3 and 5 only; step 2 is Task 8), `managerSheetResidency` (Home half), `pickerRamMatchesResidencyChip`, `pickerFitHintUsesOwnedBudget`, `litertLazyOnSelect`: re-point to the Models screen, or delete when a Task 1 to 4 test makes the same claim.
  - `HomeScreenSpotlight.test.tsx:155`, `useHomeScreen.test.ts:45`: drop the mocks of deleted modules. `onboardingFlows.test.ts:156`: step 11 text only.
- [ ] **Step 5: Run** the new file, `npx jest __tests__/rntl/screens/HomeScreen.test.tsx __tests__/integration/home __tests__/integration/app __tests__/rntl/onboarding __tests__/unit/onboarding`, then the whole suite (131 files use the chat harness). Expected: PASS. Grep proves no import of a deleted file.
- [ ] **Step 6: Commit** `feat(home): the model chip opens the Models screen`.

---

### Task 7: The chat goes to the Models screen

**Files:**
- Modify: `src/screens/ChatScreen/index.tsx`, `ChatScreenComponents.tsx`, `ChatModalSection.tsx`, `useChatScreen.ts`, `useChatModelActions.ts`, `useChatGenerationActions.ts`, `styles.ts`, `__tests__/harness/genDeps.ts`
- Test: `__tests__/integration/generation/chooseFromChat.rendered.test.tsx`

**Interfaces:**
- Produces: `GenerationDeps.openModels?: (tab: 'text' | 'image') => void` (replaces `setShowModelSelector` and `setModelSelectorTab`); `ensureTextModelForChatFn` takes `openModels`; `useChatScreen()` returns `openModels`. `ChatHeader` takes `modelLabel: string`; `NoModelScreen` takes `onOpenModels` in place of the selector props.

- [ ] **Step 1: Write the failing tests** (real `AppNavigator`, `bootHome`, chat opened with `new-chat-button`).

```ts
it('the header names the model, opens Models, and Use comes back with the new name and the half-typed message kept', async () => {
  changeText(ui.getByTestId('chat-input'), 'half a thou');
  expect(ui.getByTestId('model-loaded-indicator')).toHaveTextContent('First');
  press(ui.getByTestId('model-selector')); press(await find(ui, 'Use Second'));
  await waitFor(() => expect(ui.getByTestId('model-loaded-indicator')).toHaveTextContent('Second'));
  expect(ui.getByTestId('chat-input').props.value).toBe('half a thou');
});
it('a chat with messages: "No model" with none; "Image model" with only an image model, which opens Image', async () => {
  expect(ui.getByTestId('model-loaded-indicator')).toHaveTextContent('No model');
  act(() => state().setActiveImageModelId('sd')); expect(ui.getByTestId('model-loaded-indicator')).toHaveTextContent('Image model');
  press(ui.getByTestId('model-selector')); await waitFor(() => expect(ui.getByTestId('your-models-image')).toBeTruthy());
});
it.each([['remote', true], ['phone', false]])('header, a %s model in use: cloud mark is %s', async (_kind, shown) => {
  expect(!!ui.queryByTestId('model-remote-mark')).toBe(shown); // new id on the existing icon
});
it('LiteRT to LiteRT from a chat: the next message loads and is answered by the second file', async () => {
  expect(boundary.litert.module.loadModel.mock.calls.map(c => c[0])).toEqual([pathOf('a'), pathOf('b')]);
});
it('LiteRT without vision to LiteRT with it: the composer takes a photo before the first message', async () => {
  expect(ui.getByPlaceholderText('Type a message or add an image...')).toBeTruthy();
});
it.each(['a phone model', 'a remote model'])('a message with no text model ever chosen goes to Models and is sent once after Use on %s', async () => {
  // image model only; send 'hello'; Models shows; Use; back in the chat
  await waitFor(() => expect(ui.getAllByText('hello')).toHaveLength(1));
  expect(await find(ui, 'Hi there.')).toBeTruthy();
});
it('coming back without choosing leaves it waiting; choosing later from the header sends it once', async () => {
  press(ui.getByTestId('models-back')); await settle(300); expect(ui.queryByText('hello')).toBeNull();
  press(ui.getByTestId('model-selector')); press(ui.getByText('Text Models')); press(await find(ui, 'Use First'));
  await waitFor(() => expect(ui.getAllByText('hello')).toHaveLength(1));
});
it.each([['Select Model', 1], ['Open Models', 0]])('No Model Selected, button "%s" (%d models), opens Models', async (label) => {
  press(ui.getByText(label)); await waitFor(() => expect(ui.getByTestId('your-models-text')).toBeTruthy());
});
it('Reload after a settings change shows the loading bar and opens nothing', async () => { expect(ui.queryByTestId('models-screen')).toBeNull(); });
it('a failed load on send leaves no model in use', async () => { expect(state().activeModelId).toBeNull(); });
it('Use on a model too big for memory: the refusal comes with the message, and Load Anyway loads it', async () => {
  press(await find(ui, 'Load Anyway')); await waitFor(() => expect(llmService.isModelLoaded()).toBe(true));
});
```

- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Header: `hasTextModel ? activeModelName : activeImageModelId ? 'Image model' : 'No model'`, one line, shrinking; `chevron-right` in place of the "▼" text. Tab: Image only for "Image model".
  - `openModels(tab)` is `navigation.navigate('Models', { initialTab: tab })`.
  - Waiting message: a `useFocusEffect` keyed on `hasTextModel` that, when there is a text model and `pendingMessageRef.current`, clears the ref and calls the latest `handleSend` (through a ref set on each render).
  - `useChatModelStateSync`: add `activeModelId` to the vision effect's deps.
  - `handleReloadTextModel`: drop `setShowModelSelector(true)`.
  - `NoModelScreen` text with none on the phone: "Download a text or image model from the Models screen to get started."
  - `hasAvailableModels` counts every downloaded model (recovered ones are listed now); delete `src/utils/modelSelectorFilters.ts` and its test in Task 8, when the modal that uses it goes.
  - Delete `proceedWithModelLoadFn`, `handleModelSelectFn`, `handleUnloadModelFn`, `handleModelSelect`, `handleUnloadModel`, the chat's manager sheet, Whisper and Voice sheets, Eject All confirm, and every selector prop. `initiateModelLoad` and `ensureModelLoadedFn` stay.
- [ ] **Step 4: Move and re-point the old tests:**
  - `ChatScreen.test.tsx`: delete the mocks at 312-335 and 449-481 and the tests at 782 and 1513; re-point 621, 629, 654, 741, 771, 1503, 4175; make the load on the next send 1540, 1560, 1586, 2450, 2490, 2529, 3422, 3466, 4081, 4200; delete 1609, 2415, 2565, 3505, 3531, 4120 (Task 1 and 2 make these claims). Rename the describe at 1502.
  - `NoModelScreen.test.tsx`, `ChatScreenSpotlight.test.tsx:155`, `useChatModelActions.test.ts` (keep the Load Anyway claims on `initiateModelLoad`), `useChatGenerationActions.test.ts` (243, 680-699, 826-830), `batch2-send.test.ts`, `queuedSendFeedback.test.ts`, `privateRemote.rendered.test.tsx:88-90` (the notice's button opens Models): re-point.
  - `chatHomeSelectorParity.test.ts`, `reloadCardShowsLoaderOnActiveRow`: delete (one service now; the Reload test above).
  - Drop the "Model unloaded: …" chat line with the handler that wrote it.
- [ ] **Step 5: Run** the new file, `npx jest __tests__/rntl/screens/ChatScreen.test.tsx __tests__/integration/generation __tests__/integration/actions __tests__/unit/hooks`, then the whole suite. Expected: PASS.
- [ ] **Step 6: Commit** `feat(chat): the header names the model and opens the Models screen`.

---

### Task 8: Every other way in, and the old pickers go

**Files:**
- Modify: `src/screens/ChatsListScreen.tsx`, `src/navigation/NewChatTabButton.tsx`, `src/screens/ProjectChatsScreen.tsx:187`, `ProjectDetailScreen.tsx:52`, `src/components/ChatInput/index.tsx:221`, `src/screens/ChatScreen/ChatMessageArea.tsx:293`, `src/components/GenerationSettingsModal/index.tsx` and `ImageGenerationSection.tsx:46-49`, `ChatModalSection.tsx`, `src/screens/StorageSettingsScreen.tsx:226`, `src/components/ModelRow/` (drop `isLoaded` and its check mark), `src/components/index.ts`
- Delete: `src/components/ModelSelectorModal/`, `src/components/models/VoiceModelsSheet.tsx`, `src/services/loadModelWithOverride.ts`, `src/utils/modelSelectorFilters.ts`, and their tests
- Test: `__tests__/integration/app/chooseForNewChat.rendered.test.tsx`

**Interfaces:**
- Consumes: `afterUse: 'newChat'` (Task 2), `openModels` (Task 7).
- Produces: `ChatInput` gains `onOpenModels?: (tab: 'text' | 'image') => void`; `GenerationSettingsModal` gains `onOpenImageModels?: () => void`.

- [ ] **Step 1: Write the failing tests.**

```ts
it.each([['the + button', 'new-chat-button'], ['Chats, New', 'New'], ['Chats, empty state', 'chats-open-models']])(
  '%s with no model: Models, Use, a new chat, and Back is the tab it came from', async () => {
    await waitFor(() => expect(ui.getByTestId('chat-input')).toBeTruthy());
    press(chatBackArrow(ui));
    await waitFor(() => expect(ui.getByTestId('chats-tab')).toBeSelected());
    expect(ui.queryByTestId('models-screen')).toBeNull();
  });
it('the same trip choosing an image model on the Image tab opens a new chat', async () => {
  press(ui.getByText('Image Models')); press(ui.getByLabelText('Use SD One')); await waitFor(() => expect(ui.getByTestId('chat-input')).toBeTruthy());
});
it.each(['the + button', 'New'])('%s with a model in use opens a chat directly', async () => {
  await waitFor(() => expect(ui.getByTestId('chat-input')).toBeTruthy()); expect(ui.queryByTestId('models-screen')).toBeNull();
});
it.each(['ProjectDetail', 'ProjectChats'])('%s, no model: the alert has Open Models, and Back is the project', async (screen) => {
  press(await find(ui, 'Open Models')); await waitFor(() => expect(ui.getByTestId('your-models-text')).toBeTruthy());
  press(ui.getByTestId('models-back')); expect(nav.getCurrentRoute().name).toBe(screen);
});
it.each(['the composer image toggle alert', 'the chat settings line'])('%s, no image model: Open Models opens Image, and Back is the chat', async () => {
  await waitFor(() => expect(ui.getByTestId('your-models-image')).toBeTruthy());
  press(ui.getByTestId('models-back')); expect(nav.getCurrentRoute().name).toBe('Chat');
});
it('Storage settings says models are deleted in the Download Manager', async () => { expect(ui.getByText('To free up space, you can delete models in the Download Manager.')).toBeTruthy(); });
```

- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Chats empty text with no model in use: "Choose or download a model on the Models screen to start chatting.", with the "Open Models" button (id `chats-open-models`).
  - Project alert: 'Please download a model first from the Models screen.' with `Cancel` and `Open Models`. Composer alert keeps its text, with `Cancel` and `Open Models`.
  - Chat settings line: "No image models downloaded. Open Models to download one.", pressable; it closes the sheet and then calls `onOpenImageModels` after 200 ms, as the Gallery row does (`ConversationActionsSection.tsx:48`).
- [ ] **Step 4: Move and re-point the old tests:** `ChatsListScreen.test.tsx` (122-127, 168, 212), `batch2-chatslist.test.tsx:97`, `tabBar.rendered` step 2 (no model: Models, then a chat). Delete with their modules: `selectorLoaderOnRow`, `modelSelectorShowsLoadedRam`, `remoteModelIndicator`, the picker half of `managerSheetResidency`, `loadModelWithOverride.test.ts`. `loadFailureClearsActiveModel` and `loadAnywayOverrideChain`: re-point to `initiateModelLoad` and keep their claims. `embeddingSidecarResident`: fix its comment. `__tests__/specs/model-lifecycle.yaml:208`: new wording.
- [ ] **Step 5: Run** the new file, then the whole suite. Expected: PASS. Grep proves no import of a deleted file and "Models tab" only in comments, and `npm run knip` is clean.
- [ ] **Step 6: Commit** `feat(models): every way to choose a model opens the Models screen; old pickers removed`.

---

### Task 9: Maestro flows, device notes and the version

**Files:**
- Modify: `.maestro/flows/p0/00-setup-model.yaml`, `p0/02-text-generation.yaml`, `p0/04-image-generation.yaml`, `p1/06c-text-generation-full.yaml`, `p2/05b-model-selection.yaml`, `p2/05c-model-unload.yaml`, `p3/07c-image-model-set-active.yaml`, `.maestro/E2E_TESTING.md`
- Modify: `package.json`, `package-lock.json`, `android/app/build.gradle:88-89`

- [ ] **Step 1: Flows.** Choose: tap `models-summary`, wait for `models-screen`, tap the first `model-item`, wait for `home-screen`. Unload: `models-summary`, `models-screen`, tap "Unload", `models-back`. Image: `models-summary`, tap "Image Models", tap `model-item`. The steps that tap `models-row-text`, `image-model-card`, "Unload current model" or "Browse Models" inside a picker go. `06c` asserts the model's name in `model-loaded-indicator`. `E2E_TESTING.md` (lines 96-111 and 227) lists the new ids: `your-models-text`, `your-models-image`, `model-item-action`, `in-memory-button`, `sort-option-*`.
- [ ] **Step 2: Check** that every id and text a flow uses exists: Grep each in `src/`.
- [ ] **Step 3: Version.** 0.5.0 in `package.json` and `package-lock.json` (two places), versionCode 500 and versionName "0.5.0" in `build.gradle`, as commit `af1e26ba1` did.
- [ ] **Step 4: Commit** `test(e2e): choose models on the Models screen` and, separately, `chore(release): 0.5.0`.

---

## After the tasks

1. Final review of the whole branch on Opus, against the spec's anti-goals.
2. Device check on the test app (`com.bth0mp.fieldkit.dev`), light and dark, phone width: the chip, two models switched from Home and from a chat, a half-typed message kept, the In memory sheet, a long model name in the chat header, Models with no connection.
3. Push to main only on the owner's word; then the signed 0.5.0 release once CI is green.
