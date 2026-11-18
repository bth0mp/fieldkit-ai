/**
 * Guide library entry points (rendered) — the Field guides knowledge base screen and Settings each carry a
 * row that opens the Guide library, no other project's knowledge base does, and the licences screen says
 * where downloaded guides are credited. The entry points only navigate: opening them fetches nothing.
 *
 * Real screens; the device boundary is memfs + the react-native-fs fake (to prove nothing downloads), and
 * the navigation mock, whose `navigate` is captured here.
 */
import { setupChatScreen } from '../../harness/chatHarness';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {}, useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));
jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style, testID }: any) => {
    const { TouchableOpacity } = require('react-native');
    const React = require('react');
    return React.createElement(TouchableOpacity, { style, onPress, testID }, children);
  },
}));

const openRoute = (params: Record<string, unknown>) => { require('../../harness/chatHarness').routeHolder.params = params; };

describe('Guide library entry points (rendered)', () => {
  beforeEach(() => { mockNavigate.mockClear(); });

  it('the Field guides knowledge base offers the Guide library and opens it without downloading anything', async () => {
    const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { React, rtl, boundary } = h;
    const { FIELD_GUIDES_PROJECT_ID } = require('../../../src/features/fieldGuides/fieldGuides');
    const { KnowledgeBaseScreen } = require('../../../src/screens/KnowledgeBaseScreen');

    // Empty state: nothing has been added yet.
    openRoute({ projectId: FIELD_GUIDES_PROJECT_ID });
    const kb = rtl.render(React.createElement(KnowledgeBaseScreen, {}));
    await rtl.waitFor(() => { expect(kb.queryByText('No documents yet')).not.toBeNull(); });
    expect(kb.queryByText('Guide library')).not.toBeNull();
    expect(kb.queryByText('Download more free guides')).not.toBeNull();

    rtl.fireEvent.press(kb.getByTestId('kb-open-guide-library'));
    expect(mockNavigate).toHaveBeenCalledWith('GuideLibrary');

    // Opening the screen and pressing the row fetched nothing.
    expect(boundary.fs!.module.downloadFile).not.toHaveBeenCalled();
  }, 30000);

  it('a knowledge base for any other project does not offer the Guide library', async () => {
    const h = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { React, rtl } = h;
    const { KnowledgeBaseScreen } = require('../../../src/screens/KnowledgeBaseScreen');

    openRoute({ projectId: 'some-other-project' });
    const kb = rtl.render(React.createElement(KnowledgeBaseScreen, {}));
    await rtl.waitFor(() => { expect(kb.queryByText('No documents yet')).not.toBeNull(); });
    expect(kb.queryByTestId('kb-open-guide-library')).toBeNull();
    expect(kb.queryByText('Download more free guides')).toBeNull();
  }, 30000);

  it('Settings offers the Guide library and opens it', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { SettingsScreen } = require('../../../src/screens/SettingsScreen');
    const view = rtl.render(React.createElement(SettingsScreen));
    expect(view.queryByText('Free guides to download and use offline')).not.toBeNull();
    rtl.fireEvent.press(view.getByTestId('settings-guide-library'));
    expect(mockNavigate).toHaveBeenCalledWith('GuideLibrary');
  }, 30000);

  it('the licences screen says where downloaded guides are credited', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', pdf: true, sqlite: true });
    const { OpenSourceLicensesScreen } = require('../../../src/screens/OpenSourceLicensesScreen');
    const view = rtl.render(React.createElement(OpenSourceLicensesScreen));
    expect(view.queryByText(/Guides you download from the Guide library are listed there with their licences\./)).not.toBeNull();
  }, 30000);
});
