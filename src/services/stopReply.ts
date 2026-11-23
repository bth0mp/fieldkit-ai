import { generationSession } from './generationSession';
import { generationService } from './generationService';
import { callHook, HOOKS } from '../bootstrap/hookRegistry';
import logger from '../utils/logger';

/** Stop the reply being written: end its session, silence TTS, stop the engine. All three start at once. */
export async function stopReply(): Promise<void> {
  generationSession.end('stopped');
  callHook(HOOKS.audioStop); // abort must silence TTS too — buffered-ahead sentences keep playing otherwise
  try { await generationService.stopGeneration().catch(() => { }); }
  catch (e) { logger.error('Error stopping generation:', e); }
}
