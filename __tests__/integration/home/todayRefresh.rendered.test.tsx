/** @jest-environment <rootDir>/__tests__/harness/timeZoneEnvironment.js
 *  @jest-environment-options {"timeZone": "Europe/London"} */
/**
 * Home's date and Today card stay current (rendered): a Home left open past local midnight shows the new date,
 * and coming back to the app (AppState active) or back to the Home tab recomputes the date and the sky.
 *
 * Real HomeScreen, useFocusTrigger, home place store and the sun and moon calculators. Device leaves only:
 * what setupChatScreen installs, the navigation mock (whether Home has focus), AppState and the clock.
 */
import { setupChatScreen } from '../../harness/chatHarness';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => mockFocused,
}));

const makeNav = () => ({ navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} });

let mounted: { unmount: () => void } | null = null;

describe('Home date and Today card stay current (rendered)', () => {
  afterEach(() => { mounted?.unmount(); mounted = null; jest.useRealTimers(); jest.restoreAllMocks(); mockFocused = true; });

  it('moves to the new date at local midnight, and again when the app comes back or Home regains focus', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    const { React, rtl } = h;
    const { AppState } = require('react-native');
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { useHomePlaceStore } = require('../../../src/features/home/homePlace');
    await rtl.waitFor(() => { expect(useHomePlaceStore.persist.hasHydrated()).toBe(true); });
    useHomePlaceStore.setState({ place: { typed: '51.4778, -0.0015', lat: 51.4778, lon: -0.0015 } });

    // The phone's app-state changes are the device: capture the listener Home registers.
    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => {
      listeners.push(fn);
      return { remove: () => { listeners.splice(listeners.indexOf(fn), 1); } };
    }) as never);
    jest.useFakeTimers({ now: new Date('2026-11-21T23:59:59Z'), advanceTimers: true });

    const nav = makeNav();
    const home = rtl.render(React.createElement(HomeScreen, { navigation: nav }));
    mounted = home;
    expect(home.getByTestId('home-date')).toHaveTextContent('Sat 21 Nov', { exact: false });
    const saturdaySun = home.getByTestId('today-sun').props.children;

    // Left open past midnight.
    await rtl.act(async () => { jest.advanceTimersByTime(2000); });
    await rtl.waitFor(() => expect(home.getByTestId('home-date')).toHaveTextContent('Sun 22 Nov', { exact: false }));

    // The app was in the background for days, then comes back.
    await rtl.act(async () => { jest.setSystemTime(new Date('2026-12-10T12:00:00Z')); });
    expect(home.getByTestId('home-date')).toHaveTextContent('Sun 22 Nov', { exact: false });
    await rtl.act(async () => { listeners.forEach((fn) => fn('active')); });
    expect(home.getByTestId('home-date')).toHaveTextContent('Thu 10 Dec', { exact: false });
    const decemberSun = home.getByTestId('today-sun').props.children;
    expect(decemberSun).not.toEqual(saturdaySun);

    // Home was left for another tab and the clock moved on: coming back reads the clock on return.
    mockFocused = false;
    home.rerender(React.createElement(HomeScreen, { navigation: nav }));
    await rtl.act(async () => { jest.setSystemTime(new Date('2026-12-15T12:00:00Z')); });
    expect(home.getByTestId('home-date')).toHaveTextContent('Thu 10 Dec', { exact: false });
    mockFocused = true;
    home.rerender(React.createElement(HomeScreen, { navigation: nav }));
    await rtl.waitFor(() => expect(home.getByTestId('home-date')).toHaveTextContent('Tue 15 Dec', { exact: false }));
    home.unmount();
    mounted = null;
    expect(listeners).toHaveLength(0);
  }, 30000);
});
