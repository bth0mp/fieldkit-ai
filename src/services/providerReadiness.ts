// Readiness gate every generation passes before it starts (moved out of generationServiceHelpers.ts
// to keep that file under the max-lines limit). `svc` is the GenerationService instance.
import { llmService } from './llm';
import { liteRTService } from './litert';
import { getActiveEngineService } from './engines';

/** Null when the active provider can generate now, else the error message to throw. */
export async function checkProviderReadiness(svc: any): Promise<string | null> {
  if (svc.isUsingRemoteProvider()) {
    const provider = svc.getCurrentProvider();
    if (!provider) return 'Remote provider not found';
    const ready = await provider.isReady();
    if (!ready) return 'Remote provider not ready';
  } else if (getActiveEngineService() === liteRTService) {
    if (!liteRTService.isModelLoaded()) return 'No LiteRT model loaded';
  } else {
    if (!llmService.isModelLoaded()) return 'No model loaded';
    // A still-unwinding completion (a stop can only take effect once prefill finishes) is NOT an
    // error — wait for the engine to go idle instead of failing the user's send. Only a genuinely
    // stuck/concurrent generation (still busy after the bounded wait) surfaces the busy error.
    if (llmService.isCurrentlyGenerating() && !(await llmService.waitForIdle())) return 'LLM service busy';
  }
  return null;
}
