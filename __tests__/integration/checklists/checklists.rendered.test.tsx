/**
 * Checklists (rendered): from Settings the user opens Checklists, makes a list, fills it, ticks items off,
 * finds it as they left it after the app restarts, resets it, removes an item and deletes the list, each
 * loss of work after being asked. A starter list comes from Ready.gov's basic kit.
 *
 * Real stack: SettingsScreen and ChecklistsScreen, the checklist service and its store with AsyncStorage
 * persistence. Device leaves only: what setupChatScreen installs, and the navigation mock, whose `navigate`
 * is captured here.
 */
import { setupChatScreen } from '../../harness/chatHarness';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const KEY = '@fieldkit/checklists';

describe('Checklists (rendered)', () => {
  beforeEach(() => { mockNavigate.mockClear(); });

  it('a list is made, filled, ticked, kept, reset and deleted', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', sqlite: true });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const { StyleSheet } = require('react-native');
    const { TYPOGRAPHY } = require('../../../src/constants');
    const { SettingsScreen } = require('../../../src/screens/SettingsScreen');
    const { ChecklistsScreen } = require('../../../src/screens/ChecklistsScreen');
    const { useChecklistStore } = require('../../../src/features/checklists/checklistStore');
    await rtl.waitFor(() => { expect(useChecklistStore.persist.hasHydrated()).toBe(true); });
    /**
     * Answer the sheet that asks before work is lost. The sheet takes a fifth of a second to slide away, and one
     * opened again inside that time is closed by the first one's ending. A person is slower than that; a test is
     * not, so this waits until the sheet has gone before going on. While it slides away the sheet has lost its
     * question and shows only the alert's default "OK" button, so both must be gone.
     */
    const answer = async (view: ReturnType<typeof rtl.render>, question: string, button: string) => {
      await rtl.waitFor(() => {
        expect(view.getByText(question)).toBeTruthy();
        expect(view.getByText(button)).toBeTruthy();
      }, { timeout: 4000 });
      rtl.fireEvent.press(view.getByText(button));
      await rtl.waitFor(() => {
        expect(view.queryByText(question)).toBeNull();
        expect(view.queryByText('OK')).toBeNull();
      }, { timeout: 4000 });
    };

    // Settings has a Checklists row.
    const settings = rtl.render(React.createElement(SettingsScreen));
    rtl.fireEvent.press(settings.getByTestId('settings-checklists'));
    expect(mockNavigate).toHaveBeenCalledWith('Checklists');
    settings.unmount();

    const screen = rtl.render(React.createElement(ChecklistsScreen, {}));
    expect(screen.getByText('No lists yet.')).toBeTruthy();

    // An empty name is refused with a reason, and nothing is made; typing clears the reason.
    rtl.fireEvent.press(screen.getByTestId('checklists-add-list'));
    expect(screen.getByText('Give the list a name.')).toBeTruthy();
    expect(screen.getByText('No lists yet.')).toBeTruthy();
    rtl.fireEvent.changeText(screen.getByTestId('checklists-new-name'), 'Day hike');
    expect(screen.queryByText('Give the list a name.')).toBeNull();

    // A new list opens itself, ready for items. Its name is body text, not a small label.
    rtl.fireEvent.press(screen.getByTestId('checklists-add-list'));
    const title = screen.getByText('Day hike (0 of 0)');
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(TYPOGRAPHY.body.fontSize);
    expect(screen.queryByText('No lists yet.')).toBeNull();
    expect(screen.getByTestId('checklists-new-name').props.value).toBe('');

    // An empty item is refused under the item field.
    rtl.fireEvent.press(screen.getByTestId('checklists-add-item'));
    expect(screen.getByText('Type the item first.')).toBeTruthy();
    for (const item of ['Map and compass', 'Water', 'Head torch']) {
      rtl.fireEvent.changeText(screen.getByTestId('checklists-new-item'), item);
      rtl.fireEvent.press(screen.getByTestId('checklists-add-item'));
    }
    expect(screen.queryByText('Type the item first.')).toBeNull();
    expect(screen.getByText('Day hike (0 of 3)')).toBeTruthy();
    expect(screen.getByTestId('checklists-new-item').props.value).toBe('');

    // Ticking is one tap on the item; a screen reader hears a checkbox.
    const water = screen.getByLabelText('Water');
    expect(water.props.accessibilityRole).toBe('checkbox');
    expect(water.props.accessibilityState).toEqual({ checked: false });
    rtl.fireEvent.press(water);
    expect(screen.getByLabelText('Water').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByText('Day hike (1 of 3)')).toBeTruthy();

    // A second list opens in place of the first: one list is open at a time.
    rtl.fireEvent.changeText(screen.getByTestId('checklists-new-name'), 'Car kit');
    rtl.fireEvent.press(screen.getByTestId('checklists-add-list'));
    expect(screen.getByText('Car kit (0 of 0)')).toBeTruthy();
    expect(screen.queryByLabelText('Water')).toBeNull();
    expect(screen.getByText('Day hike (1 of 3)')).toBeTruthy();

    // The app is closed and started again: what was saved is read back from the phone's storage.
    screen.unmount();
    await rtl.waitFor(async () => { expect(await AsyncStorage.getItem(KEY)).toContain('Car kit'); });
    const onDisk = await AsyncStorage.getItem(KEY);
    useChecklistStore.setState({ lists: [] }); // forget it in memory (this also writes, so the saved value is put back)
    await rtl.waitFor(async () => { expect(await AsyncStorage.getItem(KEY)).not.toContain('Car kit'); });
    await AsyncStorage.setItem(KEY, onDisk);
    await useChecklistStore.persist.rehydrate();
    const again = rtl.render(React.createElement(ChecklistsScreen, {}));
    expect(again.getByText('Car kit (0 of 0)')).toBeTruthy();
    expect(again.getByText('Day hike (1 of 3)')).toBeTruthy();
    // Lists start closed when the screen opens.
    expect(again.queryByLabelText('Water')).toBeNull();
    rtl.fireEvent.press(again.getByText('Day hike (1 of 3)'));
    expect(again.getByLabelText('Water').props.accessibilityState).toEqual({ checked: true });

    // Untick all asks first, then clears every tick for the next trip.
    rtl.fireEvent.press(again.getByText('Untick all'));
    await answer(again, 'Untick everything?', 'Cancel');
    expect(again.getByText('Day hike (1 of 3)')).toBeTruthy();
    rtl.fireEvent.press(again.getByText('Untick all'));
    await answer(again, 'Untick everything?', 'Untick');
    await rtl.waitFor(() => { expect(again.getByText('Day hike (0 of 3)')).toBeTruthy(); });

    // Removing an item asks first.
    rtl.fireEvent.press(again.getByLabelText('Remove Head torch'));
    await rtl.waitFor(() => { expect(again.getByText('"Head torch" will be removed from Day hike.')).toBeTruthy(); });
    await answer(again, 'Remove item?', 'Cancel');
    expect(again.getByLabelText('Head torch')).toBeTruthy();
    rtl.fireEvent.press(again.getByLabelText('Remove Head torch'));
    await answer(again, 'Remove item?', 'Remove');
    await rtl.waitFor(() => { expect(again.queryByLabelText('Head torch')).toBeNull(); });
    expect(again.getByText('Day hike (0 of 2)')).toBeTruthy();

    // Deleting a list asks first; Cancel keeps it, Delete removes it and leaves the other list alone.
    rtl.fireEvent.press(again.getByText('Delete list'));
    await rtl.waitFor(() => { expect(again.getByText('"Day hike" and its 2 items will be deleted.')).toBeTruthy(); });
    await answer(again, 'Delete list?', 'Cancel');
    expect(again.getByText('Day hike (0 of 2)')).toBeTruthy();
    rtl.fireEvent.press(again.getByText('Delete list'));
    await answer(again, 'Delete list?', 'Delete');
    await rtl.waitFor(() => { expect(again.queryByText('Day hike (0 of 2)')).toBeNull(); });
    expect(again.getByText('Car kit (0 of 0)')).toBeTruthy();
  }, 30000);

  it("starts a list from Ready.gov's basic kit and says where it comes from", async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { ChecklistsScreen } = require('../../../src/screens/ChecklistsScreen');
    const { useChecklistStore } = require('../../../src/features/checklists/checklistStore');
    await rtl.waitFor(() => { expect(useChecklistStore.persist.hasHydrated()).toBe(true); });
    const screen = rtl.render(React.createElement(ChecklistsScreen, {}));

    expect(screen.getByText('Ready.gov, Basic Disaster Supplies Kit, as updated 1 July 2026')).toBeTruthy();
    rtl.fireEvent.press(screen.getByTestId('checklists-starter-ready-basic-kit'));
    expect(screen.getByText('Emergency kit (0 of 14)')).toBeTruthy();
    expect(screen.getByLabelText('Whistle (to signal for help)')).toBeTruthy();
    expect(screen.getByLabelText('Water (one gallon per person per day for several days, for drinking and sanitation)')).toBeTruthy();
  }, 30000);

  it('says so, and changes nothing, when the saved lists could not be read', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', sqlite: true });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const damaged = '{"state":{"lists":[{"id":"old-1","name":"Saved li';
    await AsyncStorage.setItem(KEY, damaged);
    const { ChecklistsScreen } = require('../../../src/screens/ChecklistsScreen');
    const { useChecklistStore } = require('../../../src/features/checklists/checklistStore');
    await useChecklistStore.persist.rehydrate();

    const screen = rtl.render(React.createElement(ChecklistsScreen, {}));
    rtl.fireEvent.changeText(screen.getByTestId('checklists-new-name'), 'New list');
    rtl.fireEvent.press(screen.getByTestId('checklists-add-list'));
    expect(screen.getByText('Your saved lists could not be read, so nothing can be changed. Close the app and open it again.')).toBeTruthy();
    expect(screen.getByText('No lists yet.')).toBeTruthy();
    expect(await AsyncStorage.getItem(KEY)).toBe(damaged);
  }, 30000);
});
