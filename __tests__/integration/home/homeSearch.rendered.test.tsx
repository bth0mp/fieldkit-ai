/**
 * Home search (rendered): the search button on Home opens the search screen, which finds a checklist and a
 * bundled guide by title, says so when nothing matches, and opens what is tapped. A Quick reference card
 * named in the route opens at once.
 *
 * Real HomeScreen, HomeSearchScreen, ChecklistsScreen, QuickReferenceScreen, services and stores. Device
 * leaves only: what setupChatScreen installs, and the navigation mock, whose `navigate` is captured here.
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

describe('Home search (rendered)', () => {
  beforeEach(() => { mockNavigate.mockClear(); });

  it('finds a checklist, a bundled guide and nothing, and opens what was tapped', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama' });
    const { routeHolder } = require('../../harness/chatHarness');
    const { HomeScreen } = require('../../../src/screens/HomeScreen');
    const { HomeSearchScreen } = require('../../../src/screens/HomeSearchScreen');
    const { ChecklistsScreen } = require('../../../src/screens/ChecklistsScreen');
    const { QuickReferenceScreen } = require('../../../src/screens/QuickReferenceScreen');
    const { STARTER_LISTS } = require('../../../src/features/checklists/starterLists');
    const { useChecklistStore } = require('../../../src/features/checklists/checklistStore');
    await rtl.waitFor(() => { expect(useChecklistStore.persist.hasHydrated()).toBe(true); });

    // The Car kit extras list, started from its starter button.
    const lists = rtl.render(React.createElement(ChecklistsScreen, {}));
    rtl.fireEvent.press(lists.getByTestId(`checklists-starter-${STARTER_LISTS[1].id}`));
    lists.unmount();
    mockNavigate.mockClear();

    const nav = { navigate: mockNavigate };
    const home = rtl.render(React.createElement(HomeScreen, { navigation: nav }));
    rtl.fireEvent.press(home.getByTestId('home-search-button'));
    expect(mockNavigate).toHaveBeenLastCalledWith('HomeSearch');
    // The button stays once the header has slimmed.
    rtl.fireEvent.scroll(home.getByTestId('home-scroll'), { nativeEvent: { contentOffset: { y: 120 }, contentSize: { height: 2000, width: 400 }, layoutMeasurement: { height: 800, width: 400 } } });
    expect(home.queryByTestId('home-date')).toBeNull();
    expect(home.getByTestId('home-search-button')).toBeTruthy();
    home.unmount();

    // The app copies its bundled guides to the phone's storage at launch; put this one there.
    const RNFS = require('react-native-fs');
    await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/field-guides`);
    await RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/field-guides/nrcs-tn28-solar-pumps.pdf`, 'pdf');

    const search = rtl.render(React.createElement(HomeSearchScreen));
    rtl.fireEvent.changeText(search.getByTestId('home-search-input'), 'car');
    expect(search.getByTestId('home-search-hit-0')).toHaveTextContent(STARTER_LISTS[1].name, { exact: false });
    expect(search.getByTestId('home-search-hit-0')).toHaveTextContent('Checklist', { exact: false });
    rtl.fireEvent.press(search.getByTestId('home-search-hit-0'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Checklists', { listId: useChecklistStore.getState().lists[0].id });

    rtl.fireEvent.changeText(search.getByTestId('home-search-input'), 'solar');
    rtl.fireEvent.press(search.getByTestId('home-search-hit-0'));
    await rtl.waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith('DocumentPreview', expect.objectContaining({
      filePath: expect.stringMatching(/field-guides\/nrcs-tn28-solar-pumps\.pdf$/),
      fileName: 'Solar-Powered Water Pump Systems (USDA NRCS Technical Note 28).pdf',
    })));

    rtl.fireEvent.changeText(search.getByTestId('home-search-input'), 'zzzz');
    expect(search.getByTestId('home-search-empty')).toHaveTextContent('No titles match. To search inside guides, ask the assistant.');
    search.unmount();

    routeHolder.params = { cardId: 'morse' };
    const reference = rtl.render(React.createElement(QuickReferenceScreen));
    expect(reference.getAllByTestId(/^quick-reference-morse-/).length).toBeGreaterThan(0);
  }, 30000);
});
