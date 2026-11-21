/**
 * Home header (rendered): an Offline label while the phone has no connection, no network pings or Wi-Fi name
 * lookups, and a header that slims to the app name once the page scrolls.
 *
 * Real HomeScreen, HomeHeader and network status service. Device leaves only: what setupChatScreen installs,
 * the NetInfo fake and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const makeNav = () => ({ navigate: jest.fn(), goBack: () => {}, setOptions: () => {}, addListener: () => () => {} });

const scrollTo = (y: number) => ({
  nativeEvent: { contentOffset: { y }, contentSize: { height: 2000, width: 400 }, layoutMeasurement: { height: 800, width: 400 } },
});

describe('Home header (rendered)', () => {
  it('shows Offline only without a connection, never pings, and slims on scroll', async () => {
    const h = await setupChatScreen({ engine: 'llama' });
    const { React, rtl } = h;
    // Required after the harness's module reset, so the test and the screen share one fake.
    const { netInfoFake } = require('../../harness/netInfoFake');
    const { HomeScreen } = require('../../../src/screens/HomeScreen');

    const home = rtl.render(React.createElement(HomeScreen, { navigation: makeNav() }));
    expect(home.queryByTestId('home-offline')).toBeNull();
    rtl.act(() => netInfoFake.setConnected(false));
    expect(home.getByTestId('home-offline')).toHaveTextContent('Offline');
    rtl.act(() => netInfoFake.setConnected(true));
    expect(home.queryByTestId('home-offline')).toBeNull();
    expect(netInfoFake.lastConfig()?.reachabilityShouldRun?.()).toBe(false);
    expect(netInfoFake.lastConfig()?.shouldFetchWiFiSSID).toBe(false);

    rtl.act(() => netInfoFake.setConnected(false));
    rtl.fireEvent.scroll(home.getByTestId('home-scroll'), scrollTo(120));
    expect(home.queryByTestId('home-date')).toBeNull();
    expect(home.queryByTestId('home-offline')).toBeNull();
    expect(home.getByText('Fieldkit AI')).toBeTruthy();
    // Between the two thresholds the header stays as it is, so a short page cannot flicker.
    rtl.fireEvent.scroll(home.getByTestId('home-scroll'), scrollTo(20));
    expect(home.queryByTestId('home-date')).toBeNull();
    rtl.fireEvent.scroll(home.getByTestId('home-scroll'), scrollTo(0));
    expect(home.getByTestId('home-date')).toBeTruthy();
    expect(home.getByTestId('home-offline')).toHaveTextContent('Offline');
  }, 30000);
});
