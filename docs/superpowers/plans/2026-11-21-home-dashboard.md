# Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Home into a scrolling stack of status cards that open every part of the app, under a fixed five-place tab bar (Home, Chats, raised New chat, Kit, Settings).

**Architecture:** Each card is a small component under `src/screens/HomeScreen/cards/` that reads existing stores. New state (home place, card layout, Downloads batch, checklist change times) is owned by services under `src/features/`, with read-only zustand stores persisted under `@fieldkit/` keys. Projects and Models leave the tab bar and become pushed RootStack screens, reached from the Library and Phone cards. That change goes last, so every earlier task leaves the app working.

**Tech Stack:** React Native 0.83, React Navigation 7, zustand + AsyncStorage, Jest + RNTL with `__tests__/harness/nativeBoundary.ts`, one new dependency `@react-native-community/netinfo`.

**Spec:** `docs/superpowers/specs/2026-11-20-home-dashboard-design.md`

## Global Constraints

- "UI uses theme tokens only: `TYPOGRAPHY`, `COLORS` (via `useTheme`), `SPACING`. Font weights stay at or below 400. Icons come from `react-native-vector-icons` (Feather by default). No emoji in UI text."
- "Screens and hooks hold no business logic or authoritative state. Services own state machines, resources and side effects; stores are read-only projections for the UI."
- "One rendered integration test per fix: mount the real screen, reach the state through real gestures, assert what the user sees. Fake only at the device boundary (`__tests__/harness/`), never our own modules."
- New saved keys use `@fieldkit/<snake_case>`. Existing keys do not change.
- The app adds no location permission and no location library. NetInfo's Wi-Fi name lookup and its internet-reachability pings stay off.
- Nothing on Home needs the network. A card that reads the disk (guide records, storage) starts that read after `InteractionManager.runAfterInteractions`, so Home opens no slower than today.
- No GPL, AGPL or LGPL dependencies. After adding a dependency, run `node scripts/gen-notices.js` and commit `src/generated/thirdPartyNotices.json`.
- eslint limits: `max-lines` 500, `max-lines-per-function` 350, `complexity` 20, `max-params` 3, plus `react-native/no-inline-styles`, `no-color-literals` and `no-raw-text`.
- Before each commit run `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run depcruise`, `npm run knip`, and the task's test files with `npx jest <file>`. If a rendered suite times out, rerun it alone with `npx jest --runInBand <file>` before treating the failure as real.
- Work happens in a worktree (`superpowers:using-git-worktrees`, branch `feat/home-dashboard`). Git runs no Husky hooks there, so run `.husky/pre-push` by hand before any push. Run `npm install` from PowerShell, not Git Bash.
- Commit each green task separately with a per-concern message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**How Home rendered tests are set up.** Copy `__tests__/integration/home/homeRemoteModelTextCount.rendered.happy.test.tsx`:
1. Call `installNativeBoundary()` and `requireRTL()`, then `require` the screens.
2. Render `HomeScreen` with `{ navigation: nav }`, where `nav.navigate = jest.fn()`.
3. Mock `useFocusTrigger` to 0.

Screens that call `useNavigation`/`useRoute` take the `@react-navigation/native` mock from `__tests__/integration/kit/kit.rendered.test.tsx`, including `routeHolder` from `chatHarness`. When a test needs a model loaded, use `setupChatScreen()`.

To simulate a restart:
1. Unmount, keeping AsyncStorage.
2. Run `await <store>.persist.rehydrate()`.
3. Render again, as `__tests__/integration/checklists/checklists.rendered.test.tsx:120-128` does.

Each test gets a 30000 ms timeout. RNTL's `toHaveTextContent('x')` matches the element's whole text by default. Where a test below checks part of a row (a name inside a row that also holds counts), pass `{ exact: false }`. When a test needs a time zone, use `__tests__/harness/timeZoneEnvironment.js` with `{"timeZone": "Europe/London"}`. To pin the clock, use `jest.useFakeTimers({ now: new Date('2026-11-21T12:00:00Z'), advanceTimers: true })`.

## Review Focus

1. **A home place where the sun never rises or never sets** (Svalbard in June or December). The Today card says so in words, and the header leaves the sunset out. Pinned in Task 5's unit test.
2. **A saved card layout from an older or newer build**: unknown card ids, a missing card, a duplicate, an always-shown card marked hidden, or a corrupt value. Home still shows every card exactly once. Pinned in Task 8's unit test.
3. **Long names** (model names, chat titles, list names) stay on one line and don't push the chip or counts off the card. Pinned in Tasks 2 and 4 (`numberOfLines` 1).
4. **Phone storage can't be read** (`getFSInfo` rejects). The Phone card leaves out the storage line and still shows Models and Gallery. Pinned in Task 3.
5. **The ask box**: blank or spaces-only text can't be sent, the box clears after a send, and the question reaches the new chat exactly once. Pinned in Task 2.

---

### Task 1: Home place in Settings

**Files:**
- Create: `src/features/home/homePlace.ts`
- Create: `src/components/HomePlaceSheet.tsx`
- Modify: `src/screens/SettingsScreen.tsx` (add a row at the top of the navigation section, lines 179-208)
- Test: `__tests__/integration/settings/homePlace.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `export interface HomePlace { typed: string; lat: number; lon: number }`
  - `export const useHomePlaceStore`: zustand `persist`, name `@fieldkit/home_place`, state `{ place: HomePlace | null }`. Its `merge` keeps a saved place only when `typed` is a string and `lat` is in [-90, 90] and `lon` in [-180, 180], both finite. Otherwise `null`, written in the style of `readLists` in `checklistStore.ts`.
  - `export const homePlaceService = { set(typed: string): HomePlace; clear(): void }`. `set` trims the text and throws `new Error('Type a place first.')` when it's blank. Otherwise it calls `positionOf(trimmed)` from `src/services/tools/coordinateTools.ts`, lets that function's error through unchanged, and stores `{ typed: trimmed, lat, lon }`. Only this service writes the store.
  - `export const HomePlaceSheet: React.FC<{ visible: boolean; onClose: () => void }>`, built on `AppSheet` (title "Home place"). It holds a `TextInput` (testID `home-place-input`, placeholder `51.4778, -0.0015`, prefilled with the saved `typed`), the help line "Used for sunrise, sunset and moonrise on Home. Type a latitude and longitude, a UTM or an MGRS grid reference. The app never reads your location.", the error text (testID `home-place-error`), a `Button` "Save" (testID `home-place-save`) that calls `set` and closes on success, and a `Button` "Clear" (testID `home-place-clear`, shown only when a place is saved).

- [ ] **Step 1: Write the failing test**

```ts
it('saves a typed home place, keeps it after a restart, and clears it', async () => {
  // render SettingsScreen
  const row = () => view.getByTestId('settings-home-place');
  expect(rtl.within(row()).getByText('Home place')).toBeTruthy();
  expect(rtl.within(row()).getByText('Not set')).toBeTruthy();
  rtl.fireEvent.press(row());
  rtl.fireEvent.changeText(view.getByTestId('home-place-input'), 'nowhere');
  rtl.fireEvent.press(view.getByTestId('home-place-save'));
  const expected = (() => { try { positionOf('nowhere'); return ''; } catch (e) { return (e as Error).message; } })();
  expect(view.getByTestId('home-place-error')).toHaveTextContent(expected);
  rtl.fireEvent.changeText(view.getByTestId('home-place-input'), ' 51.4778, -0.0015 ');
  rtl.fireEvent.press(view.getByTestId('home-place-save'));
  await rtl.waitFor(() => expect(rtl.within(row()).getByText('51.4778, -0.0015')).toBeTruthy());
  // restart: unmount, rehydrate useHomePlaceStore from AsyncStorage '@fieldkit/home_place', render again
  expect(rtl.within(row()).getByText('51.4778, -0.0015')).toBeTruthy();
  rtl.fireEvent.press(row());
  rtl.fireEvent.press(view.getByTestId('home-place-clear'));
  await rtl.waitFor(() => expect(rtl.within(row()).getByText('Not set')).toBeTruthy());
}, 30000);
```

- [ ] **Step 2: Run it and watch it fail**
  Run: `npx jest __tests__/integration/settings/homePlace.rendered.test.tsx`. Expected: FAIL, because `settings-home-place` is not found.
- [ ] **Step 3: Implement `homePlace.ts`, `HomePlaceSheet` and the Settings row**
  The row (testID `settings-home-place`, Feather `map-pin`) uses the existing `navItem` styles. Its title is "Home place" and its description is `place?.typed ?? 'Not set'`. Pressing it opens `HomePlaceSheet`.
- [ ] **Step 4: Run the test and watch it pass**
  Same command. Expected: PASS.
- [ ] **Step 5: Run the checks and commit**
  Commit message: `feat(settings): a home place typed by hand for sunrise and sunset on Home`.

---

### Task 2: Assistant card and asking from Home

**Files:**
- Create: `src/screens/HomeScreen/cards/AssistantCard.tsx`
- Modify: `src/screens/HomeScreen/index.tsx`. Replace `ModelsSummaryRow`, the New Chat `Button`, the setup card block and `RecentConversations` (lines 148-213) with one `AssistantCard`. Keep the sheets, the overlay and the gallery card for now.
- Modify: `src/screens/HomeScreen/hooks/useHomeScreen.ts:224`, so that `recentConversations` holds the two most recently updated (sorted by `updatedAt` descending, as `ChatsListScreen.tsx:215` sorts).
- Modify: `src/navigation/types.ts:8` to `Chat: { conversationId?: string; projectId?: string; firstMessage?: string }`
- Modify: `src/screens/ChatScreen/useChatScreen.ts`. Add one effect after the `conversationId` and `projectId` effects (around line 286): when `route.params?.firstMessage` is set and a `useRef(false)` guard is unset, set the guard and call `handleSend(firstMessage)`.
- Modify: `__tests__/harness/chatHarness.ts`:
  - Line 137: drop the `new-chat-button` press. The new-chat gesture moves to the tab bar in Task 10, and `routeHolder.params = {}` already stands for it.
  - `openChat` (lines 396-403): open the conversation from `ChatsListScreen`'s `conversation-item-${index}`, in its sorted order, not from Home's list.
- Delete: `src/components/models/ModelsSummaryRow.tsx` and `__tests__/rntl/components/ModelsSummaryRow.test.tsx`
- Update:
  - `__tests__/integration/home/homeRemoteModelTextCount.rendered.happy.test.tsx`: assert the chip reads `llama-3-8b` with `model-chip-remote` shown, in place of the strip's counts.
  - `__tests__/rntl/screens/HomeScreen.test.tsx` and `__tests__/rntl/onboarding/HomeScreenSpotlight.test.tsx`: change cases that read `new-chat-button`, `model-summary-*` or `ModelsSummaryRow` to the chip and the ask box, and delete cases that only tested the strip.
- Test: `__tests__/integration/home/assistantCard.rendered.test.tsx`

**Interfaces:**
- Consumes: `useHomeScreen` returns (`activeTextModel`, `activeImageModel`, `activeRemoteTextModelId`, `loadingState`, `recentConversations`, `conversations`, `continueChat`, `handleDeleteConversation`, `downloadedModels`, `remoteTextModels`). Also `useVoiceInput` from `src/components/ChatInput/Voice.ts` and `VoiceRecordButton`.
- Produces:
  - `AssistantCard` props: `{ chip: { label: string; remote: boolean; loading: boolean }; onOpenModels: () => void; canChat: boolean; setup: React.ReactNode; onAsk: (text: string) => void; recent: React.ReactNode }`.
  - The model chip is an `AnimatedPressable` with testID `models-summary`, kept so the existing tests that open the manager sheet still work. It wraps `<AttachStep index={1}><AttachStep index={13}>`. Its label `Text` has testID `model-chip-label` and `numberOfLines={1}`. It shows Feather `server` (testID `model-chip-remote`) when the model is remote, and an `ActivityIndicator` while loading.
  - The chip label is the loaded text model's name. Otherwise it's `'Image model loaded'` when an image model is active, otherwise `'No model'`.
  - The ask box shows only when `canChat` (a text or image model is active). Otherwise `setup` (today's `setup-card`, copy and buttons unchanged) takes its place.
  - The ask box parts:
    - a `TextInput` with testID `home-ask-input` and placeholder `Ask anything`;
    - a `VoiceRecordButton` wired to `useVoiceInput({ onTranscript })`, where `onTranscript` appends with a space the way `voiceNoteSend.ts` `appendTranscript` does;
    - a send `AnimatedPressable` with testID `home-ask-send`, `accessibilityLabel="Send"`, and `disabled` while the trimmed text is empty.
  - Send calls `onAsk(trimmed)` and clears the box. HomeScreen's `onAsk` is `navigation.navigate('Chat', { firstMessage })`.
  - `recent` is today's `RecentConversations`, given the two items. Its "See all (N)" link is the spec's "All chats" link. My call: this reuses the component rather than forking it.

- [ ] **Step 1: Write the failing tests**

```ts
it('names the loaded model and sends a question from Home into a new chat exactly once', async () => {
  const { React, rtl, useChatStore } = await setupChatScreen({ engine: 'llama', sqlite: true });
  // render HomeScreen with nav
  const label = home.getByTestId('model-chip-label');
  expect(label).toHaveTextContent(useAppStore.getState().downloadedModels[0].name);
  expect(label.props.numberOfLines).toBe(1);
  expect(home.getByTestId('home-ask-send').props.accessibilityState.disabled).toBe(true);
  rtl.fireEvent.changeText(home.getByTestId('home-ask-input'), '   ');
  expect(home.getByTestId('home-ask-send').props.accessibilityState.disabled).toBe(true);
  rtl.fireEvent.changeText(home.getByTestId('home-ask-input'), 'How do I purify creek water?');
  rtl.fireEvent.press(home.getByTestId('home-ask-send'));
  expect(nav.navigate).toHaveBeenCalledTimes(1);
  expect(nav.navigate).toHaveBeenCalledWith('Chat', { firstMessage: 'How do I purify creek water?' });
  expect(home.getByTestId('home-ask-input').props.value).toBe('');
  home.unmount();
  require('../../harness/chatHarness').routeHolder.params = { firstMessage: 'How do I purify creek water?' };
  // render ChatScreen, then rerender it once
  await rtl.waitFor(() => expect(chat.getAllByText('How do I purify creek water?')).toHaveLength(1));
  const userTurns = useChatStore.getState().conversations[0].messages.filter((m: { role: string }) => m.role === 'user');
  expect(userTurns).toHaveLength(1);
}, 30000);

it('shows "No model" and the setup card when nothing is loaded', async () => {
  // installNativeBoundary() with no models; render HomeScreen
  expect(home.getByTestId('model-chip-label')).toHaveTextContent('No model');
  expect(home.getByTestId('setup-card')).toBeTruthy();
  expect(home.queryByTestId('home-ask-input')).toBeNull();
}, 30000);

it('lists the two most recently updated chats', async () => {
  // write three conversations to AsyncStorage 'local-llm-chat-storage' (the persisted shape of chatStore),
  // created in the order A, B, C with updatedAt B newest, then A, then C; rehydrate useChatStore; render HomeScreen
  expect(home.getByTestId('conversation-item-0')).toHaveTextContent('B');
  expect(home.getByTestId('conversation-item-1')).toHaveTextContent('A');
  expect(home.queryByTestId('conversation-item-2')).toBeNull();
  expect(home.getByText('See all (3)')).toBeTruthy();
}, 30000);
```

- [ ] **Step 2: Run them and watch them fail**
  Run: `npx jest __tests__/integration/home/assistantCard.rendered.test.tsx`. Expected: FAIL, because `model-chip-label` is not found.
- [ ] **Step 3: Implement `AssistantCard`, the HomeScreen swap, the sort, the `firstMessage` effect and the harness change**
- [ ] **Step 4: Run the new file and every test that uses the harness or Home**
  Run: `npx jest __tests__/integration/home __tests__/integration/chat __tests__/rntl/screens/HomeScreen.test.tsx __tests__/rntl/onboarding`. Expected: PASS.
- [ ] **Step 5: Run the checks and commit**
  Commit message: `feat(home): Assistant card with model chip, ask box and the last two chats`.

---

### Task 3: Field kit, Your library and Phone cards

**Files:**
- Create: `src/screens/HomeScreen/cards/FieldKitCard.tsx`, `src/screens/HomeScreen/cards/LibraryCard.tsx`, `src/screens/HomeScreen/cards/PhoneCard.tsx`
- Modify: `src/screens/KitScreen.tsx:20-25`. Export `KIT_ITEMS` and give each item a `short` label: `'Guides'`, `'Signals'`, `'Calc'`, `'Lists'`.
- Modify: `src/features/fieldGuides/fieldGuides.ts:15`. Export the list as `BUNDLED_GUIDES` (read-only) and keep `FIELD_GUIDES` uses internal.
- Modify: `src/services/hardware.ts`. Add `getStorage()`.
- Modify: `src/screens/HomeScreen/index.tsx`. Render the cards after `AssistantCard` in the order Field kit, Your library, Phone, and remove the old gallery card. Wrap each card in a `View` with testID `home-card-<id>` (`fieldKit`, `library`, `phone`; the Assistant's is `home-card-assistant`).
- Modify (if missing): `__tests__/harness/nativeBoundary.ts`. Add an `fsInfo` option for RNFS `getFSInfo`: a value, or `'fail'` to reject.
- Test: `__tests__/integration/home/homeCards.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `hardwareService.getStorage(): Promise<{ freeBytes: number; totalBytes: number }>`, from `RNFS.getFSInfo()` (`freeSpace`, `totalSpace`).
  - `BUNDLED_GUIDES: ReadonlyArray<{ asset: string; name: string; category: string }>`
  - Field kit card: one button per `KIT_ITEMS` entry showing its icon and `short` label, testIDs `home-kit-guides`, `home-kit-signals`, `home-kit-calc`, `home-kit-lists`, each opening `item.screen`.
  - Library card:
    - `home-library-guides` reads `${onPhone} on phone, ${taught} taught` from `libraryCounts`, with a second line `Plus ${BUNDLED_GUIDES.length} that come with the app`. It opens `GuideLibrary`. The card calls `guideLibraryService.init()` (disk only, no network) after interactions.
    - `home-library-kiwix` reads `${n} file`/`files` from `Object.keys(useKiwixStore().files).length` and opens `KiwixFiles`.
    - `home-library-projects` reads `${projects.length}` and opens `ProjectsTab` until Task 10.
  - Phone card:
    - The storage line is `${formatBytes(free)} free of ${formatBytes(total)}` (testID `home-phone-storage`), with a bar filled to the used share. It's read on focus after interactions, and the line is left out when the read rejects.
    - `home-phone-models` reads `${downloadedModels.length + downloadedImageModels.length} downloaded` and opens `ModelsTab` until Task 10.
    - `home-phone-gallery` reads `${n} image`/`images` and opens `Gallery`. It's left out when there are no image models and no images.
  - All row values use `numberOfLines={1}`.

- [ ] **Step 1: Write the failing tests**

```ts
it('opens each field kit tool from Home', async () => {
  for (const [id, route] of [['home-kit-guides', 'GuideLibrary'], ['home-kit-signals', 'QuickReference'], ['home-kit-calc', 'Calculators'], ['home-kit-lists', 'Checklists']]) {
    rtl.fireEvent.press(home.getByTestId(id));
    expect(nav.navigate).toHaveBeenLastCalledWith(route);
  }
}, 30000);

it('counts the library the way its own screens do', async () => {
  // seed through the device boundary as __tests__/integration/kiwix and __tests__/integration/kit do:
  // three Kiwix files, one catalogue guide downloaded and taught, one downloaded
  await rtl.waitFor(() => expect(home.getByTestId('home-library-guides')).toHaveTextContent('2 on phone, 1 taught'));
  expect(home.getByTestId('home-library-guides')).toHaveTextContent('Plus 6 that come with the app');
  expect(home.getByTestId('home-library-kiwix')).toHaveTextContent('3 files');
  expect(home.getByTestId('home-library-projects')).toHaveTextContent(String(useProjectStore.getState().projects.length));
  rtl.fireEvent.press(home.getByTestId('home-library-projects'));
  expect(nav.navigate).toHaveBeenLastCalledWith('ProjectsTab');
}, 30000);

it('shows free storage, models and gallery, and drops only the storage line when storage cannot be read', async () => {
  // installNativeBoundary({ fsInfo: { freeSpace: 41 * GB, totalSpace: 256 * GB } }), one downloaded text model
  await rtl.waitFor(() => expect(home.getByTestId('home-phone-storage')).toHaveTextContent('41.00 GB free of 256.00 GB'));
  expect(home.getByTestId('home-phone-models')).toHaveTextContent('1 downloaded');
  expect(home.queryByTestId('home-phone-gallery')).toBeNull();
  // remount with installNativeBoundary({ fsInfo: 'fail' })
  await rtl.waitFor(() => expect(home.getByTestId('home-phone-models')).toBeTruthy());
  expect(home.queryByTestId('home-phone-storage')).toBeNull();
}, 30000);
```

- [ ] **Step 2: Run them and watch them fail**
  Run: `npx jest __tests__/integration/home/homeCards.rendered.test.tsx`. Expected: FAIL, because `home-kit-guides` is not found.
- [ ] **Step 3: Implement the three cards, `getStorage`, the exports and the boundary option**
- [ ] **Step 4: Run the test and the Kit test**
  Run: `npx jest __tests__/integration/home __tests__/integration/kit`. Expected: PASS.
- [ ] **Step 5: Run the checks and commit**
  Commit message: `feat(home): Field kit, Your library and Phone cards`.

---

### Task 4: Checklists card

**Files:**
- Modify: `src/features/checklists/checklistStore.ts`
  - `Checklist` gains `changedAt: number`.
  - `readLists` keeps a finite saved `changedAt` and uses `0` otherwise.
  - Add `recentlyChanged`.
- Modify: `src/features/checklists/checklistService.ts`. Every write that creates or changes a list sets that list's `changedAt = Date.now()`.
- Modify: `src/navigation/types.ts:17` to `Checklists: { listId?: string } | undefined`
- Modify: `src/screens/ChecklistsScreen.tsx:39`. Read `useRoute().params?.listId` as the initial `openId`.
- Create: `src/screens/HomeScreen/cards/ChecklistsCard.tsx`. Mount it in HomeScreen after the Library card, in `home-card-checklists`.
- Test: `__tests__/integration/home/checklistsCard.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `export function recentlyChanged(lists: Checklist[], count: number): Checklist[]`, sorted by `changedAt` descending. Ties keep store order (newest created first).
  - The card shows up to 3 rows, `home-checklist-${index}`. Each row has the list name (`numberOfLines={1}`), `${done} of ${total}`, and a bar using the shared `ProgressBar`. A row opens `navigate('Checklists', { listId })`, and the card title opens `Checklists`.
  - With no lists, the card shows one line (testID `home-checklists-empty`): "No lists yet. Start from a ready-made kit list." It opens `Checklists`.

- [ ] **Step 1: Write the failing test**

```ts
it('shows the most recently changed lists first and opens the one tapped', async () => {
  // ChecklistsScreen: setSystemTime 10:00 start STARTER_LISTS[0], 10:01 start [1], 10:02 start [2], back to the
  // lists, 10:03 open STARTER_LISTS[0]'s list and tick its first item
  // HomeScreen:
  const [first, second, third] = [0, 1, 2].map(i => home.getByTestId(`home-checklist-${i}`));
  expect(first).toHaveTextContent(STARTER_LISTS[0].name);
  expect(first).toHaveTextContent(`1 of ${STARTER_LISTS[0].items.length}`);
  expect(second).toHaveTextContent(STARTER_LISTS[2].name);
  expect(third).toHaveTextContent(STARTER_LISTS[1].name);
  expect(rtl.within(first).getByText(STARTER_LISTS[0].name).props.numberOfLines).toBe(1);
  // restart (rehydrate '@fieldkit/checklists'): same order
  rtl.fireEvent.press(first);
  const listId = useChecklistStore.getState().lists.find(l => l.name === STARTER_LISTS[0].name)!.id;
  expect(nav.navigate).toHaveBeenLastCalledWith('Checklists', { listId });
  // ChecklistsScreen with routeHolder.params = { listId } opens straight on that list
  expect(lists.getByText(`${STARTER_LISTS[0].name} (1 of ${STARTER_LISTS[0].items.length})`)).toBeTruthy();
}, 30000);
```

- [ ] **Step 2: Run it and watch it fail**
  Run: `npx jest __tests__/integration/home/checklistsCard.rendered.test.tsx`. Expected: FAIL, because `home-checklist-0` is not found.
- [ ] **Step 3: Implement `changedAt`, `recentlyChanged`, the route parameter and the card**
- [ ] **Step 4: Run it with the checklist suites**
  Run: `npx jest __tests__/integration/home/checklistsCard.rendered.test.tsx __tests__/integration/checklists`. Expected: PASS.
- [ ] **Step 5: Run the checks and commit**
  Commit message: `feat(home): Checklists card, most recently changed first`.

---

### Task 5: Today card and the header's date line

**Files:**
- Modify: `src/services/tools/sunTools.ts`. Export `sunCrossings` and make `sunTimes` (line 175) use it for its day choice, so both print the same minutes.
- Create: `src/features/home/todaySky.ts`
- Create: `src/screens/HomeScreen/cards/TodayCard.tsx`. Mount it after Checklists, in `home-card-today`.
- Modify: `src/screens/HomeScreen/index.tsx`. Under the app name, add the date line (testID `home-date`).
- Test: `__tests__/unit/features/todaySky.test.ts`, `__tests__/integration/home/todayCard.rendered.test.tsx`

**Interfaces:**
- Consumes: `useHomePlaceStore`, `HomePlaceSheet` (Task 1), and `moonDay(place, start)` from `src/services/tools/moonTools.ts:94`.
- Produces:
  - `export function sunCrossings(place: { lat: number; lon: number }, now: Date): { rise: number | 'above' | 'below'; set: number | 'above' | 'below' }`. This is the `dayStart` choice and the `SUNRISE_ZENITH` crossings of `sunTimes` at lines 179-199, with no date or offset arguments, so the phone's offset is used.
  - `export function todaySky(place: { lat: number; lon: number }, now: Date): { sunrise: string | null; sunset: string | null; sunAllDay: 'up' | 'down' | null; moonrise: string | null }`. Times are local `HH:MM`, rounded to the nearest minute like the calculator's `clock`. `sunAllDay` is `'up'` or `'down'` when there's no crossing. `moonrise` is the first rising in `moonDay` over the same 24 hours `sunTimes`'s moon line covers, or `null`.
  - `export function formatDay(now: Date): string`, giving `'Sat 21 Nov'` from fixed English day and month arrays.
  - Card:
    - The sun row (testID `today-sun`) reads `sunrise 07:28  sunset 16:03`, or `Sun up all day` / `Sun down all day`.
    - The moon row (testID `today-moon`) reads `moonrise 14:04`, or `No moonrise today`.
    - Times are recomputed on focus, so a Home left open overnight updates.
    - With no home place, the card shows `Set your place` (testID `today-set-place`), which opens `HomePlaceSheet` right on Home. My call: this is the same editor as the Settings row, one tap fewer.
  - The header date line reads `${formatDay(now)} · sunset ${sunset}` when there's a sunset time, otherwise `formatDay(now)`.

- [ ] **Step 1: Write the failing unit test** (London time zone, using the docblock from Global Constraints)

```ts
expect(todaySky({ lat: 51.4778, lon: -0.0015 }, new Date('2026-11-21T12:00:00Z')))
  .toEqual({ sunrise: '07:28', sunset: '16:03', sunAllDay: null, moonrise: '14:04' });
expect(todaySky({ lat: 78.22, lon: 15.65 }, new Date('2026-06-21T12:00:00Z')))
  .toEqual({ sunrise: null, sunset: null, sunAllDay: 'up', moonrise: '11:29' });
expect(todaySky({ lat: 78.22, lon: 15.65 }, new Date('2026-12-21T12:00:00Z')))
  .toEqual({ sunrise: null, sunset: null, sunAllDay: 'down', moonrise: null });
expect(formatDay(new Date('2026-11-21T12:00:00Z'))).toBe('Sat 21 Nov');
```

These numbers come from today's `sunTimes` for the same places and dates: Greenwich gives "sunrise 07:28 … sunset 16:03 … moonrise 14:04", and Svalbard gives "up all day … moonrise 11:29" in June and "below the horizon all day … up all day" in December.

- [ ] **Step 2: Write the failing rendered test** (London time zone, clock at 2026-11-21 12:00 UTC)

```ts
it('asks for a place, then shows today\'s sun and moon and the sunset in the header', async () => {
  // render HomeScreen with no home place
  expect(home.getByTestId('home-date')).toHaveTextContent('Sat 21 Nov');
  expect(home.getByTestId('home-date')).not.toHaveTextContent('sunset');
  rtl.fireEvent.press(home.getByTestId('today-set-place'));
  rtl.fireEvent.changeText(home.getByTestId('home-place-input'), '51.4778, -0.0015');
  rtl.fireEvent.press(home.getByTestId('home-place-save'));
  await rtl.waitFor(() => expect(home.getByTestId('today-sun')).toHaveTextContent('sunrise 07:28'));
  expect(home.getByTestId('today-sun')).toHaveTextContent('sunset 16:03');
  expect(home.getByTestId('today-moon')).toHaveTextContent('moonrise 14:04');
  expect(home.getByTestId('home-date')).toHaveTextContent('Sat 21 Nov · sunset 16:03');
}, 30000);
```

- [ ] **Step 3: Run both and watch them fail**
  Run: `npx jest __tests__/unit/features/todaySky.test.ts __tests__/integration/home/todayCard.rendered.test.tsx`. Expected: FAIL, because `todaySky` is not exported.
- [ ] **Step 4: Implement `sunCrossings`, `todaySky`, `formatDay`, the card and the date line**
- [ ] **Step 5: Run both again with the existing sun tests**
  Run: `npx jest todaySky todayCard sun calculators`. Jest reads each argument as a path pattern, so this picks up the existing sun tool tests too. Expected: PASS, with `sunTimes` output unchanged.
- [ ] **Step 6: Run the checks and commit**
  Commit message: `feat(home): Today card with sunrise, sunset and moonrise for the home place`.

---

### Task 6: Downloads card

**Files:**
- Modify: `src/features/guideLibrary/guideLibraryStore.ts`. `GuideLibraryState` gains `batch: { total: number; done: number } | null`, initially `null`.
- Modify: `src/features/guideLibrary/guideLibraryService.ts:334` (`downloadAll`):
  1. At the start, set `batch = { total: toDownload(state).length, done: 0 }`.
  2. Add 1 to `done` after each of those guides finishes, whether it succeeds or fails.
  3. Set `batch = null` in the `finally`.
- Create: `src/features/home/downloadSummary.ts`
- Create: `src/screens/HomeScreen/cards/DownloadsCard.tsx`. Render it directly after the Assistant card wherever that card is, outside the layout list.
- Test: `__tests__/unit/features/downloadSummary.test.ts`, `__tests__/integration/home/downloadsCard.rendered.test.tsx`

**Interfaces:**
- Consumes: `useDownloads().active` (`DownloadEntry[]`, `progress` 0..1) and `useGuideLibraryStore` (`guides`, `batch`).
- Produces:
  - `export interface DownloadSummary { title: string; count: string | null; fraction: number; opens: 'DownloadManager' | 'GuideLibrary' }`
  - `export function downloadSummary(models: DownloadEntry[], guides: Pick<GuideLibraryState, 'guides' | 'batch'>): DownloadSummary | null`. It returns null when there are no model entries and no guide in phase `'downloading'`.
    - `title`: `'Downloading '` followed by `${m} model(s)` and/or `${g} guide(s)`, joined with `' and '`. `g` is `batch.total - batch.done` during a batch, otherwise the number of guides downloading.
    - `count`: `${done} of ${total}` during a batch, otherwise `null`.
    - `fraction`: the mean over the items. Each model counts as its `progress`. During a batch, each of `batch.total` guides counts 1 when done, its `progress` while downloading, and 0 otherwise. Outside a batch, each downloading guide counts as its `progress`.
    - `opens`: `'DownloadManager'` when any model is downloading, otherwise `'GuideLibrary'`.
  - Card: testID `home-downloads`, Feather `download`, the title, the count, and a bar at `fraction`. Pressing opens `opens`.

- [ ] **Step 1: Write the failing unit test**

```ts
const model = (progress: number) => ({ progress, status: 'running' }) as DownloadEntry;
const dl = (progress: number) => ({ phase: 'downloading' as const, progress });
expect(downloadSummary([], { guides: {}, batch: null })).toBeNull();
expect(downloadSummary([model(0.5)], { guides: {}, batch: null }))
  .toEqual({ title: 'Downloading 1 model', count: null, fraction: 0.5, opens: 'DownloadManager' });
expect(downloadSummary([], { guides: { a: dl(0.2), b: dl(0.6) }, batch: null }))
  .toEqual({ title: 'Downloading 2 guides', count: null, fraction: 0.4, opens: 'GuideLibrary' });
expect(downloadSummary([], { guides: { c: dl(0.5) }, batch: { total: 5, done: 2 } }))
  .toEqual({ title: 'Downloading 3 guides', count: '2 of 5', fraction: 0.5, opens: 'GuideLibrary' });
expect(downloadSummary([model(1)], { guides: { d: dl(0) }, batch: { total: 4, done: 1 } }))
  .toEqual({ title: 'Downloading 1 model and 3 guides', count: '1 of 4', fraction: 0.4, opens: 'DownloadManager' });
```

- [ ] **Step 2: Write the failing rendered test**
  Start a text-model download through the background-download boundary, as `__tests__/integration/downloads/downloadedCountBadge.rendered.happy.test.tsx` does. Then:
  1. Home shows `home-downloads` with "Downloading 1 model".
  2. When the boundary reports 50%, the bar is at half.
  3. Pressing the card calls `navigate('DownloadManager')`.
  4. When the boundary reports the download finished, `home-downloads` is gone.
- [ ] **Step 3: Run both and watch them fail**
  Run: `npx jest __tests__/unit/features/downloadSummary.test.ts __tests__/integration/home/downloadsCard.rendered.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement the batch fields, `downloadSummary` and the card**
- [ ] **Step 5: Run both again with the guide library suites**
  Run: `npx jest __tests__/unit/features/downloadSummary.test.ts __tests__/integration/home/downloadsCard.rendered.test.tsx __tests__/integration/kit`. Expected: PASS.
- [ ] **Step 6: Run the checks and commit**
  Commit message: `feat(home): Downloads card while models or guides download`.

---

### Task 7: Offline label and slim header

**Files:**
- Modify: `package.json`, `package-lock.json`. From PowerShell, run `npm install @react-native-community/netinfo@<newest release whose peerDependencies accept react-native 0.83>`. Check its licence is MIT with `npm view @react-native-community/netinfo license peerDependencies`.
- Modify: `src/generated/thirdPartyNotices.json` (run `node scripts/gen-notices.js`)
- Create: `src/services/networkStatus.ts`
- Create: `__tests__/harness/netInfoFake.ts`. Register it in `jest.setup.ts` as the module's mock.
- Create: `src/screens/HomeScreen/HomeHeader.tsx`. It holds the header moved out of `index.tsx`: the app name, `PulsatingIcon`, the date line and the Offline label. It sits outside the `ScrollView`, so it stays at the top.
- Test: `__tests__/integration/home/homeHeader.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `export function useOffline(): boolean` in `networkStatus.ts`. On first use it calls `NetInfo.configure({ reachabilityShouldRun: () => false, shouldFetchWiFiSSID: false })`. It's `true` only while `NetInfo.addEventListener` reports `isConnected === false`.
  - `netInfoFake`: `setConnected(connected: boolean): void`, which calls the registered listeners, and `lastConfig(): NetInfoConfiguration | undefined`.
  - Header: an `Offline` label (testID `home-offline`) while offline, and nothing when online. When the Home `ScrollView` is scrolled past 40 px, the header turns slim: the date line (`home-date`) and the Offline label hide, leaving the app name (and the search button from Task 9). Scrolling back to the top brings them back. The animation is left to the builder.

- [ ] **Step 1: Write the failing test**

```ts
it('shows Offline only without a connection, never pings, and slims on scroll', async () => {
  // render HomeScreen; netInfoFake starts connected
  expect(home.queryByTestId('home-offline')).toBeNull();
  rtl.act(() => netInfoFake.setConnected(false));
  expect(home.getByTestId('home-offline')).toHaveTextContent('Offline');
  rtl.act(() => netInfoFake.setConnected(true));
  expect(home.queryByTestId('home-offline')).toBeNull();
  expect(netInfoFake.lastConfig()?.reachabilityShouldRun?.()).toBe(false);
  expect(netInfoFake.lastConfig()?.shouldFetchWiFiSSID).toBe(false);
  rtl.fireEvent.scroll(home.getByTestId('home-scroll'), { nativeEvent: { contentOffset: { y: 120 }, contentSize: { height: 2000, width: 400 }, layoutMeasurement: { height: 800, width: 400 } } });
  expect(home.queryByTestId('home-date')).toBeNull();
  rtl.fireEvent.scroll(home.getByTestId('home-scroll'), { nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 2000, width: 400 }, layoutMeasurement: { height: 800, width: 400 } } });
  expect(home.getByTestId('home-date')).toBeTruthy();
}, 30000);
```

- [ ] **Step 2: Run it and watch it fail**
  Run: `npx jest __tests__/integration/home/homeHeader.rendered.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Install the dependency, regenerate the notices, and implement `networkStatus`, the fake and `HomeHeader`**
  Give the `ScrollView` testID `home-scroll`.
- [ ] **Step 4: Run all Home tests**
  Run: `npx jest __tests__/integration/home`. Expected: PASS.
- [ ] **Step 5: Run the checks and commit**
  Commit the dependency and notices in one commit (`chore(deps): add @react-native-community/netinfo for the Offline label`), then the feature in another (`feat(home): Offline label and a header that slims on scroll`).

---

### Task 8: Edit home

**Files:**
- Create: `src/features/home/homeLayout.ts`
- Create: `src/screens/EditHomeScreen.tsx`, exported from `src/screens/index.ts`
- Modify: `src/navigation/types.ts` (add `EditHome: undefined`) and `src/navigation/AppNavigator.tsx` (add the RootStack screen)
- Modify: `src/screens/HomeScreen/index.tsx`. Render the cards from `shownCards(layout)` instead of the fixed order. At the bottom, add an `Edit home` link (testID `home-edit`) that opens `EditHome`.
- Test: `__tests__/unit/features/homeLayout.test.ts`, `__tests__/integration/home/editHome.rendered.test.tsx`

**Interfaces:**
- Produces:
  - `export type HomeCardId = 'assistant' | 'fieldKit' | 'library' | 'checklists' | 'today' | 'phone'`
  - `export const DEFAULT_ORDER: readonly HomeCardId[] = ['assistant', 'fieldKit', 'library', 'checklists', 'today', 'phone']`
  - `export const ALWAYS_SHOWN: readonly HomeCardId[] = ['assistant', 'library', 'phone']`
  - `export function readLayout(saved: unknown): { order: HomeCardId[]; hidden: HomeCardId[] }`:
    - Unknown and duplicate ids are dropped.
    - A missing id goes right after the nearest card that comes before it in `DEFAULT_ORDER`, or first if there is none.
    - `hidden` keeps only known ids that are not in `ALWAYS_SHOWN`.
    - A value that isn't an object gives the default layout.
  - `export const useHomeLayoutStore`: `persist` named `@fieldkit/home_layout`, with `merge` going through `readLayout`.
  - `export const homeLayoutService = { move(id: HomeCardId, by: -1 | 1): void; setHidden(id: HomeCardId, hidden: boolean): void; reset(): void }`. `setHidden` on an `ALWAYS_SHOWN` id throws `new Error('This card stays on Home.')`.
  - `export function shownCards(layout: { order: HomeCardId[]; hidden: HomeCardId[] }): HomeCardId[]`
  - Edit home screen:
    - It uses the back-arrow header pattern of `GuideLibraryScreen.tsx:185-191`, titled "Edit home".
    - It has one row per card in order. The names are `Assistant`, `Field kit`, `Your library`, `Checklists`, `Today`, `Phone`.
    - Each row has up (`edit-home-up-<id>`, disabled when first) and down (`edit-home-down-<id>`, disabled when last) buttons. Hideable cards get a `Switch` (`edit-home-show-<id>`, on means shown); `ALWAYS_SHOWN` rows get the note "Always on Home" instead.
    - At the bottom, a "Reset to default" button (`edit-home-reset`).

- [ ] **Step 1: Write the failing unit test**

```ts
expect(readLayout(undefined)).toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
expect(readLayout('junk')).toEqual({ order: [...DEFAULT_ORDER], hidden: [] });
expect(readLayout({ order: ['phone', 'assistant', 'radio', 'phone'], hidden: ['assistant', 'today', 'x'] }))
  .toEqual({ order: ['phone', 'assistant', 'fieldKit', 'library', 'checklists', 'today'], hidden: ['today'] });
expect(shownCards({ order: ['today', 'assistant', 'fieldKit', 'library', 'checklists', 'phone'], hidden: ['checklists'] }))
  .toEqual(['today', 'assistant', 'fieldKit', 'library', 'phone']);
```

- [ ] **Step 2: Write the failing rendered test**

```ts
it('moves and hides cards, keeps the three always-shown ones, and remembers the layout', async () => {
  const order = (v: any) => v.getAllByTestId(/^home-card-/).map((n: any) => n.props.testID);
  expect(order(home)).toEqual(['home-card-assistant', 'home-card-fieldKit', 'home-card-library', 'home-card-checklists', 'home-card-today', 'home-card-phone']);
  rtl.fireEvent.press(home.getByTestId('home-edit'));
  expect(nav.navigate).toHaveBeenLastCalledWith('EditHome');
  // render EditHomeScreen
  rtl.fireEvent.press(edit.getByTestId('edit-home-up-today'));
  rtl.fireEvent.press(edit.getByTestId('edit-home-up-today'));
  rtl.fireEvent(edit.getByTestId('edit-home-show-checklists'), 'valueChange', false);
  for (const id of ['assistant', 'library', 'phone']) expect(edit.queryByTestId(`edit-home-show-${id}`)).toBeNull();
  // render HomeScreen
  expect(order(home)).toEqual(['home-card-assistant', 'home-card-fieldKit', 'home-card-today', 'home-card-library', 'home-card-phone']);
  // restart (rehydrate '@fieldkit/home_layout'): same order
}, 30000);
```

- [ ] **Step 3: Run both and watch them fail**
  Run: `npx jest __tests__/unit/features/homeLayout.test.ts __tests__/integration/home/editHome.rendered.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement `homeLayout.ts`, `EditHomeScreen`, the route and the layout-driven Home**
- [ ] **Step 5: Run all Home tests**
  Run: `npx jest __tests__/unit/features/homeLayout.test.ts __tests__/integration/home`. Expected: PASS.
- [ ] **Step 6: Run the checks and commit**
  Commit message: `feat(home): Edit home to move and hide cards`.

---

### Task 9: Search

**Files:**
- Create: `src/features/home/homeSearch.ts`
- Create: `src/screens/HomeSearchScreen.tsx`, exported from `src/screens/index.ts`
- Modify: `src/navigation/types.ts`. Add `HomeSearch: undefined` and change `QuickReference` to `{ cardId?: string } | undefined`. Modify `AppNavigator.tsx` to add the screen.
- Modify: `src/screens/QuickReferenceScreen.tsx:21`. The open set starts with `route.params?.cardId` when it's given.
- Modify: `src/features/fieldGuides/fieldGuides.ts`. Add `bundledGuidePreview`.
- Modify: `src/screens/HomeScreen/HomeHeader.tsx`. Add a search button (testID `home-search-button`, Feather `search`, `accessibilityLabel="Search"`) that opens `HomeSearch`. It stays in the slim header.
- Test: `__tests__/unit/features/homeSearch.test.ts`, `__tests__/integration/home/homeSearch.rendered.test.tsx`

**Interfaces:**
- Consumes: `BUNDLED_GUIDES` (Task 3), `QUICK_REFERENCE_CARDS`, `isOnPhone` / `stateOf` from `guideLibraryStore.ts`, and `Checklist` (Task 4).
- Produces:
  - `export type HomeHit = { kind: 'chat' | 'guide' | 'checklist' | 'reference'; id: string; title: string } | { kind: 'bundledGuide'; asset: string; title: string }`
  - `export function searchHome(typed: string, sources: { conversations: Conversation[]; guides: GuideEntry[]; checklists: Checklist[] }): HomeHit[]`:
    - Only titles are searched. Matching is case-insensitive, and every word of the trimmed text must appear in the title, in any order. Blank text gives `[]`.
    - Each source maps to a kind: `conversations` to chat, `guides` to guide (the caller passes only guides on the phone), the internal `BUNDLED_GUIDES` to bundledGuide (title is `name` without `.pdf`), `checklists` to checklist (title is `name`), and `QUICK_REFERENCE_CARDS` to reference.
    - Results come in the kind order chat, guide, bundledGuide, checklist, reference. Within a kind, titles that start with the text come first, then source order. At most 50 results.
  - `export async function bundledGuidePreview(asset: string): Promise<{ filePath: string; fileName: string; fileSize: number }>`. The path is `${RNFS.DocumentDirectoryPath}/field-guides/${asset}`, `fileName` is the guide's `name`, and the size comes from `RNFS.stat`.
  - Search screen:
    - A `TextInput` with testID `home-search-input`, `autoFocus`, and placeholder `Search chats, guides, lists and signals`.
    - Result rows `home-search-hit-${index}`, each with the title (`numberOfLines={1}`) and a kind label: `Chat`, `Guide`, `Guide`, `Checklist`, `Quick reference`.
    - When typed text matches nothing, it shows (`home-search-empty`) "No titles match. To search inside guides, ask the assistant."
    - The screen calls `guideLibraryService.init()` on mount.
  - What a tapped hit opens:
    - chat: `navigate('Chat', { conversationId })`
    - guide: `guideLibraryService.open(id)`
    - bundledGuide: `navigate('DocumentPreview', await bundledGuidePreview(asset))`
    - checklist: `navigate('Checklists', { listId })`
    - reference: `navigate('QuickReference', { cardId })`

- [ ] **Step 1: Write the failing unit test**

```ts
const conv = { id: 'c1', title: 'Purifying creek water', updatedAt: '2026-11-21T10:00:00Z' } as Conversation;
const guide = { id: 'g1', title: 'Water Treatment in the Backcountry' } as GuideEntry;
const list = { id: 'l1', name: 'Car kit', items: [], changedAt: 0 };
const sources = { conversations: [conv], guides: [guide], checklists: [list] };
expect(searchHome('   ', sources)).toEqual([]);
expect(searchHome('water', sources)).toEqual([
  { kind: 'chat', id: 'c1', title: 'Purifying creek water' },
  { kind: 'guide', id: 'g1', title: 'Water Treatment in the Backcountry' },
  { kind: 'bundledGuide', asset: 'nrcs-tn28-solar-pumps.pdf', title: 'Solar-Powered Water Pump Systems (USDA NRCS Technical Note 28)' },
]);
expect(searchHome('WATER creek', sources).map(h => h.kind)).toEqual(['chat']);
const morse = QUICK_REFERENCE_CARDS.find(c => c.id === 'morse')!;
expect(searchHome(morse.title.split(' ')[0], sources)).toContainEqual({ kind: 'reference', id: 'morse', title: morse.title });
```

- [ ] **Step 2: Write the failing rendered test**

```ts
it('finds a checklist, a bundled guide and nothing, and opens what was tapped', async () => {
  // ChecklistsScreen: start STARTER_LISTS[1] (the car kit list)
  rtl.fireEvent.press(home.getByTestId('home-search-button'));
  expect(nav.navigate).toHaveBeenLastCalledWith('HomeSearch');
  // render HomeSearchScreen
  rtl.fireEvent.changeText(search.getByTestId('home-search-input'), 'car');
  expect(search.getByTestId('home-search-hit-0')).toHaveTextContent(STARTER_LISTS[1].name);
  expect(search.getByTestId('home-search-hit-0')).toHaveTextContent('Checklist');
  rtl.fireEvent.press(search.getByTestId('home-search-hit-0'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Checklists', { listId: useChecklistStore.getState().lists[0].id });
  rtl.fireEvent.changeText(search.getByTestId('home-search-input'), 'solar');
  rtl.fireEvent.press(search.getByTestId('home-search-hit-0'));
  await rtl.waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith('DocumentPreview', expect.objectContaining({
    filePath: expect.stringMatching(/field-guides\/nrcs-tn28-solar-pumps\.pdf$/),
    fileName: 'Solar-Powered Water Pump Systems (USDA NRCS Technical Note 28).pdf',
  })));
  rtl.fireEvent.changeText(search.getByTestId('home-search-input'), 'zzzz');
  expect(search.getByTestId('home-search-empty')).toBeTruthy();
  // QuickReferenceScreen with routeHolder.params = { cardId: 'morse' } shows that card open
}, 30000);
```

- [ ] **Step 3: Run both and watch them fail**
  Run: `npx jest __tests__/unit/features/homeSearch.test.ts __tests__/integration/home/homeSearch.rendered.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement `searchHome`, `bundledGuidePreview`, the screen, the route parameter and the header button**
- [ ] **Step 5: Run them with the Quick reference suite**
  Run: `npx jest __tests__/unit/features/homeSearch.test.ts __tests__/integration/home __tests__/integration/quickReference`. Expected: PASS.
- [ ] **Step 6: Run the checks and commit**
  Commit message: `feat(home): search chats, guides, checklists and Quick reference by title`.

---

### Task 10: Five-place tab bar; Projects and Models become pushed screens

**Files:**
- Modify: `src/navigation/types.ts`:
  - `MainTabParamList = { HomeTab: undefined; ChatsTab: undefined; NewChatTab: undefined; KitTab: undefined; SettingsTab: undefined }`
  - `RootStackParamList` gains `Models: { initialTab?: 'text' | 'image' | 'voice' | 'transcription'; repairModelId?: string; initialSearchQuery?: string } | undefined` and `Projects: undefined`.
- Modify: `src/navigation/AppNavigator.tsx`:
  - Remove the `ProjectsTab` and `ModelsTab` tab screens and their icon entries.
  - Add `NewChatTab` (component `() => null`, `tabBarButton` set to `NewChatTabButton`, a `tabPress` listener that calls `e.preventDefault()`).
  - Add RootStack `Models` and `Projects`.
  - Change `tabBarLabelStyle.fontWeight` to `'400'`.
- Create: `src/navigation/NewChatTabButton.tsx`
- Modify: `src/screens/ModelsScreen/index.tsx:27` and `types.ts:59-62`, and `src/screens/ProjectsScreen.tsx:28-31`. Use RootStack route and navigation types, and add the back arrow of `GuideLibraryScreen.tsx:185-191` to each header (testIDs `models-back`, `projects-back`).
- Modify the call sites:
  - `src/screens/HomeScreen/index.tsx` (`'ModelsTab'` becomes `'Models'`, including the Phone card; `'ProjectsTab'` becomes `'Projects'` in the Library card)
  - `src/screens/ChatsListScreen.tsx:290`
  - `src/screens/HomeScreen/hooks/useHomeScreenSpotlight.ts:39`
  - `src/components/onboarding/spotlightConfig.tsx:74-81` (`STEP_TAB_MAP` values `'ModelsTab'`→`'Models'`, `'ProjectsTab'`→`'Projects'`)
- Update tests:
  - `__tests__/rntl/navigation/AppNavigator.test.tsx` (182-200, 282-290)
  - `__tests__/rntl/screens/HomeScreen.test.tsx` (489-493, 990-998, 1405-1432)
  - `__tests__/rntl/onboarding/HomeScreenSpotlight.test.tsx` (189-197, 248-256, 321-329)
  - `__tests__/unit/onboarding/handleStepPress.test.ts` (82, 141, 176-178, 242-244, 331-333)
  - `__tests__/unit/onboarding/onboardingFlows.test.ts` (80-85)
  - `__tests__/integration/onboarding/spotlightFlowIntegration.test.ts:197`
  - `__tests__/integration/home/homeCards.rendered.test.tsx` (expect `'Projects'`)
- Update the Maestro flows:
  - `id: models-tab` and `text: "Models"` taps become a scroll to and tap of `id: home-phone-models`.
  - `id: projects-tab` taps become `id: home-library-projects`.
  - Files: `.maestro/flows/p0/00-setup-model.yaml:120`, `p0/01e-tab-navigation.yaml:54-62`, `p2/05b-model-download.yaml:71`, `p2/05a-model-uninstall.yaml:75`, `p3/07a-image-model-uninstall.yaml:62`, `p3/07b-image-model-download.yaml:62`, `e2e/maestro/models_screen_navigation.yaml:12`, `e2e/maestro/import_vision_model.yaml:23`.
  - These can't run here; note that in the commit message.
- Test: `__tests__/integration/app/tabBar.rendered.test.tsx`

**Interfaces:**
- Produces: `NewChatTabButton`:
  - a round raised button, testID `new-chat-button` (so the Maestro flows that tap it keep working), `accessibilityLabel="New chat"`, Feather `plus` on `colors.primary`;
  - with a text model (`useActiveTextModel().modelId`) or an image model (`useAppStore(s => s.activeImageModelId)`) active, it calls `navigate('Chat', {})`;
  - otherwise it calls `navigate('HomeTab')`, where the setup card is.

- [ ] **Step 1: Write the failing test**
  Mount the real `AppNavigator` in a `NavigationContainer`, as `__tests__/integration/onboarding/serverModelConfiguredSkipsOnboarding.test.tsx` does. Assert:
  1. The bar shows `Home`, `Chats`, `Kit` and `Settings` and the `new-chat-button`, and `projects-tab` / `models-tab` are not found.
  2. With no model, pressing `new-chat-button` leaves `home-screen` showing.
  3. After loading a model through the setup card's picker, pressing it shows the chat screen's input.
  4. Back on Home, `home-library-projects` shows the `Projects` header, and `projects-back` returns to `home-screen`.
  5. `home-phone-models` shows `models-screen`, and `models-back` returns.
- [ ] **Step 2: Run it and watch it fail**
  Run: `npx jest __tests__/integration/app/tabBar.rendered.test.tsx`. Expected: FAIL, because `new-chat-button` is not found.
- [ ] **Step 3: Implement the bar, the button, the routes, the back arrows and the call sites, and update the tests and flows listed above**
- [ ] **Step 4: Run the touched suites**
  Run: `npx jest __tests__/integration/app __tests__/integration/home __tests__/integration/onboarding __tests__/rntl/navigation __tests__/rntl/screens/HomeScreen.test.tsx __tests__/rntl/onboarding __tests__/unit/onboarding`. Expected: PASS.
- [ ] **Step 5: Run the checks and commit**
  Commit message: `feat(nav): five-place tab bar with a raised New chat; Projects and Models open from Home`.

---

### Task 11: Whole-branch check and a phone build

**Files:** none new.

- [ ] **Step 1: Run the full suite in the background**
  Run: `npx jest`. Expected: every suite passes. Rerun any timeout alone with `--runInBand`.
- [ ] **Step 2: Run the static checks**
  Run: `npx tsc --noEmit`, `npx eslint src __tests__`, `npm run depcruise`, `npm run knip`. Expected: no errors, and knip reports no unused export left over from `ModelsSummaryRow` or the old tab types.
- [ ] **Step 3: Run the push hook by hand**
  Run: `bash .husky/pre-push`. Expected: exit 0.
- [ ] **Step 4: Build and install the standalone debug APK**
  Follow the memory note "Fieldkit standalone debug APK" (`build-standalone.sh` into an empty stage folder). For a worktree build, first copy in patch-package and the audio-api prebuilts, per "Fieldkit worktree hooks". Install from PowerShell with `adb install -r -d "android\app\build\outputs\apk\debug\app-debug.apk"`. Expected: logcat shows `Running "OffgridMobile"`.
- [ ] **Step 5: Confirm no location permission**
  Run: `apkanalyzer manifest permissions <apk>` (or `aapt dump permissions <apk>`). Expected: no `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION`. `ACCESS_NETWORK_STATE` is expected.
- [ ] **Step 6: Hand the phone build to the owner**
  The owner checks scrolling under the fixed bar, the slim header, the raised button, Edit home and search on the S24 Ultra. On their OK, merge to `main`, push, wait for the CI "Android" workflow (`--repo bth0mp/fieldkit-ai`), and release `0.3.0` per the release recipe (versionCode 300).
