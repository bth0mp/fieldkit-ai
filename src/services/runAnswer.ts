/**
 * "Does this model run on this phone?" for a model card. The numbers come from the same owners the
 * load pre-check uses (runVerdict, the residency manager's load policy, the image RAM estimator), so a
 * card never promises a model the app then refuses to load.
 */
import type { DownloadedModel } from '../types';
import { hardwareService } from './hardware';
import { modelResidencyManager } from './modelResidency';
import { runVerdict, type RunVerdict } from './memoryBudget';
import { estimateModelMemoryGB } from './activeModelService/memory';

export interface RunAnswer {
  verdict: RunVerdict;
  text: string;
}

const MB_PER_GB = 1024;
const BYTES_PER_MB = 1024 * 1024;

function answerFor(requiredMB: number, dirty = false): RunAnswer {
  const totalRamMB = hardwareService.getTotalMemoryGB() * MB_PER_GB;
  const { verdict, needGB, allowGB } = runVerdict(requiredMB, totalRamMB, { policy: modelResidencyManager.getLoadPolicy(), dirty, realAvailMB: hardwareService.getAvailableMemoryGB() * MB_PER_GB });
  return textFor(verdict, needGB, allowGB);
}

function textFor(verdict: RunVerdict, needGB: number, allowGB: number): RunAnswer {
  const need = needGB.toFixed(1);
  const allow = allowGB.toFixed(1);
  if (verdict === 'wont') return { verdict, text: `Won't run: needs about ${need} GB, this phone allows ${allow} GB` };
  if (verdict === 'tight') {
    // A stated need above the allowance (Whisper's description) reads like the Won't run line, not "3.0 of 2.0".
    const text = needGB > allowGB
      ? `Tight on this phone: needs about ${need} GB, this phone allows ${allow} GB`
      : `Tight on this phone: needs about ${need} GB of ${allow} GB`;
    return { verdict, text };
  }
  return { verdict, text: 'Runs on this phone' };
}

/**
 * A text model file, as the load check counts it (file plus its vision companion). `dirty` is a
 * LiteRT file: the gate holds that to real free RAM, not just the physical budget.
 */
export function textRunAnswer(file: { size: number; mmProjFile?: { size: number } }, opts: { dirty?: boolean } = {}): RunAnswer {
  const requiredGB = estimateModelMemoryGB({ fileSize: file.size, mmProjFileSize: file.mmProjFile?.size } as DownloadedModel, 'text');
  return answerFor(requiredGB * MB_PER_GB, opts.dirty);
}

/** An image model (always dirty memory to the gate); `chipReason` (the chip check's wording) wins over the memory answer. */
export function imageRunAnswer(model: { size: number }, chipReason?: string): RunAnswer {
  if (chipReason) return { verdict: 'wont', text: `Won't run: ${chipReason.charAt(0).toLowerCase()}${chipReason.slice(1)}` };
  return answerFor(hardwareService.estimateImageModelRam(model) / BYTES_PER_MB, true);
}

/**
 * A Whisper model. The load gate counts the file alone (`size`, MB), so only a file past the budget
 * is `wont`; the memory the description states (`ramGB`) can still make it `tight`.
 */
export function whisperRunAnswer(model: { size: number; ramGB?: number }): RunAnswer {
  const totalRamMB = hardwareService.getTotalMemoryGB() * MB_PER_GB;
  const opts = { policy: modelResidencyManager.getLoadPolicy() };
  const file = runVerdict(model.size, totalRamMB, opts);
  if (file.verdict === 'wont') return textFor('wont', file.needGB, file.allowGB);
  const stated = runVerdict(Math.max(model.size, (model.ramGB ?? 0) * MB_PER_GB), totalRamMB, opts);
  return textFor(stated.verdict === 'wont' ? 'tight' : stated.verdict, stated.needGB, stated.allowGB);
}
