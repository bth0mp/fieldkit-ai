import logger from '../utils/logger';
import { registerVoiceFeature } from './voice/registerVoice';

let activated = false;

/**
 * Register Fieldkit's own features with the core hook and slot registries. Idempotent, and a failing
 * feature is logged instead of aborting app start.
 */
export function activateFieldkitFeatures(): void {
  if (activated) return;
  activated = true;
  try {
    registerVoiceFeature();
  } catch (error) {
    logger.error('[FEATURES] voice registration failed', error);
  }
}
