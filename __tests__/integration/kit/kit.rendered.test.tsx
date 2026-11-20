/**
 * Kit tab (rendered): the four field features (Guide library, Quick reference, Calculators, Checklists) sit
 * on their own tab, one tap from the bottom bar, and no longer on the Settings screen. Each row opens its screen.
 *
 * Real screens: KitScreen and SettingsScreen. Device leaves only: what setupChatScreen installs, and the
 * navigation mock, whose `navigate` is captured here.
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
jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style, testID }: any) => {
    const { TouchableOpacity } = require('react-native');
    const React = require('react');
    return React.createElement(TouchableOpacity, { style, onPress, testID }, children);
  },
}));

const FEATURES = [
  { testID: 'kit-guide-library', title: 'Guide library', desc: 'Free guides to download and use offline', route: 'GuideLibrary' },
  { testID: 'kit-quick-reference', title: 'Quick reference', desc: 'Signals, codes and scales at a glance', route: 'QuickReference' },
  { testID: 'kit-calculators', title: 'Calculators', desc: 'Units, grid references, sun and moon, distance, dates', route: 'Calculators' },
  { testID: 'kit-checklists', title: 'Checklists', desc: 'Your own packing and check lists', route: 'Checklists' },
];

describe('Kit tab (rendered)', () => {
  beforeEach(() => { mockNavigate.mockClear(); });

  it('lists the four field features and opens each one', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { KitScreen } = require('../../../src/screens/KitScreen');
    const kit = rtl.render(React.createElement(KitScreen));

    expect(kit.getByText('Field kit')).toBeTruthy();
    for (const f of FEATURES) {
      const row = kit.getByTestId(f.testID);
      expect(rtl.within(row).getByText(f.title)).toBeTruthy();
      expect(rtl.within(row).getByText(f.desc)).toBeTruthy();
    }
    for (const f of FEATURES) {
      rtl.fireEvent.press(kit.getByTestId(f.testID));
      expect(mockNavigate).toHaveBeenLastCalledWith(f.route);
    }
    expect(mockNavigate).toHaveBeenCalledTimes(FEATURES.length);
  }, 30000);

  it('Settings no longer carries them, and still has About', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { SettingsScreen } = require('../../../src/screens/SettingsScreen');
    const settings = rtl.render(React.createElement(SettingsScreen));

    for (const id of ['settings-guide-library', 'settings-quick-reference', 'settings-calculators', 'settings-checklists']) {
      expect(settings.queryByTestId(id)).toBeNull();
    }
    for (const f of FEATURES) {
      expect(settings.queryByText(f.title)).toBeNull();
      expect(settings.queryByText(f.desc)).toBeNull();
    }
    expect(settings.getByText('About')).toBeTruthy();
  }, 30000);
});
