/**
 * The confirmation sheet (rendered): a sheet that is wanted again while it is still sliding away stays up.
 * It used to be closed for good by the first one's ending, so a confirmation cancelled and asked again at
 * once, or an error put up as its confirmation closes, showed for an instant and vanished with nothing on
 * screen to say why.
 *
 * Real stack: ChecklistsScreen, CustomAlert and AppSheet, with animations that take real time (which is why
 * this is a rendered test: in the component tests an animation ends at once and the two sheets never overlap).
 * Device leaves only: what setupChatScreen installs, and the navigation mock.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('The confirmation sheet (rendered)', () => {
  it('stays up when it is cancelled and asked for again before it has slid away', async () => {
    const { React, rtl } = await setupChatScreen({ engine: 'llama', sqlite: true });
    const { Animated, Modal } = require('react-native');
    const { ChecklistsScreen } = require('../../../src/screens/ChecklistsScreen');
    const { useChecklistStore } = require('../../../src/features/checklists/checklistStore');
    await rtl.waitFor(() => { expect(useChecklistStore.persist.hasHydrated()).toBe(true); });
    const pause = (ms: number) => rtl.act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

    const screen = rtl.render(React.createElement(ChecklistsScreen, {}));
    rtl.fireEvent.changeText(screen.getByTestId('checklists-new-name'), 'Kit');
    rtl.fireEvent.press(screen.getByTestId('checklists-add-list'));
    rtl.fireEvent.changeText(screen.getByTestId('checklists-new-item'), 'Water');
    rtl.fireEvent.press(screen.getByTestId('checklists-add-item'));
    rtl.fireEvent.press(screen.getByLabelText('Water'));
    expect(screen.getByText('Kit (1 of 1)')).toBeTruthy();

    rtl.fireEvent.press(screen.getByText('Untick all'));
    await rtl.waitFor(() => { expect(screen.getByText('Untick')).toBeTruthy(); });

    // Cancel, and ask again before the sheet has gone.
    const slides = jest.spyOn(Animated, 'timing');
    rtl.fireEvent.press(screen.getByText('Cancel'));
    rtl.fireEvent.press(screen.getByText('Untick all'));
    await pause(700); // well past the 200 ms slide-out

    expect(screen.getByText('Untick everything?')).toBeTruthy();
    expect(screen.getByText('Untick')).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(Modal).map(modal => modal.props.visible)).toEqual([true]);
    // It was sliding away, so it is slid back in: the last slide started is one to the resting position.
    const slideTargets = slides.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
    expect(slideTargets.length).toBeGreaterThan(0);
    expect(slideTargets[slideTargets.length - 2]).toBe(0);
    slides.mockRestore();

    // And it still works: the answer is taken.
    rtl.fireEvent.press(screen.getByText('Untick'));
    await rtl.waitFor(() => { expect(screen.getByText('Kit (0 of 1)')).toBeTruthy(); }, { timeout: 4000 });
  }, 30000);
});
