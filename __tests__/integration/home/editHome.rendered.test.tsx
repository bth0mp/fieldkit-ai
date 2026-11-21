/**
 * Edit home (rendered): the owner moves and hides Home's cards, the three always-shown cards offer no switch,
 * and the layout is read back from the phone's storage after a restart.
 *
 * Real HomeScreen, EditHomeScreen, home layout service and its store with AsyncStorage persistence. Device
 * leaves only: what setupChatScreen installs, and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const KEY = '@fieldkit/home_layout';
const DEFAULT_IDS = ['home-card-assistant', 'home-card-fieldKit', 'home-card-library', 'home-card-checklists', 'home-card-today', 'home-card-phone'];
const MOVED_IDS = ['home-card-assistant', 'home-card-fieldKit', 'home-card-today', 'home-card-library', 'home-card-phone'];

describe('Edit home (rendered)', () => {
  it('moves and hides cards, keeps the three always-shown ones, and remembers the layout', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama' });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { EditHomeScreen } = require('../../../src/screens/EditHomeScreen');
    const { useHomeLayoutStore } = require('../../../src/features/home/homeLayout');
    await rtl.waitFor(() => { expect(useHomeLayoutStore.persist.hasHydrated()).toBe(true); });

    const order = (v: any) => v.getAllByTestId(/^home-card-/).map((n: any) => n.props.testID);
    const nav = { navigate: jest.fn() };
    const home = rtl.render(React.createElement(HomeScreen, { navigation: nav }));
    expect(order(home)).toEqual(DEFAULT_IDS);
    rtl.fireEvent.press(home.getByTestId('home-edit'));
    expect(nav.navigate).toHaveBeenLastCalledWith('EditHome');
    home.unmount();

    const edit = rtl.render(React.createElement(EditHomeScreen));
    expect(edit.getByTestId('edit-home-up-assistant')).toBeDisabled();
    expect(edit.getByTestId('edit-home-down-phone')).toBeDisabled();
    rtl.fireEvent.press(edit.getByTestId('edit-home-up-today'));
    rtl.fireEvent.press(edit.getByTestId('edit-home-up-today'));
    rtl.fireEvent(edit.getByTestId('edit-home-show-checklists'), 'valueChange', false);
    for (const id of ['assistant', 'library', 'phone']) expect(edit.queryByTestId(`edit-home-show-${id}`)).toBeNull();
    expect(edit.getAllByText('Always on Home')).toHaveLength(3);
    edit.unmount();

    const home2 = rtl.render(React.createElement(HomeScreen, { navigation: nav }));
    expect(order(home2)).toEqual(MOVED_IDS);
    home2.unmount();

    // The app is closed and started again: the layout is read back from the phone's storage.
    await rtl.waitFor(async () => { expect(await AsyncStorage.getItem(KEY)).toContain('checklists'); });
    const saved = await AsyncStorage.getItem(KEY);
    useHomeLayoutStore.setState({ order: ['phone', 'assistant', 'fieldKit', 'library', 'checklists', 'today'], hidden: [] });
    await AsyncStorage.setItem(KEY, saved);
    await useHomeLayoutStore.persist.rehydrate();
    const home3 = rtl.render(React.createElement(HomeScreen, { navigation: nav }));
    expect(order(home3)).toEqual(MOVED_IDS);
    home3.unmount();

    // Reset brings every card back in the default order.
    const edit2 = rtl.render(React.createElement(EditHomeScreen));
    rtl.fireEvent.press(edit2.getByTestId('edit-home-reset'));
    edit2.unmount();
    const home4 = rtl.render(React.createElement(HomeScreen, { navigation: nav }));
    expect(order(home4)).toEqual(DEFAULT_IDS);
  }, 30000);
});
