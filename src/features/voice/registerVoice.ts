import { registerHook, HOOKS } from '../../bootstrap/hookRegistry';
import { registerSlot, SLOTS } from '../../bootstrap/slotRegistry';
import { speechService } from '../../services/speech/speechService';
import logger from '../../utils/logger';
import { AutoSpeakRow } from './AutoSpeakRow';
import { SpeakButton } from './SpeakButton';
import { VoicePanel, VoiceTabPanel } from './VoicePanel';

/**
 * The streaming hooks run inside the chat store's token handler: a failure there must never break the reply
 * the user is waiting for, so it is logged and dropped.
 */
function unlessItThrows<A>(name: string, run: (arg: A) => void): (arg: A) => void {
  return (arg: A) => {
    try {
      run(arg);
    } catch (error) {
      logger.error(`[SPEECH-UI] ${name} failed`, error);
    }
  };
}

/**
 * Plug speech into the core chat hooks and slots. Arrow wrappers, so the hooks always reach the live
 * service methods (a bare method reference would lose `this`).
 */
export function registerVoiceFeature(): void {
  registerSlot(SLOTS.messageSpeakButton, SpeakButton);
  registerSlot(SLOTS.generationSettingsTts, VoicePanel);
  registerSlot(SLOTS.modelsScreenVoiceTab, VoiceTabPanel);
  registerSlot(SLOTS.quickSettingsAudioRow, AutoSpeakRow);
  registerHook(HOOKS.audioCanSpeak, () => speechService.canSpeak());
  registerHook(HOOKS.audioSpeak, (text: string, messageId: string) => speechService.speakMessage({ text, messageId }));
  registerHook(HOOKS.audioStop, () => speechService.stop());
  registerHook(HOOKS.audioOnAppBackground, () => speechService.stop());
  registerHook(HOOKS.audioOnStreamingToken, unlessItThrows('onStreamingToken', (cumulative: string) => speechService.onStreamingToken(cumulative)));
  registerHook(HOOKS.audioOnStreamingEnd, unlessItThrows('onStreamingEnd', (conversationId: string) => speechService.onStreamingEnd(conversationId)));
}
