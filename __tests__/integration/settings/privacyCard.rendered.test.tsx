/**
 * Settings (rendered): the Privacy card says what leaves the phone, not that nothing does.
 *
 * Real AppNavigator, Home and Settings screens and stores. Device leaves only: the phone's storage, RAM and the
 * network at `global.fetch`.
 */
import { bootHome } from '../../harness/modelsApp';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };

describe('Privacy card (rendered)', () => {
  it('the Privacy card names what leaves the phone', async () => {
    const { rtl, ui } = await bootHome({ totalGB: 12 });
    rtl.fireEvent.press(ui.getByTestId('settings-tab'));
    await rtl.waitFor(() => expect(ui.getByText('Privacy')).toBeTruthy(), TIMEOUT);
    expect(ui.getByText(
      'Your chats, files and recordings stay on this phone. Text leaves it only when you chat through a remote server, or when the assistant searches the web or opens a web page for you.',
    )).toBeTruthy();
    expect(ui.queryByText('Privacy First')).toBeNull();
    expect(ui.queryByText(/All your data stays on this device/)).toBeNull();
  });
});
