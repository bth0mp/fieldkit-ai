import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { speechService } from '../../services/speech/speechService';
import { useSpeechStore } from '../../stores';
import { useTheme } from '../../theme';
import { triggerHaptic } from '../../utils/haptics';

interface AutoSpeakRowProps {
  /** The popover's row styles (slot `quickSettingsAudioRow`), so this row looks like the ones around it. */
  styles: Record<string, object>;
  onClose: () => void;
}

/**
 * The "Read replies aloud" row in the chat input's quick settings. It reads the speech store and asks the
 * service to flip the setting; the popover stays open, as it does for the Thinking row.
 */
export const AutoSpeakRow: React.FC<AutoSpeakRowProps> = ({ styles }) => {
  const { colors } = useTheme();
  const autoSpeak = useSpeechStore(state => state.autoSpeak);
  // Same rule as the Speak button. A switch that is already on stays, so it can still be turned off.
  const canSpeak = useSpeechStore(() => speechService.canSpeak());

  if (!canSpeak && !autoSpeak) return null;

  return (
    <TouchableOpacity
      testID="quick-read-aloud"
      accessibilityRole="switch"
      accessibilityState={{ checked: autoSpeak }}
      style={styles.row}
      onPress={() => {
        triggerHaptic('impactLight');
        speechService.setAutoSpeak(!autoSpeak);
      }}
    >
      <Icon name="volume-2" size={16} color={autoSpeak ? colors.primary : colors.textMuted} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>Read replies aloud</Text>
      {autoSpeak && <Icon testID="read-aloud-on" name="check" size={16} color={colors.primary} />}
    </TouchableOpacity>
  );
};
