import React from 'react';
import { View, Dimensions } from 'react-native';
import { AppSheet } from '../../components/AppSheet';
import { useSlot, SLOTS } from '../../bootstrap/slotRegistry';
import { useThemedStyles } from '../../theme';
import type { ThemeColors } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// The pro Voice panel is a ScrollView, which collapses to zero height inside a
// content-sized sheet. Give the content a definite height so it renders.
const PANEL_HEIGHT = Math.round(Dimensions.get('window').height * 0.6);

/**
 * Voice (TTS) model picker — reuses the pro Voice panel (engine selection +
 * link to voice options) rendered via the modelsScreen.voiceTab slot. Renders an
 * empty-state line in free builds where the slot isn't registered.
 */
export const VoiceModelsSheet: React.FC<Props> = ({ visible, onClose }) => {
  const styles = useThemedStyles(createStyles);
  // Reactive: picks up the pro Voice panel live when Pro is activated at runtime
  // (loadProFeatures registers the slot), without needing an app restart.
  const VoicePanel = useSlot(SLOTS.modelsScreenVoiceTab);

  return (
    <AppSheet visible={visible} onClose={onClose} title="VOICE MODEL" enableDynamicSizing>
      <View style={styles.content}>
        {VoicePanel ? <VoicePanel /> : null}
      </View>
    </AppSheet>
  );
};

const createStyles = (_colors: ThemeColors) => ({
  content: { height: PANEL_HEIGHT },
});
