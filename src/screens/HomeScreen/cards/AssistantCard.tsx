import React, { useState } from 'react';
import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AttachStep } from 'react-native-spotlight-tour';
import { Card } from '../../../components/Card';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { VoiceRecordButton } from '../../../components/VoiceRecordButton';
import { useVoiceInput } from '../../../components/ChatInput/Voice';
import { useTheme, useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';

type Props = {
  /** The loaded model's name, whether it runs on a remote server, and whether a model is loading. */
  chip: { label: string; remote: boolean; loading: boolean };
  /** Opens the Models screen. */
  onOpenModels: () => void;
  /** A text or image model is active, so a question can be asked. */
  canChat: boolean;
  /** Takes the ask box's place while no model is active. */
  setup: React.ReactNode;
  /** Starts a new chat with this question sent. */
  onAsk: (text: string) => void;
  /** The last chats, under the ask box. */
  recent: React.ReactNode;
};

/** Typed text, or dictation from the mic into the box as in a chat. */
const AskBox: React.FC<{ onAsk: (text: string) => void }> = ({ onAsk }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [text, setText] = useState('');
  // Dictation goes after what is already typed, with a space, as in a chat's composer.
  const voice = useVoiceInput({
    onTranscript: (spoken) => {
      if (!spoken.trim()) return;
      setText((prev) => (prev.trim() ? `${prev.trim()} ` : '') + spoken);
    },
  });
  const question = text.trim();
  const send = () => {
    if (!question) return;
    onAsk(question);
    setText('');
  };

  return (
    <View style={styles.askRow}>
      <TextInput
        testID="home-ask-input"
        style={styles.askInput}
        value={text}
        onChangeText={setText}
        returnKeyType="send"
        onSubmitEditing={send}
        blurOnSubmit
        placeholder="Ask anything"
        placeholderTextColor={colors.textMuted}
      />
      <VoiceRecordButton
        asSendButton
        isRecording={voice.isRecording}
        isAvailable={voice.voiceAvailable}
        isModelLoading={voice.isModelLoading}
        isTranscribing={voice.isTranscribing}
        partialResult={voice.partialResult}
        error={voice.error}
        onStartRecording={voice.startRecording}
        onStopRecording={voice.stopRecording}
        onCancelRecording={voice.cancelRecording}
      />
      <AnimatedPressable
        testID="home-ask-send"
        accessibilityLabel="Send"
        disabled={!question}
        onPress={send}
        hapticType="selection"
        style={styles.sendButton}
      >
        <Icon name="send" size={18} color={colors.background} />
      </AnimatedPressable>
    </View>
  );
};

/**
 * Home's Assistant card: a chip naming the loaded model (it opens the Models screen), the ask box (or the
 * setup card while no model is active) and the last chats.
 */
export const AssistantCard: React.FC<Props> = ({ chip, onOpenModels, canChat, setup, onAsk, recent }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Assistant</Text>
        {/* Both the text (1) and image (13) tour steps anchor on the model chip. */}
        <AttachStep index={[1, 13]} style={styles.chipAnchor}>
          <AnimatedPressable
            testID="models-summary"
            style={styles.chip}
            hapticType="selection"
            onPress={onOpenModels}
            accessibilityRole="button"
            accessibilityLabel={`${chip.label}${chip.loading ? ', loading' : ''}. Opens Models`}
          >
            {chip.remote && <Icon testID="model-chip-remote" name="server" size={12} color={colors.textMuted} />}
            <Text testID="model-chip-label" style={styles.chipLabel} numberOfLines={1}>{chip.label}</Text>
            {chip.loading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Icon name="chevron-right" size={14} color={colors.textMuted} />}
          </AnimatedPressable>
        </AttachStep>
      </View>
      {canChat ? <AskBox onAsk={onAsk} /> : setup}
      {recent}
    </Card>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: {
    marginBottom: 20,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: SPACING.md,
  },
  title: { ...TYPOGRAPHY.h3, color: colors.text },
  // The tour wraps the chip in a View; let it shrink so a long model name stays on one line inside the card.
  chipAnchor: { flexShrink: 1 },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexShrink: 1,
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipLabel: { ...TYPOGRAPHY.bodySmall, color: colors.text, flexShrink: 1 },
  askRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
  },
  askInput: {
    ...TYPOGRAPHY.body,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primary,
  },
});
