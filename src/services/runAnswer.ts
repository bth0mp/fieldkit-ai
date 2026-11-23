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

function answerFor(requiredMB: number): RunAnswer {
  const totalRamMB = hardwareService.getTotalMemoryGB() * MB_PER_GB;
  const { verdict, needGB, allowGB } = runVerdict(requiredMB, totalRamMB, { policy: modelResidencyManager.getLoadPolicy() });
  const need = needGB.toFixed(1);
  const allow = allowGB.toFixed(1);
  if (verdict === 'wont') return { verdict, text: `Won't run: needs about ${need} GB, this phone allows ${allow} GB` };
  if (verdict === 'tight') return { verdict, text: `Tight on this phone: needs about ${need} GB of ${allow} GB` };
  return { verdict, text: 'Runs on this phone' };
}

/** A text model file of this size, as the load check would count it. */
export function textRunAnswer(sizeBytes: number): RunAnswer {
  const requiredGB = estimateModelMemoryGB({ fileSize: sizeBytes } as DownloadedModel, 'text');
  return answerFor(requiredGB * MB_PER_GB);
}

/** An image model; `chipReason` (the chip check's wording) wins over the memory answer. */
export function imageRunAnswer(model: { size: number }, chipReason?: string): RunAnswer {
  if (chipReason) return { verdict: 'wont', text: `Won't run: ${chipReason.charAt(0).toLowerCase()}${chipReason.slice(1)}` };
  return answerFor(hardwareService.estimateImageModelRam(model) / BYTES_PER_MB);
}

/** A Whisper model: the larger of its file (`size`, MB) and the memory its description states. */
export function whisperRunAnswer(model: { size: number; ramGB?: number }): RunAnswer {
  return answerFor(Math.max(model.size, (model.ramGB ?? 0) * MB_PER_GB));
}
