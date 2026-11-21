/** @jest-environment <rootDir>/__tests__/harness/timeZoneEnvironment.js
 *  @jest-environment-options {"timeZone": "Europe/London"} */
/**
 * Home Today card (rendered): with no home place it asks for one, and once a place is typed it shows today's
 * sunrise, sunset and moonrise, with the sunset repeated in the header's date line.
 *
 * Real HomeScreen, HomePlaceSheet, home place service and store, and the sun and moon calculators. Device
 * leaves only: what setupChatScreen installs, and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';
import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const makeNav = () => ({ navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} });

describe('Home Today card (rendered)', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('asks for a place, then shows today\'s sun and moon and the sunset in the header', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    const { React, rtl } = h;
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { useHomePlaceStore } = require('../../../src/features/home/homePlace');
    await rtl.waitFor(() => { expect(useHomePlaceStore.persist.hasHydrated()).toBe(true); });
    jest.useFakeTimers({ now: new Date('2026-11-21T12:00:00Z'), advanceTimers: true });

    const home = rtl.render(React.createElement(HomeScreen, { navigation: makeNav() }));
    expect(home.getByTestId('home-date')).toHaveTextContent('Sat 21 Nov');
    expect(home.getByTestId('home-date')).not.toHaveTextContent('sunset');
    rtl.fireEvent.press(home.getByTestId('today-set-place'));
    rtl.fireEvent.changeText(home.getByTestId('home-place-input'), '51.4778, -0.0015');
    rtl.fireEvent.press(home.getByTestId('home-place-save'));
    await rtl.waitFor(() => expect(home.getByTestId('today-sun')).toHaveTextContent('sunrise 07:28', { exact: false }));
    expect(home.getByTestId('today-sun')).toHaveTextContent('sunset 16:03', { exact: false });
    expect(home.getByTestId('today-moon')).toHaveTextContent('moonrise 14:04');
    expect(home.getByTestId('home-date')).toHaveTextContent('Sat 21 Nov · sunset 16:03');
  }, 30000);

  it('says which of sunrise or sunset is missing on a day the sun only rises or only sets', async () => {
    installNativeBoundary();
    const React = require('react');
    const rtl = requireRTL();
    const { TodayCard } = require('../../../src/screens/HomeScreen/cards/TodayCard');
    const sky = (sunrise: string | null, sunset: string | null) => ({ sunrise, sunset, sunAllDay: null, moonrise: null });

    const noSunrise = rtl.render(React.createElement(TodayCard, { sky: sky(null, '23:10') }));
    expect(noSunrise.getByTestId('today-sun')).toHaveTextContent('No sunrise today  sunset 23:10');
    noSunrise.unmount();
    const noSunset = rtl.render(React.createElement(TodayCard, { sky: sky('01:20', null) }));
    expect(noSunset.getByTestId('today-sun')).toHaveTextContent('sunrise 01:20  No sunset today');
    noSunset.unmount();
  }, 30000);

  it('says so in words, and leaves the sunset out of the header, where the sun never sets', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    const { React, rtl } = h;
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { useHomePlaceStore } = require('../../../src/features/home/homePlace');
    await rtl.waitFor(() => { expect(useHomePlaceStore.persist.hasHydrated()).toBe(true); });
    jest.useFakeTimers({ now: new Date('2026-06-21T12:00:00Z'), advanceTimers: true });
    useHomePlaceStore.setState({ place: { typed: '78.22, 15.65', lat: 78.22, lon: 15.65 } });

    const home = rtl.render(React.createElement(HomeScreen, { navigation: makeNav() }));
    expect(home.getByTestId('today-sun')).toHaveTextContent('Sun up all day');
    expect(home.getByTestId('today-moon')).toHaveTextContent('moonrise 11:29');
    expect(home.getByTestId('home-date')).toHaveTextContent('Sun 21 Jun');
    expect(home.getByTestId('home-date')).not.toHaveTextContent('sunset');
  }, 30000);
});
