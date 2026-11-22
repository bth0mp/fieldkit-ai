import { initLlama, LlamaContext } from 'llama.rn';
import { Platform } from 'react-native';
import logger from '../utils/logger';

/** Timeout for Adreno GPU context init on Android. 8s proved too tight on-device: Adreno 735
 *  first-load OpenCL kernel compilation exceeded it (2026-07-13 20:11 log: "timed out after
 *  8000ms" on a load that succeeded with 24 offloaded layers in an earlier session), silently
 *  downgrading every reload to CPU. The init runs on a native thread (no ANR exposure); 25s
 *  bounds a genuinely hung driver while letting a slow first compile finish. */
const GPU_INIT_TIMEOUT_MS = 25000;
/** Timeout for HTP/NPU context init -- DSP firmware load takes longer than Adreno. */
const HTP_INIT_TIMEOUT_MS = 30000;
/** iOS Metal init timeout. Larger than Android's because a legit large-model
 *  Metal setup takes longer — but bounded, so a Metal graph that HANGS (e.g.
 *  gemma3n froze indefinitely at kv-cache/graph construction) falls back to CPU
 *  instead of spinning the loader forever. */
const GPU_INIT_TIMEOUT_MS_IOS = 45000;
/** Race a promise against a timeout; rejects with descriptive error on expiry. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
/** Safely release a context, swallowing errors (used during fallback cleanup). */
async function safeRelease(ctx: LlamaContext | null): Promise<void> {
  if (!ctx) return;
  try { await ctx.release(); } catch (e) { logger.warn('[LLM] Error releasing context during fallback:', e); }
}
/** The bounded time a GPU/HTP context init may take before we fall back to CPU.
 *  Platform/backend only changes the DURATION (data) — the timeout policy itself
 *  is uniform. */
function gpuInitTimeoutMs(isHtp: boolean): number {
  if (isHtp) return HTP_INIT_TIMEOUT_MS;            // Android HTP/NPU
  return Platform.OS === 'ios' ? GPU_INIT_TIMEOUT_MS_IOS : GPU_INIT_TIMEOUT_MS;
}
/**
 * Race a GPU/HTP context init against a timeout so a HUNG backend (an iOS Metal
 * graph that never returns, an Android Adreno ANR) falls back to CPU instead of
 * spinning the loader forever. This applies on EVERY platform — the only
 * platform/backend difference is the timeout duration (see gpuInitTimeoutMs).
 * Previously it was gated to Android, which is exactly why a hung iOS Metal load
 * (e.g. gemma3n freezing at kv-cache/graph construction) had no escape hatch.
 */
export async function tryGpuInit(promise: Promise<LlamaContext>, nGpuLayers: number, isHtp: boolean = false): Promise<LlamaContext> {
  if (nGpuLayers <= 0) return promise; // pure-CPU init — nothing to time out
  const timeoutMs = gpuInitTimeoutMs(isHtp);
  let timedOut = false;
  promise.then(ctx => { if (timedOut) safeRelease(ctx); }).catch(() => {});
  try { return await withTimeout(promise, timeoutMs, isHtp ? 'HTP context init' : 'GPU context init'); }
  catch (e) { timedOut = true; throw e; }
}

/**
 * After an NPU init failure, the same model on the plain GPU backend: no HTP device and no cache
 * types, which belong to the NPU. Null when there is no GPU layer count to offer or the init fails,
 * so the caller moves on to the CPU.
 */
export async function tryGpuFallback(params: object, contextLength: number, fallbackGpuLayers: number): Promise<LlamaContext | null> {
  if (fallbackGpuLayers <= 0) return null;
  const gpuParams = { ...(params as Record<string, unknown>) };
  delete gpuParams.devices;
  delete gpuParams.cache_type_k;
  delete gpuParams.cache_type_v;
  try {
    logger.warn('[LLM] NPU initialization failed; trying the supported GPU backend');
    return await tryGpuInit(initLlama({ ...gpuParams, n_ctx: contextLength, n_gpu_layers: fallbackGpuLayers } as any), fallbackGpuLayers);
  } catch (fallbackError) {
    logger.warn('[LLM] GPU fallback failed:', fallbackError);
    return null;
  }
}
