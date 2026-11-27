/**
 * Transcription tab (rendered): Large v3 and Large v3 Turbo show the size Hugging Face lists for their files
 * (3,095,033,483 and 1,624,555,275 bytes), not the smaller figures the catalog once carried.
 */
import { openModelsFromHome } from '../../harness/modelsApp';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };

describe('Whisper sizes (rendered)', () => {
  it('Large v3 and Turbo show their real download sizes', async () => {
    const { rtl, ui } = await openModelsFromHome({ totalGB: 12 });
    rtl.fireEvent.press(ui.getByTestId('transcription-models-tab'));
    const turbo = await rtl.waitFor(() => rtl.within(ui.getByTestId('transcription-model-card-8')), TIMEOUT);
    const large = rtl.within(ui.getByTestId('transcription-model-card-9'));
    expect(turbo.getByText('Large v3 Turbo')).toBeTruthy();
    expect(turbo.getByText('1.5 GB')).toBeTruthy();
    expect(large.getByText('Large v3')).toBeTruthy();
    expect(large.getByText('3.0 GB')).toBeTruthy();
  });
});
