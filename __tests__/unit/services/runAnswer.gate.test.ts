/**
 * The run answer on a card must agree with the residency gate that actually refuses loads. A dirty
 * model (image, LiteRT) is held to the dirty idle budget, which on small phones sits below the
 * warning threshold where "Runs" ends.
 */
import { Platform } from 'react-native';
import { modelResidencyManager } from '../../../src/services/modelResidency';
import { hardwareService } from '../../../src/services/hardware';
import {
  runVerdict, dirtyIdleBudgetMB, modelMemoryBudgetMB, modelWarningThresholdMB,
} from '../../../src/services/memoryBudget';
import { useAppStore } from '../../../src/stores';
import { textOverheadMultiplier } from '../../../src/services/activeModelService/types';
import { checkMemoryForModel } from '../../../src/services/activeModelService/memory';
import { imageRunAnswer, whisperRunAnswer, textRunAnswer } from '../../../src/services/runAnswer';

const MB = 1024 * 1024;
const DREAMSHAPER_ZIP_BYTES = 1032290626;
const overhead = () => textOverheadMultiplier(useAppStore.getState().settings.inferenceBackend);
const originalOS = Platform.OS;

function phone(totalGB: number) {
  Platform.OS = 'android';
  modelResidencyManager._reset();
  modelResidencyManager.setBudgetOverrideMB(null);
  jest.spyOn(hardwareService, 'getTotalMemoryGB').mockReturnValue(totalGB);
  jest.spyOn(hardwareService, 'getAvailableMemoryGB').mockReturnValue(0.3);
  jest.spyOn(hardwareService, 'refreshMemoryInfo').mockResolvedValue(undefined as never);
}

afterEach(() => { Platform.OS = originalOS; jest.restoreAllMocks(); });

describe('run answer follows the residency gate', () => {
  it.each([4, 5.5, 7.4, 12])('on a %s GB Android phone a dirty model is "wont" exactly where the gate refuses it', async totalGB => {
    phone(totalGB);
    const totalMB = totalGB * 1024;
    const idle = dirtyIdleBudgetMB(totalMB, { platform: 'android' });
    for (const need of [idle - 50, idle + 50]) {
      modelResidencyManager._reset();
      const { fits } = await modelResidencyManager.makeRoomFor({ key: 'image', type: 'image', sizeMB: need, dirtyMemory: true });
      const { verdict } = runVerdict(need, totalMB, { platform: 'android', dirty: true });
      expect(verdict === 'wont').toBe(!fits);
    }
  });

  it('a clean (GGUF) model is held to the plain budget, as the gate does', async () => {
    phone(5.5);
    const budget = Math.round(modelMemoryBudgetMB(5.5 * 1024, 'android'));
    for (const need of [budget - 50, budget + 50]) {
      modelResidencyManager._reset();
      const { fits } = await modelResidencyManager.makeRoomFor({ key: 'text', type: 'text', sizeMB: need });
      expect(runVerdict(need, 5.5 * 1024, { platform: 'android' }).verdict === 'wont').toBe(!fits);
    }
  });

  it('DreamShaper V8 (GPU zip) on a 5.5 GB Android phone is not "Runs on this phone"', () => {
    phone(5.5);
    const answer = imageRunAnswer({ size: DREAMSHAPER_ZIP_BYTES });
    const needMB = hardwareService.estimateImageModelRam({ size: DREAMSHAPER_ZIP_BYTES }) / MB;
    // The band the review found: the old check said "runs" here; the gate refuses it.
    expect(runVerdict(needMB, 5.5 * 1024, { platform: 'android' }).verdict).toBe('runs');
    expect(needMB).toBeLessThanOrEqual(modelWarningThresholdMB(5.5 * 1024, 'android'));
    expect(answer.verdict).toBe('wont');
    expect(answer.text).toMatch(/^Won't run: needs about /);
  });

  it('a LiteRT file card is dirty: it is refused at the lower budget', () => {
    phone(5.5);
    const idleMB = dirtyIdleBudgetMB(5.5 * 1024, { platform: 'android' });
    const bytes = (idleMB / overhead() + 100) * MB;
    expect(textRunAnswer({ size: bytes }, { dirty: true }).verdict).toBe('wont');
    expect(textRunAnswer({ size: bytes }).verdict).not.toBe('wont');
  });

  it('a text file card counts its vision companion, as the gate does', () => {
    phone(5.5);
    const budgetMB = Math.round(modelMemoryBudgetMB(5.5 * 1024, 'android'));
    const size = (budgetMB / overhead() - 100) * MB;
    expect(textRunAnswer({ size }).verdict).not.toBe('wont');
    expect(textRunAnswer({ size, mmProjFile: { size: 300 * MB } }).verdict).toBe('wont');
  });

  it('Whisper is "wont" only when its file passes the gate; its stated RAM can make it "tight"', () => {
    phone(4);
    const warn = modelWarningThresholdMB(4 * 1024, 'android');
    // Large v3: file ~1.5 GB, description states 3 GB. The gate counts the file alone, so it loads.
    const large = whisperRunAnswer({ size: 1550, ramGB: 3 });
    expect(large.verdict).toBe('tight');
    expect(1550).toBeLessThanOrEqual(modelMemoryBudgetMB(4 * 1024, 'android'));
    expect(whisperRunAnswer({ size: 75, ramGB: 0.3 }).verdict).toBe('runs');
    expect(warn).toBeGreaterThan(75);
    expect(whisperRunAnswer({ size: 5000, ramGB: 6 }).verdict).toBe('wont');
  });

  it('the load pre-check refuses the same dirty image model the card says will not run', async () => {
    phone(5.5);
    jest.spyOn(hardwareService, 'getDeviceInfo').mockResolvedValue({ totalMemory: 5.5 * 1024 * MB } as never);
    const model = { id: 'ds', name: 'DreamShaper V8', size: DREAMSHAPER_ZIP_BYTES } as never;
    const result = await checkMemoryForModel({
      modelId: 'ds', modelType: 'image',
      ids: { loadedTextModelId: null, loadedImageModelId: null },
      lists: { downloadedModels: [], downloadedImageModels: [model] },
    });
    expect(result.canLoad).toBe(false);
    expect(result.severity).toBe('critical');
  });
});
