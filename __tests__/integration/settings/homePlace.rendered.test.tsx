/**
 * Home place (rendered): in Settings the user types a place for sunrise and sunset on Home. A place the app
 * can't read is refused with the reason, a good one is kept across a restart, and Clear takes it away.
 *
 * Real stack: SettingsScreen, HomePlaceSheet, the home place service and its store with AsyncStorage
 * persistence. Device leaves only: what setupChatScreen installs, and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const KEY = '@fieldkit/home_place';

describe('Home place (rendered)', () => {
  it('saves a typed home place, keeps it after a restart, and clears it', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama' });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const { SettingsScreen } = require('../../../src/screens/SettingsScreen');
    const { useHomePlaceStore } = require('../../../src/features/home/homePlace');
    const { positionOf } = require('../../../src/services/tools/coordinateTools');
    await rtl.waitFor(() => { expect(useHomePlaceStore.persist.hasHydrated()).toBe(true); });

    const view = rtl.render(React.createElement(SettingsScreen));
    const row = () => view.getByTestId('settings-home-place');
    expect(rtl.within(row()).getByText('Home place')).toBeTruthy();
    expect(rtl.within(row()).getByText('Not set')).toBeTruthy();
    rtl.fireEvent.press(row());
    rtl.fireEvent.changeText(view.getByTestId('home-place-input'), 'nowhere');
    rtl.fireEvent.press(view.getByTestId('home-place-save'));
    const expected = (() => { try { positionOf('nowhere'); return ''; } catch (e) { return (e as Error).message; } })();
    expect(expected).not.toBe('');
    expect(view.getByTestId('home-place-error')).toHaveTextContent(expected);
    rtl.fireEvent.changeText(view.getByTestId('home-place-input'), ' 51.4778, -0.0015 ');
    rtl.fireEvent.press(view.getByTestId('home-place-save'));
    await rtl.waitFor(() => expect(rtl.within(row()).getByText('51.4778, -0.0015')).toBeTruthy());

    // The app is closed and started again: the place is read back from the phone's storage.
    view.unmount();
    await rtl.waitFor(async () => { expect(await AsyncStorage.getItem(KEY)).toContain('51.4778'); });
    useHomePlaceStore.setState({ place: null });
    await rtl.waitFor(async () => { expect(await AsyncStorage.getItem(KEY)).not.toContain('51.4778'); });
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { place: { typed: '51.4778, -0.0015', lat: 51.4778, lon: -0.0015 } }, version: 0 }));
    await useHomePlaceStore.persist.rehydrate();
    const again = rtl.render(React.createElement(SettingsScreen));
    const row2 = () => again.getByTestId('settings-home-place');
    expect(rtl.within(row2()).getByText('51.4778, -0.0015')).toBeTruthy();
    rtl.fireEvent.press(row2());
    rtl.fireEvent.press(again.getByTestId('home-place-clear'));
    await rtl.waitFor(() => expect(rtl.within(row2()).getByText('Not set')).toBeTruthy());
  }, 30000);
});
