import { registerHook, HOOKS } from '../../bootstrap/hookRegistry';
import { registerSlot, SLOTS } from '../../bootstrap/slotRegistry';
import { speechService } from '../../services/speech/speechService';
import { SpeakButton } from './SpeakButton';
import { VoicePanel, VoiceTabPanel } from './VoicePanel';

/**
 * Plug speech into the core chat hooks and slots. Arrow wrappers, so the hooks always reach the live
 * service methods (a bare method reference would lose `this`).
 */
export function registerVoiceFeature(): void {
  registerSlot(SLOTS.messageSpeakButton, SpeakButton);
  registerSlot(SLOTS.generationSettingsTts, VoicePanel);
  registerSlot(SLOTS.modelsScreenVoiceTab, VoiceTabPanel);
  registerHook(HOOKS.audioCanSpeak, () => speechService.canSpeak());
  registerHook(HOOKS.audioSpeak, (text: string, messageId: string) => speechService.speakMessage({ text, messageId }));
  registerHook(HOOKS.audioStop, () => speechService.stop());
  registerHook(HOOKS.audioOnAppBackground, () => speechService.stop());
}
