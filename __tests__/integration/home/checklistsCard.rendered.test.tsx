/**
 * Home Checklists card (rendered): the three lists changed most recently come first, each with its tick count;
 * a row opens that list on the Checklists screen, and the order survives a restart.
 *
 * Real HomeScreen, ChecklistsScreen, checklist service and store with AsyncStorage persistence. Device leaves
 * only: what setupChatScreen installs, and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { STARTER_LISTS } from '../../../src/features/checklists/starterLists';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const makeNav = () => ({ navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} });

describe('Home Checklists card (rendered)', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('says so when there are no lists, and opens Checklists', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const nav = makeNav();
    const home = h.rtl.render(h.React.createElement(HomeScreen, { navigation: nav }));
    expect(home.getByTestId('home-checklists-empty')).toHaveTextContent('No lists yet. Start from a ready-made kit list.');
    h.rtl.fireEvent.press(home.getByTestId('home-checklists-empty'));
    expect(nav.navigate).toHaveBeenLastCalledWith('Checklists');
  }, 30000);

  it('shows the most recently changed lists first and opens the one tapped', async () => {
    const h = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { React, rtl } = h;
    const { ChecklistsScreen } = require('../../../src/screens/ChecklistsScreen');
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { useChecklistStore } = require('../../../src/features/checklists/checklistStore');
    await rtl.waitFor(() => { expect(useChecklistStore.persist.hasHydrated()).toBe(true); });
    const [a, b, c] = STARTER_LISTS;
    const title = (list: typeof a, done: number) => `${list.name} (${done} of ${list.items.length})`;

    jest.useFakeTimers({ now: new Date('2026-11-21T10:00:00Z'), advanceTimers: true });
    const lists = rtl.render(React.createElement(ChecklistsScreen, {}));
    for (const [minute, starter] of [[0, a], [1, b], [2, c]] as const) {
      jest.setSystemTime(new Date(`2026-11-21T10:0${minute}:00Z`));
      rtl.fireEvent.press(lists.getByTestId(`checklists-starter-${starter.id}`));
    }
    // The last starter opened itself; close it, then open the first list and tick its first item.
    rtl.fireEvent.press(lists.getByText(title(c, 0)));
    jest.setSystemTime(new Date('2026-11-21T10:03:00Z'));
    rtl.fireEvent.press(lists.getByText(title(a, 0)));
    rtl.fireEvent.press(lists.getByLabelText(a.items[0]));
    expect(lists.getByText(title(a, 1))).toBeTruthy();
    lists.unmount();

    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const nav = makeNav();
    const expectOrder = (home: ReturnType<typeof rtl.render>) => {
      const [first, second, third] = [0, 1, 2].map(i => home.getByTestId(`home-checklist-${i}`));
      expect(first).toHaveTextContent(a.name, { exact: false });
      expect(first).toHaveTextContent(`1 of ${a.items.length}`, { exact: false });
      expect(second).toHaveTextContent(c.name, { exact: false });
      expect(third).toHaveTextContent(b.name, { exact: false });
      expect(rtl.within(first).getByText(a.name).props.numberOfLines).toBe(1);
      return first;
    };
    const home = rtl.render(React.createElement(HomeScreen, { navigation: nav }));
    expectOrder(home);
    home.unmount();

    // The app is closed and started again: the saved lists, and their order, come back.
    await rtl.waitFor(async () => { expect(await AsyncStorage.getItem('@fieldkit/checklists')).toContain('changedAt'); });
    await useChecklistStore.persist.rehydrate();
    const again = rtl.render(React.createElement(HomeScreen, { navigation: nav }));
    const first = expectOrder(again);

    rtl.fireEvent.press(first);
    const listId = useChecklistStore.getState().lists.find((l: { name: string }) => l.name === a.name)!.id;
    expect(nav.navigate).toHaveBeenLastCalledWith('Checklists', { listId });
    again.unmount();

    require('../../harness/chatHarness').routeHolder.params = { listId };
    const opened = rtl.render(React.createElement(ChecklistsScreen, {}));
    expect(opened.getByText(title(a, 1))).toBeTruthy();
    expect(opened.getByLabelText(a.items[0]).props.accessibilityState).toEqual({ checked: true });
  }, 30000);
});
