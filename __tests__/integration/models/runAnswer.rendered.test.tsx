/**
 * Run answer on every model card (rendered): each card says whether the model runs on this phone, from the same
 * numbers the load check uses (runVerdict, the image RAM estimate), so a card never promises what the app refuses.
 *
 * Real AppNavigator, Home and Models screens, services and stores. Device leaves only: the Hugging Face network at
 * `global.fetch`, the llama engine, the diffusion native, the phone's RAM and the connection at NetInfo.
 */
import { openModelsFromHome } from '../../harness/modelsApp';
import { resetDeviceMemory } from '../../harness/deviceMemory';
import { GB } from '../../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

const TIMEOUT = { timeout: 4000 };
// The app reads the phone's RAM from the native boundary's default (12 GB Android); the figures below come from the same reader.
const TOTAL_GB = 12;
const REPO = 'org/Run-GGUF';

const stores = () => require('../../../src/stores');
const owners = () => ({
  ...require('../../../src/services/memoryBudget'),
  hardware: require('../../../src/services/hardware').hardwareService,
});
const gb1 = (n: number) => n.toFixed(1);
const entry = (path: string, size: number) => ({ type: 'file', path, size });

afterEach(() => resetDeviceMemory());

describe('Run answer on model cards (rendered)', () => {
  it('Transcription: the tiny card says it runs on this phone', async () => {
    const { rtl, ui } = await openModelsFromHome({ totalGB: TOTAL_GB });
    rtl.fireEvent.press(ui.getByTestId('transcription-models-tab'));
    const tiny = await rtl.waitFor(() => rtl.within(ui.getByTestId('transcription-model-card-0')), TIMEOUT);
    expect(tiny.getByText('Runs on this phone')).toBeTruthy();
  });

  it('Image: small GPU zip runs, a zip over the budget will not, an NPU zip says why the chip cannot, even when too large', async () => {
    const small = 0.5 * GB;
    const big = 3.5 * GB;
    const tight = 2.9 * GB; // over the warning threshold, under what the gate allows a dirty model at 12 GB
    const { rtl, ui } = await openModelsFromHome({
      totalGB: TOTAL_GB,
      hf: hf => {
        // A Snapdragon 8 Gen 1: it has an NPU, but not the one an 8 Gen 2 zip is built for.
        const deviceInfo = require('react-native-device-info');
        (deviceInfo.default ?? deviceInfo).getHardware.mockResolvedValue('qcom');
        require('react-native').NativeModules.LocalDreamModule.getSoCModel = jest.fn(async () => 'SM8450');
        hf.setTree('xororz/sd-mnn', [entry('AbsoluteReality.zip', small), entry('BigModel.zip', big), entry('TightModel.zip', tight)]);
        hf.setTree('xororz/sd-qnn', [entry('HugeNpu_qnn2.28_8gen2.zip', 4 * GB)]);
      },
    });
    const { runVerdict, dirtyIdleBudgetMB, hardware } = owners();
    const policy = require('../../../src/services/modelResidency').modelResidencyManager.getLoadPolicy();
    const totalMB = hardware.getTotalMemoryGB() * 1024;
    const allow = gb1(dirtyIdleBudgetMB(totalMB, { platform: 'android', policy }) / 1024);
    const need = (bytes: number) => runVerdict(hardware.estimateImageModelRam({ size: bytes }) / (1024 * 1024), totalMB, { policy, platform: 'android', dirty: true });
    expect(need(small).verdict).toBe('runs');
    expect(need(big).verdict).toBe('wont');
    expect(need(tight).verdict).toBe('tight');

    rtl.fireEvent.press(ui.getByText('Image Models'));
    // Show every model: the screen starts on the recommended ones only.
    // The phone's chip is known once the banner says what it recommends; only then does the backend filter settle.
    await rtl.waitFor(() => expect(ui.getByText(/NPU models supported/)).toBeTruthy(), TIMEOUT);
    rtl.fireEvent.press(ui.getByTestId('rec-toggle'));
    await rtl.waitFor(() => expect(ui.getByText('Huge Npu (NPU 8gen2)')).toBeTruthy(), TIMEOUT);
    const cardOf = (name: string) => {
      const card = ui.root.findAll((n: any) => typeof n.type === 'string' && /^image-model-card-\d+$/.test(n.props.testID ?? ''))
        .find((n: any) => rtl.within(n).queryAllByText(name).length > 0);
      if (!card) throw new Error(`no card for ${name}`);
      return rtl.within(card);
    };
    await rtl.waitFor(() => expect(cardOf('Absolute Reality (GPU)').getByText('Runs on this phone')).toBeTruthy(), TIMEOUT);
    expect(cardOf('Big Model (GPU)').getByText(`Won't run: needs about ${gb1(need(big).needGB)} GB, this phone allows ${allow} GB`)).toBeTruthy();
    expect(cardOf('Tight Model (GPU)').getByText(`Tight on this phone: needs about ${gb1(need(tight).needGB)} GB of ${allow} GB`)).toBeTruthy();
    const npu = cardOf('Huge Npu (NPU 8gen2)');
    expect(npu.getByText(/^Won't run: requires Snapdragon /)).toBeTruthy();
    expect(npu.queryByText(/needs about/)).toBeNull();
  });

  it('Text: a file card in a model detail shows its run answer', async () => {
    const small = 1 * GB;
    const { rtl, ui } = await openModelsFromHome({
      totalGB: TOTAL_GB,
      hf: hf => {
        hf.setList(() => [{ id: REPO, tags: ['gguf'] }]);
        hf.setTree(REPO, [entry('Run-Q4_K_M.gguf', small)]);
      },
    });
    rtl.fireEvent.changeText(ui.getByTestId('search-input'), 'run');
    rtl.fireEvent.press(await rtl.waitFor(() => ui.getByText('Run-GGUF'), { timeout: 6000 }));
    const card = await rtl.waitFor(() => rtl.within(ui.getByTestId('file-card-0')), TIMEOUT);
    const { runVerdict, hardware } = owners();
    const { textOverheadMultiplier } = require('../../../src/services/activeModelService/types');
    const multiplier = textOverheadMultiplier(stores().useAppStore.getState().settings.inferenceBackend);
    const verdict = runVerdict((small / (1024 * 1024)) * multiplier, hardware.getTotalMemoryGB() * 1024, { platform: 'android' });
    expect(verdict.verdict).toBe('runs');
    expect(card.getByText('Runs on this phone')).toBeTruthy();
  });

  it('Your models: a downloaded image model shows the RAM the load check counts', async () => {
    const size = 1 * GB;
    const { ui, rtl } = await openModelsFromHome({
      totalGB: TOTAL_GB,
      imageModels: [{ id: 'sd', name: 'SD Model', size }],
    });
    rtl.fireEvent.press(ui.getByText('Image Models'));
    const { hardware } = owners();
    const expected = `~${gb1(hardware.estimateImageModelRam({ size }) / GB)} GB RAM`;
    expect(expected).toBe('~2.5 GB RAM');
    await rtl.waitFor(() => expect(ui.getByText(expected)).toBeTruthy(), TIMEOUT);
  });
});
