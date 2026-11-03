import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { SPACING } from '../../constants';
import { speechService } from '../../services/speech/speechService';
import { useSpeechStore } from '../../stores';
import { useTheme } from '../../theme';
import logger from '../../utils/logger';

interface SpeakButtonProps {
  /** The reply, already reduced to what should be heard. */
  text: string;
  messageId: string;
}

/**
 * The speaker in an assistant reply's meta row (slot `messageSpeakButton`). It reads the speech store and
 * asks the service to start or stop; it holds no speech state of its own.
 */
export const SpeakButton: React.FC<SpeakButtonProps> = ({ text, messageId }) => {
  const { colors } = useTheme();
  // The host memoises the message row, so subscribe here: the button must vanish as soon as the service
  // learns the device has no offline voice.
  const canSpeak = useSpeechStore(() => speechService.canSpeak());
  const speaking = useSpeechStore(state => state.speakingMessageId === messageId);

  if (!canSpeak) return null;

  const onPress = () => {
    if (speaking) {
      speechService.stop();
      return;
    }
    speechService.speakMessage({ text, messageId }).catch(error => logger.warn('[SPEECH-UI] speak failed', error));
  };

  return (
    <TouchableOpacity
      testID={`speak-button-${messageId}`}
      accessibilityRole="button"
      accessibilityLabel={speaking ? 'Stop speaking' : 'Speak'}
      style={styles.button}
      onPress={onPress}
    >
      <Icon name={speaking ? 'square' : 'volume-2'} size={14} color={colors.textMuted} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: { padding: SPACING.xs },
});
