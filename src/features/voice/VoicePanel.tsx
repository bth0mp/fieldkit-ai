import React, { useLayoutEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { Button } from '../../components/Button';
import { SliderSetting } from '../../components/SliderSetting';
import { BRAND } from '../../config/branding';
import { SPACING, TYPOGRAPHY } from '../../constants';
import { pickVoice, speechService } from '../../services/speech/speechService';
import type { SpeechVoice } from '../../services/speech/speechTypes';
import { useSpeechStore } from '../../stores';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemeColors } from '../../theme';
import logger from '../../utils/logger';

const LOG = '[SPEECH-UI]';

/** Rate and pitch: 1.0 is normal for Android's TextToSpeech, and the native module passes the value through unclamped. */
const RANGE = { min: 0.5, max: 2, step: 0.1 };

/** Fire a service call from a gesture. The service reports its outcome through the store; failures are only logged. */
const run = (what: string, call: () => Promise<void>) => () => {
  call().catch(error => logger.warn(`${LOG} ${what} failed`, error));
};

/** A voice name is a locale display name and not unique: when two rows would read the same, add the id. */
function rowLabel(voice: SpeechVoice, voices: SpeechVoice[]): string {
  const twins = voices.filter(other => other.name === voice.name).length;
  return twins > 1 ? `${voice.name} · ${voice.id}` : voice.name;
}

const Notice: React.FC<{ text: string; actionTitle?: string; actionTestID?: string; onAction?: () => void }> = ({
  text, actionTitle, actionTestID, onAction,
}) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} variant="outline" size="small" testID={actionTestID} style={styles.action} />
      ) : null}
    </View>
  );
};

const EngineRow: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const enginePackage = useSpeechStore(state => state.enginePackage);
  return (
    <View style={styles.section} testID="voice-engine">
      <Text style={styles.sectionLabel}>SPEECH ENGINE</Text>
      <Text style={styles.engineText}>{enginePackage ?? 'Connecting'}</Text>
    </View>
  );
};

const VoiceRow: React.FC<{ voice: SpeechVoice; label: string; selected: boolean }> = ({ voice, label, selected }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      testID={`voice-row-${voice.id}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.row, selected && styles.rowSelected]}
      onPress={run('selectVoice', () => speechService.selectVoice(voice.id))}
    >
      <Text style={styles.rowText}>{label}</Text>
      {selected ? <Icon name="check" size={16} color={colors.primary} testID={`voice-row-${voice.id}-selected`} /> : null}
    </TouchableOpacity>
  );
};

const VoiceList: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const voices = useSpeechStore(state => state.voices);
  const selectedVoiceId = useSpeechStore(state => state.selectedVoiceId);
  if (voices.length === 0) return null;
  const activeId = pickVoice(voices, selectedVoiceId)?.id;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>VOICE</Text>
      {voices.map(voice => (
        <VoiceRow key={voice.id} voice={voice} label={rowLabel(voice, voices)} selected={voice.id === activeId} />
      ))}
      <Text style={styles.hint}>Only voices that work without internet are listed.</Text>
      <Button
        title="Preview voice"
        onPress={run('previewVoice', () => speechService.previewVoice())}
        variant="outline"
        size="small"
        testID="voice-preview"
        style={styles.action}
      />
    </View>
  );
};

const Tuning: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const rate = useSpeechStore(state => state.rate);
  const pitch = useSpeechStore(state => state.pitch);
  return (
    <View style={styles.section}>
      <SliderSetting
        testID="voice-rate"
        label="Speaking rate"
        value={rate}
        {...RANGE}
        decimals={1}
        formatValue={value => `${value.toFixed(1)}x`}
        onChange={value => speechService.setRate(value)}
      />
      <SliderSetting
        testID="voice-pitch"
        label="Pitch"
        value={pitch}
        {...RANGE}
        decimals={1}
        onChange={value => speechService.setPitch(value)}
      />
    </View>
  );
};

const VoiceBody: React.FC = () => {
  const available = useSpeechStore(state => state.available);
  const phase = useSpeechStore(state => state.phase);
  const needsVoiceInstall = useSpeechStore(state => state.needsVoiceInstall);

  // The service tells the store what the device offers; looking again on every open also picks up a voice
  // installed since. A layout effect, so the first paint already knows the module is there (refresh()
  // marks the engine available synchronously) instead of flashing "not available".
  useLayoutEffect(() => {
    speechService.refresh().catch(error => logger.warn(`${LOG} refresh failed`, error));
  }, []);

  if (!available) return <Notice text="Voice replies are not available on this device." />;
  if (phase === 'error') {
    return (
      <Notice
        text="Speech is not working right now. Try again."
        actionTitle="Try again"
        actionTestID="voice-retry"
        onAction={run('refresh', () => speechService.refresh())}
      />
    );
  }
  if (needsVoiceInstall) {
    return (
      <Notice
        text={`No offline voice is installed. ${BRAND.name} only uses voices that work without internet.`}
        actionTitle="Install a voice"
        actionTestID="voice-install"
        onAction={run('openVoiceInstaller', () => speechService.openVoiceInstaller())}
      />
    );
  }
  if (phase === 'unavailable') return <Notice text="No speech engine is installed on this device." />;
  return (
    <>
      <EngineRow />
      <VoiceList />
      <Tuning />
    </>
  );
};

/** The voice settings for hosts that already scroll (Chat Settings, Model Settings). */
export const VoicePanel: React.FC<{ onNavigateToTTSSettings?: () => void }> = () => <VoiceBody />;

/** The Voice tab and the Voice sheet, neither of which scrolls on its own. */
export const VoiceTabPanel: React.FC = () => (
  <ScrollView testID="voice-panel-scroll" style={tabStyles.scroll} contentContainerStyle={tabStyles.content}>
    <VoiceBody />
  </ScrollView>
);

const tabStyles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
});

const createStyles = (colors: ThemeColors) => ({
  section: { marginBottom: SPACING.lg },
  sectionLabel: { ...TYPOGRAPHY.label, color: colors.textMuted, marginBottom: SPACING.sm },
  engineText: { ...TYPOGRAPHY.body, color: colors.text },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowSelected: { borderColor: colors.primary },
  rowText: { ...TYPOGRAPHY.body, color: colors.text, flexShrink: 1, marginRight: SPACING.sm },
  hint: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, marginTop: SPACING.xs },
  notice: { marginBottom: SPACING.lg },
  noticeText: { ...TYPOGRAPHY.body, color: colors.textSecondary },
  action: { alignSelf: 'flex-start' as const, marginTop: SPACING.md },
});
