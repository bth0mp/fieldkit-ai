import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { useAppStore } from '../stores/appStore';
import { buildModelParams, validateModelFile, checkMemoryForModel, resolveSafeContext } from './llmHelpers';
import { effectiveAvailableMB } from './memoryBudget';
import { modelResidencyManager } from './modelResidency';
import { hardwareService } from './hardware';
import logger from '../utils/logger';

/** Everything a load needs before the native init: file checks, resolved params, and the memory verdict. */
export async function validateAndPrepareModel(modelPath: string, override: boolean = false): Promise<{ fileSize: number; memCheck: Awaited<ReturnType<typeof checkMemoryForModel>>; params: ReturnType<typeof buildModelParams> }> {
  logger.log(`[LLM] validateAndPrepareModel: ${modelPath}`);
  if (!await RNFS.exists(modelPath)) throw new Error(`Model file not found at: ${modelPath}`);
  const validation = await validateModelFile(modelPath);
  if (!validation.valid) throw new Error(`Cannot load model: ${validation.reason}`);
  const settings = useAppStore.getState().settings;
  logger.log(`[LLM] User settings: threads=${settings.nThreads}, batch=${settings.nBatch}, ctx=${settings.contextLength}, gpu=${settings.enableGpu}, flashAttn=${settings.flashAttn}, cache=${settings.cacheType}`);
  const recommendedThreads = await hardwareService.getRecommendedThreadCount();
  // nThreads === 0 is the "auto" sentinel — substitute the hardware-recommended count.
  // Any explicit user choice (1–12) is respected as-is.
  const effectiveNThreads = settings.nThreads === 0 ? recommendedThreads : settings.nThreads;
  const params = buildModelParams(modelPath, { ...settings, nThreads: effectiveNThreads });
  logger.log(`[LLM] Resolved params: threads=${params.nThreads}, batch=${params.nBatch}, ctx=${params.ctxLen}, gpuLayers=${params.nGpuLayers}`);
  const fileStat = await RNFS.stat(modelPath);
  const fileSize = typeof fileStat.size === 'string' ? Number.parseInt(fileStat.size, 10) : fileStat.size;
  // Use the EFFECTIVE cache type, not the raw setting: OpenCL/HTP coerce the KV cache
  // to f16 (see buildModelParams), so keying off settings.cacheType alone would let the
  // guard use the cheaper quantized estimate and approve a context that then OOMs.
  const quantizedCache = !params.usesF16Cache;
  // Feed the pre-load gate the SAME reclaim-aware available RAM the residency gate uses (the single owner,
  // effectiveAvailableMB) so the two can never disagree. On Android the raw os_proc snapshot under-counts a
  // foreground load (the LMK hands background apps' physical pages to us), so a raw gate REFUSED a model
  // residency ADMITTED — 12GB Android Aggressive, device qwythos. iOS returns raw unchanged (no reclaim —
  // jetsam kills us), so iOS is untouched. Policy comes from the residency manager (the authoritative owner).
  const getMem = async (): Promise<{ available: number; total: number; used: number }> => {
    const raw = await hardwareService.getAppMemoryUsage();
    const availableMB = effectiveAvailableMB(raw.available / (1024 * 1024), raw.total / (1024 * 1024), {
      platform: Platform.OS,
      policy: modelResidencyManager.getLoadPolicy(),
    });
    return { ...raw, available: availableMB * 1024 * 1024 };
  };
  let memCheck = await checkMemoryForModel({ modelFileSize: fileSize, contextLength: params.ctxLen, getAvailableMemory: getMem, quantizedCache });
  if (!memCheck.safe) {
    // Don't just warn and load into a near-certain native allocator crash (the iOS
    // metal_buffer_type_alloc_buffer / Android litert OOM clusters). Reduce context
    // to the largest size that fits; only block when the weights alone can't fit.
    const downgrade = await resolveSafeContext({ fileSize, requestedCtx: params.ctxLen, quantizedCache, override, getAvailableMemory: getMem });
    params.ctxLen = downgrade.ctxLen;
    memCheck = downgrade.memCheck;
  }
  logger.log(`[LLM] Memory check: estimatedMB=${memCheck.estimatedMB.toFixed(0)}, availableMB=${memCheck.availableMB.toFixed(0)}, safe=${memCheck.safe}, ctx=${params.ctxLen}`);
  return { fileSize, memCheck, params };
}
